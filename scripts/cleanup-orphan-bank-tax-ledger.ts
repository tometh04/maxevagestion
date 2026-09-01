/**
 * Limpieza de impuestos Ley 25413 huérfanos en el mayor (VIB-138).
 *
 * Al borrar un pago, su ledger_movement del impuesto NO se borraba: el vínculo
 * es un marcador en las notas ("...vinculado a payment <id>...") y el cleanup
 * que lo usa solo corría en el PATCH. Quedaban movimientos con
 * affects_balance = true de pagos inexistentes, restando del saldo.
 *
 * A diferencia del bug de VIB-131 —donde el saldo siempre estuvo bien y solo
 * faltaba la fila en Caja—, estos SÍ afectan el saldo: son egresos fantasma.
 *
 * El fix del endpoint DELETE evita que aparezcan nuevos. Este script limpia los
 * que ya existen.
 *
 * ⚠️ BORRA movimientos del mayor. Corre en dry-run por defecto y solo escribe
 * con --apply. Cada borrado devuelve plata al saldo de la cuenta.
 *
 *   Dry-run (default):  npx tsx scripts/cleanup-orphan-bank-tax-ledger.ts
 *   Aplicar:            npx tsx scripts/cleanup-orphan-bank-tax-ledger.ts --apply
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const APPLY = process.argv.includes("--apply")
const PAYMENT_RE =
  /payment\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i

function money(n: number, currency = "ARS") {
  return `${currency} ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

async function main() {
  console.log("=".repeat(78))
  console.log(`IMPUESTOS Ley 25413 HUÉRFANOS EN EL MAYOR — ${APPLY ? "APLICANDO" : "DRY-RUN"}`)
  console.log("=".repeat(78))

  // 1. Todos los movimientos de impuesto del mayor
  const { data: taxRows, error } = await admin
    .from("ledger_movements")
    .select(
      "id, org_id, operation_id, account_id, concept, notes, amount_original, currency, movement_date, affects_balance"
    )
    .ilike("concept", "Imp. Ley 25413%")

  if (error) {
    console.error("Error leyendo ledger_movements:", error.message)
    process.exit(1)
  }

  const rows = taxRows ?? []
  console.log(`\nImpuestos en el mayor: ${rows.length}`)

  // 2. Qué pagos siguen existiendo
  const paymentIds = rows
    .map((r: any) => r.notes?.match(PAYMENT_RE)?.[1])
    .filter(Boolean) as string[]

  const alive = new Set<string>()
  const CHUNK = 200
  for (let i = 0; i < paymentIds.length; i += CHUNK) {
    const { data } = await admin
      .from("payments")
      .select("id")
      .in("id", paymentIds.slice(i, i + CHUNK))
    for (const p of data ?? []) alive.add((p as any).id)
  }

  // 3. Huérfanos = el pago del marcador ya no existe
  const orphans = rows.filter((r: any) => {
    const pid = r.notes?.match(PAYMENT_RE)?.[1]
    return pid && !alive.has(pid)
  })

  // Los que no tienen marcador NO se tocan: no se puede afirmar que sean huérfanos.
  const sinMarcador = rows.filter((r: any) => !r.notes?.match(PAYMENT_RE))

  console.log(`Pagos vivos: ${alive.size} / ${new Set(paymentIds).size}`)
  console.log(`Sin marcador en las notas (se dejan intactos): ${sinMarcador.length}`)
  console.log(`\nHuérfanos a borrar: ${orphans.length}`)

  if (orphans.length === 0) {
    console.log("\nNada que limpiar.")
    return
  }

  const totales = new Map<string, number>()
  const orgIds = [...new Set(orphans.map((o: any) => o.org_id).filter(Boolean))]
  const orgNames = new Map<string, string>()
  if (orgIds.length > 0) {
    const { data: orgs } = await admin.from("organizations").select("id, name").in("id", orgIds)
    for (const o of orgs ?? []) orgNames.set((o as any).id, (o as any).name)
  }

  console.log("-".repeat(78))
  for (const o of orphans as any[]) {
    const cur = o.currency ?? "ARS"
    totales.set(cur, (totales.get(cur) ?? 0) + Number(o.amount_original))
    console.log(
      `  ${String(o.movement_date).slice(0, 10)}  ${money(Number(o.amount_original), cur)}` +
        `  ${orgNames.get(o.org_id) ?? o.org_id}` +
        `  ${o.affects_balance ? "[afecta saldo]" : "[no afecta]"}`
    )
  }
  console.log("-".repeat(78))
  console.log(
    `Total que vuelve al saldo: ${[...totales.entries()].map(([c, v]) => money(v, c)).join("  |  ")}`
  )

  if (!APPLY) {
    console.log("\n" + "-".repeat(78))
    console.log("DRY-RUN: no se borró nada. Volvé a correr con --apply para aplicar.")
    console.log("-".repeat(78))
    return
  }

  console.log("\nBorrando...")
  let ok = 0
  const errores: string[] = []
  for (const o of orphans as any[]) {
    const { error: delError } = await admin.from("ledger_movements").delete().eq("id", o.id)
    if (delError) errores.push(`${o.id}: ${delError.message}`)
    else ok++
  }

  console.log(`\nBorrados: ${ok}`)
  if (errores.length > 0) {
    console.log(`Con error: ${errores.length}`)
    for (const e of errores.slice(0, 10)) console.log(`  ${e}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
