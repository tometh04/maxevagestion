/**
 * Mueve un monto pagado (settlement) de una deuda de operador (operator_payment)
 * a OTRA deuda de la MISMA operación. Sirve para el caso "el pago se imputó a la
 * pata equivocada del mismo operador" (ej: un operador con 2 servicios donde el
 * pago cayó en la pata grande en vez de la chica).
 *
 * Hace, de forma consistente:
 *   1. Re-vincula el/los payment(s) PAID de la deuda ORIGEN (operator_payment_id)
 *      cuyo monto coincide con el monto a mover → a la deuda DESTINO. (Para que
 *      una re-sincronización futura no vuelva a mover el pago a la pata vieja.)
 *   2. Recalcula paid_amount en ambas deudas con la MISMA fórmula que el sistema
 *      (buildOperatorPaymentUpdate): topea en [0, amount], setea status PAID si
 *      queda saldada.
 *
 * SEGURO POR DEFECTO: dry-run. Solo escribe con --apply.
 * Guardas: el monto a mover no puede superar el paid de ORIGEN ni el pendiente de
 * DESTINO; ambas deudas deben ser de la misma operación y del mismo operador.
 *
 * Uso (prefijos de id de deuda dentro de la operación):
 *   npx tsx scripts/move-operator-payment-settlement.ts --operation=<opId> --from=<prefDeudaOrigen> --to=<prefDeudaDestino> --amount=<n>
 *   ... agregar --apply para escribir.
 *
 * Caso op #3bafdfff (mover 8 de FTA-1451.44 a FTA-8):
 *   npx tsx scripts/move-operator-payment-settlement.ts --operation=3bafdfff-3a48-43e7-94f0-691e9a4324ba --from=ecb4b587 --to=e51dd962 --amount=8
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
const val = (k: string) => (args.find((a) => a.startsWith(`--${k}=`)) || "").split("=")[1] || null
const OPERATION_ID = val("operation")
const FROM = val("from")
const TO = val("to")
const AMOUNT = Number(val("amount"))

const EPS = 0.005
const toMoney = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0 }
const round2 = (v: number) => Math.round(v * 100) / 100
function parseDateOnly(v: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { const [y, m, d] = v.split("-").map(Number); return new Date(y, m - 1, d) }
  return new Date(v)
}
function openStatus(due: string | null): "PENDING" | "OVERDUE" {
  if (!due) return "PENDING"
  const d = parseDateOnly(due); d.setHours(0, 0, 0, 0)
  const n = new Date(); n.setHours(0, 0, 0, 0)
  return d < n ? "OVERDUE" : "PENDING"
}
// Espejo de buildOperatorPaymentUpdate (lib/accounting/operator-payment-settlement.ts).
function buildUpdate(op: any, delta: number, ledger: string | null) {
  const nextPaid = round2(Math.min(toMoney(op.amount), Math.max(0, toMoney(op.paid_amount) + delta)))
  const fullyPaid = nextPaid + EPS >= toMoney(op.amount)
  return { paid_amount: nextPaid, status: fullyPaid ? "PAID" : openStatus(op.due_date), ledger_movement_id: fullyPaid ? ledger : null, updated_at: new Date().toISOString() }
}

;(async () => {
  if (!OPERATION_ID || !FROM || !TO || !Number.isFinite(AMOUNT) || AMOUNT <= 0) {
    console.error("Uso: --operation=<opId> --from=<prefOrigen> --to=<prefDestino> --amount=<n> [--apply]")
    process.exit(1)
  }
  const { data: debts } = await admin.from("operator_payments").select("*").eq("operation_id", OPERATION_ID)
  const from = (debts || []).find((d: any) => d.id.startsWith(FROM))
  const to = (debts || []).find((d: any) => d.id.startsWith(TO))
  if (!from) { console.error(`No se encontró deuda origen con prefijo ${FROM}`); process.exit(1) }
  if (!to) { console.error(`No se encontró deuda destino con prefijo ${TO}`); process.exit(1) }

  console.log(`\n=== ${APPLY ? "MOVER (APPLY)" : "DRY-RUN"} settlement en op ${OPERATION_ID.slice(0, 8)} ===\n`)
  console.log(`ORIGEN  [${from.id.slice(0, 8)}] operator=${from.operator_id.slice(0, 8)} amount=${toMoney(from.amount)} paid=${toMoney(from.paid_amount)} status=${from.status}`)
  console.log(`DESTINO [${to.id.slice(0, 8)}] operator=${to.operator_id.slice(0, 8)} amount=${toMoney(to.amount)} paid=${toMoney(to.paid_amount)} status=${to.status}`)
  console.log(`Monto a mover: ${AMOUNT}\n`)

  // Guardas
  if (from.operator_id !== to.operator_id) { console.error("❌ Las deudas son de operadores distintos; abortar (esto es solo para patas del MISMO operador)."); process.exit(1) }
  if (toMoney(from.paid_amount) + EPS < AMOUNT) { console.error(`❌ ORIGEN tiene paid=${toMoney(from.paid_amount)} < monto a mover ${AMOUNT}.`); process.exit(1) }
  if (toMoney(to.paid_amount) + AMOUNT > toMoney(to.amount) + EPS) { console.error(`❌ DESTINO quedaría sobrepagado (paid ${toMoney(to.paid_amount)} + ${AMOUNT} > amount ${toMoney(to.amount)}).`); process.exit(1) }

  // Buscar payment(s) PAID vinculados a ORIGEN cuyo monto coincide con el monto a mover.
  const { data: linked } = await admin.from("payments").select("id, amount, status, ledger_movement_id, operator_payment_id").eq("operator_payment_id", from.id).eq("status", "PAID")
  const movable = (linked || []).filter((p: any) => Math.abs(toMoney(p.amount) - AMOUNT) <= EPS)
  console.log(`Payments PAID vinculados a ORIGEN con monto ${AMOUNT}: ${movable.length}` + ((linked || []).length ? `  (total vinculados a ORIGEN: ${(linked || []).length})` : ""))
  for (const p of movable) console.log(`   payment [${p.id.slice(0, 8)}] amount=${toMoney(p.amount)} → re-vincular a DESTINO`)
  const ledgerForDest = movable[0]?.ledger_movement_id ?? null

  const updFrom = buildUpdate(from, -AMOUNT, from.ledger_movement_id)
  const updTo = buildUpdate(to, +AMOUNT, ledgerForDest)
  console.log(`\nPlan:`)
  console.log(`  ORIGEN  paid ${toMoney(from.paid_amount)} → ${updFrom.paid_amount}   status ${from.status} → ${updFrom.status}`)
  console.log(`  DESTINO paid ${toMoney(to.paid_amount)} → ${updTo.paid_amount}   status ${to.status} → ${updTo.status}`)

  if (!APPLY) { console.log(`\nDRY-RUN. Agregá --apply para escribir.\n`); return }

  // Aplicar: re-vincular payment(s), luego actualizar ambas deudas.
  for (const p of movable) {
    const { error } = await admin.from("payments").update({ operator_payment_id: to.id }).eq("id", p.id)
    if (error) { console.error(`ERROR re-vinculando payment ${p.id.slice(0, 8)}: ${error.message}`); process.exit(1) }
  }
  const { error: e1 } = await admin.from("operator_payments").update(updFrom).eq("id", from.id).eq("org_id", from.org_id)
  if (e1) { console.error(`ERROR actualizando ORIGEN: ${e1.message}`); process.exit(1) }
  const { error: e2 } = await admin.from("operator_payments").update(updTo).eq("id", to.id).eq("org_id", to.org_id)
  if (e2) { console.error(`ERROR actualizando DESTINO: ${e2.message}`); process.exit(1) }
  console.log(`\n✓ Aplicado: ${movable.length} payment(s) re-vinculado(s), 2 deudas actualizadas.\n`)
})().catch((e) => { console.error("Error:", e); process.exit(1) })
