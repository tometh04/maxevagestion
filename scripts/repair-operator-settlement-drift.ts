/**
 * Repara el "settlement drift" de pagos a operadores: cuando un egreso a operador
 * está PAID pero no se reflejó en operator_payments.paid_amount, dejando saldo
 * pendiente fantasma ("figura pendiente al operador algo que ya está pago").
 *
 * Porta la MISMA lógica del endpoint sancionado app/api/payments/repair-operator-link
 * (Casos A y B) y el cálculo de buildOperatorPaymentUpdate de
 * lib/accounting/operator-payment-settlement.ts (topea paid_amount en [0, amount]).
 *
 *   Caso A: payments payer_type=OPERATOR, EXPENSE, PAID, operator_payment_id NULL
 *           → nunca aplicaron settlement. Se vinculan y se aplica el delta.
 *   Caso B: operator_payments cuya suma real de payments PAID vinculados supera
 *           su paid_amount → se re-aplica el delta faltante.
 *
 * SEGURO POR DEFECTO: read-only (dry-run). Solo escribe con --apply.
 * Requiere orgId explícito (no corre cross-org). Opcional: acotar a una operación.
 *
 * Uso:
 *   npx tsx scripts/repair-operator-settlement-drift.ts <orgId>                 # dry-run, toda la org
 *   npx tsx scripts/repair-operator-settlement-drift.ts <orgId> --operation=<opId>
 *   npx tsx scripts/repair-operator-settlement-drift.ts <orgId> --apply         # ESCRIBE
 *
 * Requiere SUPABASE_SERVICE_ROLE_KEY en .env.local.
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
const ORG_ID = args.find((a) => !a.startsWith("--")) || null
const OPERATION_ID = (args.find((a) => a.startsWith("--operation=")) || "").split("=")[1] || null

const MONEY_EPSILON = 0.005
const toMoney = (v: unknown) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}
const roundMoney = (v: number) => Math.round(v * 100) / 100

function parseDateOnly(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(value)
}
function getOpenStatus(dueDate: string | null): "PENDING" | "OVERDUE" {
  if (!dueDate) return "PENDING"
  const due = parseDateOnly(dueDate); due.setHours(0, 0, 0, 0)
  const now = new Date(); now.setHours(0, 0, 0, 0)
  return due < now ? "OVERDUE" : "PENDING"
}
// Espejo EXACTO de buildOperatorPaymentUpdate (lib/accounting/operator-payment-settlement.ts).
function buildUpdate(op: { amount: unknown; paid_amount: unknown; due_date: string | null }, delta: number, ledger: string | null) {
  const currentPaid = toMoney(op.paid_amount)
  const total = toMoney(op.amount)
  const nextPaid = roundMoney(Math.min(total, Math.max(0, currentPaid + delta)))
  const fullyPaid = nextPaid + MONEY_EPSILON >= total
  return {
    paid_amount: nextPaid,
    status: fullyPaid ? "PAID" : getOpenStatus(op.due_date),
    ledger_movement_id: fullyPaid ? ledger : null,
    updated_at: new Date().toISOString(),
  }
}

;(async () => {
  if (!ORG_ID) {
    console.error("Falta orgId. Uso: npx tsx scripts/repair-operator-settlement-drift.ts <orgId> [--operation=<id>] [--apply]")
    process.exit(1)
  }
  console.log(`\n=== Reparación settlement drift ${APPLY ? "(APPLY — ESCRIBE)" : "(DRY-RUN — solo lectura)"} ===`)
  console.log(`org=${ORG_ID}${OPERATION_ID ? `  operación=${OPERATION_ID}` : "  (toda la org)"}\n`)

  const nameCache = new Map<string, string>()
  const opNames = new Map<string, string>()
  {
    const { data } = await admin.from("operators").select("id, name").eq("org_id", ORG_ID).limit(5000)
    for (const o of data || []) nameCache.set((o as any).id, (o as any).name)
    const { data: ops } = await admin.from("operations").select("id, file_code").eq("org_id", ORG_ID).limit(20000)
    for (const o of ops || []) opNames.set((o as any).id, (o as any).file_code || (o as any).id.slice(0, 8))
  }
  const nm = (id: string | null) => (id ? `${nameCache.get(id) || "?"} [${String(id).slice(0, 8)}]` : "-")

  let fixedA = 0, fixedB = 0
  const errors: string[] = []

  // ── Caso A: egresos PAID sin operator_payment_id ──────────────────────────
  let qA = (admin.from("payments") as any)
    .select("id, operation_id, operator_id, amount, currency, ledger_movement_id")
    .eq("payer_type", "OPERATOR").eq("direction", "EXPENSE").eq("status", "PAID")
    .eq("org_id", ORG_ID).is("operator_payment_id", null)
  if (OPERATION_ID) qA = qA.eq("operation_id", OPERATION_ID)
  const { data: unlinked } = await qA

  console.log(`Caso A — egresos PAID sin vincular: ${(unlinked || []).length}`)
  for (const p of unlinked || []) {
    try {
      // buscar operator_payment pendiente de esa operación+operador (FIFO por vencimiento)
      const { data: cands } = await (admin.from("operator_payments") as any)
        .select("id, operation_id, operator_id, amount, paid_amount, due_date, status")
        .eq("operation_id", (p as any).operation_id)
        .eq("operator_id", (p as any).operator_id)
        .order("due_date", { ascending: true }).order("created_at", { ascending: true })
      const pending = (cands || []).filter((c: any) => toMoney(c.paid_amount) + MONEY_EPSILON < toMoney(c.amount))
      const target = pending.find((c: any) => Math.abs(toMoney(c.amount) - toMoney(c.paid_amount) - toMoney((p as any).amount)) <= MONEY_EPSILON) || pending[0]
      if (!target) { errors.push(`A: pago ${(p as any).id.slice(0, 8)} sin deuda pendiente para ${nm((p as any).operator_id)}`); continue }
      const upd = buildUpdate(target, toMoney((p as any).amount), (p as any).ledger_movement_id)
      console.log(`  op ${opNames.get((p as any).operation_id)}  ${nm((p as any).operator_id)}  vincular pago ${toMoney((p as any).amount)} → deuda [${target.id.slice(0, 8)}] paid ${toMoney(target.paid_amount)}→${upd.paid_amount} status ${target.status}→${upd.status}`)
      if (APPLY) {
        await (admin.from("payments") as any).update({ operator_payment_id: target.id }).eq("id", (p as any).id).eq("org_id", ORG_ID)
        const { error } = await (admin.from("operator_payments") as any).update(upd).eq("id", target.id).eq("org_id", ORG_ID)
        if (error) { errors.push(`A: update ${target.id.slice(0, 8)}: ${error.message}`); continue }
      }
      fixedA++
    } catch (e: any) { errors.push(`A: ${(p as any).id?.slice(0, 8)}: ${e.message}`) }
  }

  // ── Caso B: operator_payments con paid_amount < suma real de PAID vinculados ─
  let qB = (admin.from("operator_payments") as any)
    .select("id, operation_id, operator_id, amount, paid_amount, currency, due_date, status")
    .eq("org_id", ORG_ID)
  if (OPERATION_ID) qB = qB.eq("operation_id", OPERATION_ID)
  const { data: opays } = await qB

  console.log(`\nCaso B — deudas a revisar: ${(opays || []).length}`)
  for (const op of opays || []) {
    try {
      const { data: linked } = await (admin.from("payments") as any)
        .select("id, amount, ledger_movement_id, date_paid, created_at")
        .eq("operator_payment_id", (op as any).id).eq("status", "PAID").eq("org_id", ORG_ID)
      if (!linked || linked.length === 0) continue
      const actualPaid = linked.reduce((s: number, x: any) => s + toMoney(x.amount), 0)
      const delta = actualPaid - toMoney((op as any).paid_amount)
      if (delta <= MONEY_EPSILON) continue
      const latest = [...linked].sort((a: any, b: any) => new Date(b.date_paid || b.created_at).getTime() - new Date(a.date_paid || a.created_at).getTime())[0]
      const upd = buildUpdate(op, delta, latest?.ledger_movement_id ?? null)
      console.log(`  op ${opNames.get((op as any).operation_id)}  ${nm((op as any).operator_id)}  deuda [${(op as any).id.slice(0, 8)}]  paid ${toMoney((op as any).paid_amount)}→${upd.paid_amount} (real ${roundMoney(actualPaid)})  status ${(op as any).status}→${upd.status}`)
      if (APPLY) {
        const { error } = await (admin.from("operator_payments") as any).update(upd).eq("id", (op as any).id).eq("org_id", ORG_ID)
        if (error) { errors.push(`B: update ${(op as any).id.slice(0, 8)}: ${error.message}`); continue }
      }
      fixedB++
    } catch (e: any) { errors.push(`B: ${(op as any).id?.slice(0, 8)}: ${e.message}`) }
  }

  console.log(`\n=== Resumen ===`)
  console.log(`  Caso A (vincular + settlement): ${fixedA}`)
  console.log(`  Caso B (reconciliar paid_amount): ${fixedB}`)
  if (errors.length) { console.log(`  Errores/omitidos: ${errors.length}`); for (const e of errors.slice(0, 30)) console.log(`    - ${e}`) }
  if (!APPLY && (fixedA + fixedB) > 0) console.log(`\n  DRY-RUN. Para aplicar: agregá --apply a este mismo comando.`)
  console.log("")
})().catch((e) => { console.error("Error:", e); process.exit(1) })
