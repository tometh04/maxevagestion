/**
 * Auditoría del impuesto Ley 25413 sin movimiento de caja (READ-ONLY) — VIB-131.
 *
 * El bug: al registrar un pago con impuesto a débitos/créditos bancarios, el
 * endpoint crea DOS cosas para el impuesto:
 *
 *   1. un `ledger_movement` EXPENSE  → funciona siempre
 *   2. un `cash_movement`  EXPENSE   → se inserta con el MISMO `payment_id` que
 *      el movimiento de caja principal del pago
 *
 * Pero existe el índice único parcial `cash_movements_payment_id_unique` sobre
 * `payment_id`, así que el segundo insert viola la restricción. El error queda
 * atrapado en un `try/catch` que solo hace console.error ("No romper el flujo
 * principal"), de modo que el impuesto SÍ pega en el ledger pero NO en caja, en
 * silencio.
 *
 * Este script mide el agujero: cuántos impuestos hay en el ledger sin su
 * contraparte en caja, por cuánta plata y de qué organizaciones.
 *
 * NO escribe nada.
 *
 * Run: npx tsx scripts/audit-bank-tax-cash-movements.ts
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const LEY_25413_CONCEPT = "Imp. Ley 25413%"

type LedgerRow = {
  id: string
  org_id: string | null
  operation_id: string | null
  concept: string | null
  amount_original: number | null
  amount_ars_equivalent: number | null
  currency: string | null
  movement_date: string | null
  notes: string | null
  created_at: string | null
}

function money(n: number, currency = "ARS") {
  return `${currency} ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

async function main() {
  console.log("=".repeat(78))
  console.log("AUDITORÍA — Impuesto Ley 25413 sin movimiento de caja (VIB-131)")
  console.log("=".repeat(78))

  // 1. Todos los movimientos de ledger del impuesto (la parte que SÍ funciona)
  const ledgerRows: LedgerRow[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("ledger_movements")
      .select(
        "id, org_id, operation_id, concept, amount_original, amount_ars_equivalent, currency, movement_date, notes, created_at"
      )
      .ilike("concept", LEY_25413_CONCEPT)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1)

    if (error) {
      console.error("Error leyendo ledger_movements:", error.message)
      process.exit(1)
    }
    if (!data || data.length === 0) break
    ledgerRows.push(...(data as LedgerRow[]))
    if (data.length < PAGE) break
  }

  // 2. Movimientos de caja del impuesto (la parte que falla)
  const { data: cashRows, error: cashError } = await admin
    .from("cash_movements")
    .select("id, org_id, payment_id, amount, currency, movement_date, notes")
    .eq("category", "BANK_TAX")

  if (cashError) {
    console.error("Error leyendo cash_movements:", cashError.message)
    process.exit(1)
  }

  const cashCount = cashRows?.length ?? 0

  console.log("")
  console.log(`Impuestos registrados en el LEDGER : ${ledgerRows.length}`)
  console.log(`Impuestos registrados en CAJA      : ${cashCount}`)
  console.log(`Faltantes en caja                  : ${ledgerRows.length - cashCount}`)

  if (ledgerRows.length === 0) {
    console.log("\nNo hay impuestos Ley 25413 registrados. Nada que auditar.")
    return
  }

  // 3. Emparejar por payment_id: el ledger deja el payment en las notas
  //    ("...vinculado a payment <uuid>...").
  const cashByPayment = new Set(
    (cashRows ?? []).map((c: any) => c.payment_id).filter(Boolean)
  )

  const orphans: LedgerRow[] = []
  for (const row of ledgerRows) {
    const match = row.notes?.match(
      /payment\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
    )
    const paymentId = match?.[1] ?? null
    if (!paymentId || !cashByPayment.has(paymentId)) orphans.push(row)
  }

  // 4. Agrupar por organización y moneda
  const byOrg = new Map<string, { count: number; byCurrency: Map<string, number> }>()
  for (const row of orphans) {
    const org = row.org_id ?? "(sin org)"
    if (!byOrg.has(org)) byOrg.set(org, { count: 0, byCurrency: new Map() })
    const entry = byOrg.get(org)!
    entry.count++
    const cur = row.currency ?? "ARS"
    entry.byCurrency.set(cur, (entry.byCurrency.get(cur) ?? 0) + Number(row.amount_original ?? 0))
  }

  // Nombres de las orgs para que el reporte se lea
  const orgIds = [...byOrg.keys()].filter((id) => id !== "(sin org)")
  const orgNames = new Map<string, string>()
  if (orgIds.length > 0) {
    const { data: orgs } = await admin.from("organizations").select("id, name").in("id", orgIds)
    for (const o of orgs ?? []) orgNames.set((o as any).id, (o as any).name)
  }

  console.log("")
  console.log("-".repeat(78))
  console.log(`IMPUESTOS EN EL LEDGER SIN MOVIMIENTO DE CAJA: ${orphans.length}`)
  console.log("-".repeat(78))

  for (const [orgId, entry] of [...byOrg.entries()].sort((a, b) => b[1].count - a[1].count)) {
    const name = orgNames.get(orgId) ?? orgId
    const montos = [...entry.byCurrency.entries()]
      .map(([cur, total]) => money(total, cur))
      .join("  |  ")
    console.log(`  ${name}`)
    console.log(`     ${entry.count} movimientos — ${montos}`)
  }

  // 5. Ventana temporal, para saber desde cuándo viene pasando
  const dates = orphans
    .map((r) => r.movement_date ?? r.created_at?.slice(0, 10))
    .filter(Boolean)
    .sort() as string[]

  if (dates.length > 0) {
    console.log("")
    console.log(`Primer caso : ${dates[0]}`)
    console.log(`Último caso : ${dates[dates.length - 1]}`)
  }

  console.log("")
  console.log("-".repeat(78))
  console.log("LECTURA")
  console.log("-".repeat(78))
  if (orphans.length === ledgerRows.length && ledgerRows.length > 0) {
    console.log("  FALLA SISTEMÁTICA: NINGÚN impuesto llegó a caja.")
    console.log("  Coincide con el diagnóstico: el movimiento principal del pago ya")
    console.log("  ocupa el payment_id, así que el insert del impuesto viola el índice")
    console.log("  único SIEMPRE, y el error se traga en el try/catch.")
  } else if (orphans.length > 0) {
    console.log("  FALLA PARCIAL: algunos impuestos llegaron a caja y otros no.")
  } else {
    console.log("  Sin faltantes: todos los impuestos tienen su movimiento de caja.")
  }
  console.log("")
  console.log("  Impacto: la plata del impuesto SÍ salió (está en el ledger y afecta")
  console.log("  el saldo), pero no aparece como egreso en la vista de Caja.")
  console.log("")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
