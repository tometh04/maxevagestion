/**
 * Backfill de los movimientos de caja del impuesto Ley 25413 — VIB-131.
 *
 * Contexto: por el bug del índice único (ver
 * scripts/audit-bank-tax-cash-movements.ts), el impuesto quedó registrado en el
 * ledger pero nunca en caja. El saldo de las cuentas SIEMPRE estuvo bien —lo
 * calcula `ledger_movements`—; lo que faltaba era la fila en el listado de Caja
 * y su cómputo en el Reporte de Gastos.
 *
 * DECISIÓN (2026-08-18): se cargan SOLO los de agosto 2026, el mes abierto.
 * Junio y julio ya fueron revisados/cerrados con el cliente y no se tocan; su
 * brecha queda documentada en la issue.
 *
 * Reconstruye cada cash_movement desde su ledger_movement, que tiene todo lo
 * necesario (monto, moneda, fecha, cuenta, operación, usuario).
 *
 * Es idempotente: saltea los pagos que ya tienen su movimiento de caja del
 * impuesto.
 *
 * REQUIERE la migración 20260818000002 aplicada (índice (payment_id, category)).
 * Sin ella los inserts fallan por duplicate key.
 *
 *   Dry-run (default):  npx tsx scripts/backfill-bank-tax-cash-movements.ts
 *   Aplicar:            npx tsx scripts/backfill-bank-tax-cash-movements.ts --apply
 *   Otro mes:           ... --from 2026-08-01 --to 2026-09-01
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const args = process.argv.slice(2)
const APPLY = args.includes("--apply")
const argValue = (name: string, fallback: string) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const FROM = argValue("--from", "2026-08-01")
const TO = argValue("--to", "2026-09-01")

const PAYMENT_RE =
  /payment\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i

function money(n: number, currency = "ARS") {
  return `${currency} ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

async function main() {
  console.log("=".repeat(78))
  console.log(`BACKFILL impuesto Ley 25413 en caja — ${APPLY ? "APLICANDO" : "DRY-RUN"}`)
  console.log(`Ventana: ${FROM} (inclusive) → ${TO} (exclusive)`)
  console.log("=".repeat(78))

  // 1. Impuestos registrados en el ledger dentro de la ventana
  const { data: ledgerRows, error: ledgerError } = await admin
    .from("ledger_movements")
    .select(
      "id, org_id, operation_id, account_id, concept, notes, amount_original, currency, movement_date, created_by"
    )
    .ilike("concept", "Imp. Ley 25413%")
    .gte("movement_date", FROM)
    .lt("movement_date", TO)
    .order("movement_date", { ascending: true })

  if (ledgerError) {
    console.error("Error leyendo ledger_movements:", ledgerError.message)
    process.exit(1)
  }

  const rows = ledgerRows ?? []
  console.log(`\nImpuestos en el ledger en la ventana: ${rows.length}`)

  if (rows.length === 0) {
    console.log("Nada que hacer.")
    return
  }

  // 2. Cuáles ya tienen su movimiento de caja (idempotencia)
  const paymentIds = rows
    .map((r: any) => r.notes?.match(PAYMENT_RE)?.[1])
    .filter(Boolean) as string[]

  const { data: existing } = await admin
    .from("cash_movements")
    .select("payment_id")
    .eq("category", "BANK_TAX")
    .in("payment_id", paymentIds.length > 0 ? paymentIds : ["00000000-0000-0000-0000-000000000000"])

  const alreadyDone = new Set((existing ?? []).map((c: any) => c.payment_id))

  // 3. agency_id: lo tomamos de la operación (el trigger de cash_movements
  //    también lo autocompleta, pero lo seteamos explícito para no depender).
  const operationIds = [...new Set(rows.map((r: any) => r.operation_id).filter(Boolean))]
  const agencyByOperation = new Map<string, string | null>()
  if (operationIds.length > 0) {
    const { data: ops } = await admin
      .from("operations")
      .select("id, agency_id")
      .in("id", operationIds)
    for (const op of ops ?? []) agencyByOperation.set((op as any).id, (op as any).agency_id)
  }

  const toInsert: any[] = []
  const skipped: string[] = []

  for (const row of rows as any[]) {
    const paymentId = row.notes?.match(PAYMENT_RE)?.[1] ?? null

    if (!paymentId) {
      skipped.push(`${row.id} — sin marcador de payment en las notas`)
      continue
    }
    if (alreadyDone.has(paymentId)) {
      skipped.push(`${row.id} — el pago ${paymentId.slice(0, 8)} ya tiene su movimiento`)
      continue
    }

    toInsert.push({
      operation_id: row.operation_id || null,
      payment_id: paymentId,
      ledger_movement_id: row.id,
      cash_box_id: null,
      financial_account_id: row.account_id,
      user_id: row.created_by,
      type: "EXPENSE",
      category: "BANK_TAX",
      amount: Number(row.amount_original),
      currency: row.currency,
      movement_date: row.movement_date,
      notes: row.concept,
      is_touristic: false,
      agency_id: row.operation_id ? agencyByOperation.get(row.operation_id) ?? null : null,
      // Con service role no hay auth.uid(), así que el trigger de org_id no
      // puede resolverlo: lo seteamos explícito desde el ledger_movement.
      org_id: row.org_id,
    })
  }

  // 4. Resumen
  const totals = new Map<string, number>()
  for (const m of toInsert) totals.set(m.currency, (totals.get(m.currency) ?? 0) + m.amount)

  console.log(`Ya tenían su movimiento / sin marcador: ${skipped.length}`)
  console.log(`A crear: ${toInsert.length}`)
  if (totals.size > 0) {
    console.log(
      `Total: ${[...totals.entries()].map(([c, v]) => money(v, c)).join("  |  ")}`
    )
  }

  if (toInsert.length === 0) {
    console.log("\nNada para insertar.")
    return
  }

  console.log("\nPrimeros movimientos a crear:")
  for (const m of toInsert.slice(0, 5)) {
    console.log(
      `  ${m.movement_date}  ${money(m.amount, m.currency)}  pago ${String(m.payment_id).slice(0, 8)}  ${m.notes}`
    )
  }
  if (toInsert.length > 5) console.log(`  ... y ${toInsert.length - 5} más`)

  if (!APPLY) {
    console.log("\n" + "-".repeat(78))
    console.log("DRY-RUN: no se escribió nada. Volvé a correr con --apply para aplicar.")
    console.log("-".repeat(78))
    return
  }

  // 5. Aplicar
  console.log("\nInsertando...")
  let ok = 0
  const failures: string[] = []

  for (const movement of toInsert) {
    const { error } = await admin.from("cash_movements").insert(movement)
    if (error) {
      failures.push(`pago ${String(movement.payment_id).slice(0, 8)}: ${error.message}`)
    } else {
      ok++
    }
  }

  console.log(`\nCreados: ${ok}`)
  if (failures.length > 0) {
    console.log(`Fallidos: ${failures.length}`)
    for (const f of failures.slice(0, 10)) console.log(`  ${f}`)
    if (failures.some((f) => /duplicate key|unique/i.test(f))) {
      console.log("\n  ⚠️  Hay errores de clave duplicada: falta aplicar la migración")
      console.log("      20260818000002 (índice (payment_id, category)).")
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
