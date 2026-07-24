/**
 * Repair op #68f9b7aa (Lozada VG / AMICHI): registrar el pago al operador creó
 * una deuda DUPLICADA (dos operator_payments de 3.336.173,31 c/u para una sola
 * pata de 3.336.173,31), doblando el "Pendiente a Operador" a 6.672.346,62.
 *
 * Deja UNA sola deuda (la de fecha real 2026-10-07), le imputa el pago de
 * 2.120.000, re-linkea el pago y borra el duplicado. También limpia el
 * amount_usd/tc=1 basura del pago (pago ARS contra deuda ARS: no hay conversión).
 *
 * Dry-run por defecto. Aplicar con:  npx tsx scripts/fix-op-68f9b7aa-duplicate-operator-debt.ts --apply
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const APPLY = process.argv.includes("--apply")
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const OP_ID = "68f9b7aa-0023-41b0-b164-77ddb47b9b0a"
const OPERATOR_ID = "bacd13a1-7d5d-4dd5-a82d-6f075fc9d0ad"

const log = (...a: any[]) => console.log(...a)

;(async () => {
  log(`\n=== Repair op ${OP_ID} — ${APPLY ? "APPLY" : "DRY-RUN"} ===\n`)

  const { data: debts } = await admin
    .from("operator_payments")
    .select("id, amount, paid_amount, currency, status, due_date, created_at")
    .eq("operation_id", OP_ID)
    .eq("operator_id", OPERATOR_ID)
    .order("created_at", { ascending: true })

  log("operator_payments actuales:")
  console.table((debts || []).map((d: any) => ({ id: String(d.id).slice(0, 8), amount: d.amount, paid: d.paid_amount, due: d.due_date, status: d.status })))

  if (!debts || debts.length <= 1) {
    log("→ Ya hay 1 (o 0) deuda para el operador. Nada que consolidar. Fin.")
    return
  }
  if (debts.length !== 2) {
    log(`→ Se esperaban 2 deudas, hay ${debts.length}. Abortando por seguridad (revisar a mano).`)
    return
  }

  // keep = la de fecha acordada real (2026-10-07); dup = la que creó el pago (vence hoy / 24-07)
  const keep = debts.find((d: any) => d.due_date === "2026-10-07")
  const dup = debts.find((d: any) => d.id !== keep?.id)
  if (!keep || !dup) {
    log("→ No pude identificar keep/dup por due_date. Abortando (revisar a mano).")
    return
  }
  // Sanity: ambas deben tener el mismo amount (la duplicación es del costo completo)
  if (Math.abs(Number(keep.amount) - Number(dup.amount)) > 0.01) {
    log(`→ Los amounts difieren (keep=${keep.amount}, dup=${dup.amount}). Abortando (no es el caso de duplicación simple).`)
    return
  }

  // Pagos ligados al duplicado
  const { data: linkedPayments } = await admin
    .from("payments")
    .select("id, amount, currency, exchange_rate, amount_usd, ledger_movement_id, status")
    .eq("operation_id", OP_ID)
    .eq("operator_payment_id", dup.id)

  const totalPaidOnDup = Number(dup.paid_amount || 0)

  log(`\nPlan:`)
  log(`  KEEP deuda ${String(keep.id).slice(0, 8)} (vence ${keep.due_date}): paid_amount ${keep.paid_amount} → ${totalPaidOnDup}`)
  log(`  RELINK ${(linkedPayments || []).length} pago(s) ${(linkedPayments || []).map((p: any) => String(p.id).slice(0, 8)).join(", ")} → deuda ${String(keep.id).slice(0, 8)}`)
  log(`  LIMPIAR tc/amount_usd basura en esos pagos (ARS vs deuda ARS, sin conversión)`)
  log(`  DELETE deuda duplicada ${String(dup.id).slice(0, 8)} (vence ${dup.due_date}, paid ${dup.paid_amount})`)
  log(`  Estado final esperado: 1 deuda de ${keep.amount}, pagado ${totalPaidOnDup}, pendiente ${Number(keep.amount) - totalPaidOnDup}`)

  if (!APPLY) {
    log(`\n(DRY-RUN — no se escribió nada. Correr con --apply para aplicar.)`)
    return
  }

  // 1) Imputar el pago a la deuda que conservamos
  const keepPending = Number(keep.amount) - totalPaidOnDup
  const keepFullyPaid = keepPending <= 0.005
  const { error: eKeep } = await (admin.from("operator_payments") as any)
    .update({
      paid_amount: totalPaidOnDup,
      status: keepFullyPaid ? "PAID" : "PENDING",
      updated_at: new Date().toISOString(),
    })
    .eq("id", keep.id)
  if (eKeep) throw new Error(`update keep: ${eKeep.message}`)

  // 2) Re-linkear los pagos al operador y limpiar tc/amount_usd basura
  for (const p of linkedPayments || []) {
    const isArsNoConversion = (p.currency === "ARS") && Number(p.exchange_rate) === 1
    const { error: ePay } = await (admin.from("payments") as any)
      .update({
        operator_payment_id: keep.id,
        ...(isArsNoConversion ? { exchange_rate: null, amount_usd: null } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", p.id)
    if (ePay) throw new Error(`relink payment ${p.id}: ${ePay.message}`)

    // Limpiar tc=1 en el ledger_movement asociado (amount_ars_equivalent ya es correcto)
    if (isArsNoConversion && p.ledger_movement_id) {
      await (admin.from("ledger_movements") as any)
        .update({ exchange_rate: null })
        .eq("id", p.ledger_movement_id)
        .eq("exchange_rate", 1)
    }
  }

  // 3) Borrar la deuda duplicada
  const { error: eDel } = await (admin.from("operator_payments") as any).delete().eq("id", dup.id)
  if (eDel) throw new Error(`delete dup: ${eDel.message}`)

  // 4) Verificación
  const { data: after } = await admin
    .from("operator_payments")
    .select("id, amount, paid_amount, status, due_date")
    .eq("operation_id", OP_ID)
    .eq("operator_id", OPERATOR_ID)
  log(`\n✅ Aplicado. Estado final:`)
  console.table((after || []).map((d: any) => ({ id: String(d.id).slice(0, 8), amount: d.amount, paid: d.paid_amount, pending: Number(d.amount) - Number(d.paid_amount), due: d.due_date, status: d.status })))
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1) })
