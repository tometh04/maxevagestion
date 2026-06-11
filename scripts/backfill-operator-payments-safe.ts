/**
 * Backfill SEGURO de operator_payments faltantes.
 * ================================================
 *
 * PROBLEMA: operaciones importadas que tienen costo de operador
 * (operation_operators.cost o operations.operator_cost) pero NINGÚN row en
 * operator_payments. Resultado en la UI:
 *   - El widget "Pendiente a Operador" cae al fallback (operator_cost − pagos)
 *     y muestra una deuda.
 *   - El dialog "Registrar Pago a Operador" lee SOLO operator_payments → vacío
 *     → "No hay deudas pendientes" y el botón queda deshabilitado.
 * (Ver CLAUDE.md: operator_payments es la ÚNICA fuente de verdad de deuda al
 * operador.)
 *
 * QUÉ HACE:
 *   - FASE 1 (segura): operaciones SIN pagos EXPENSE previos → crea
 *     operator_payments con paid_amount = 0.
 *   - FASE 2 (reconciliación): operaciones que YA tienen pagos EXPENSE PAID →
 *     crea operator_payments y setea paid_amount = min(amount, Σ pagos PAID),
 *     CAPEADO al monto de la deuda (nunca sobrepaga), status PAID/PENDING/OVERDUE,
 *     y vincula esos payments (operator_payment_id) para que una reconciliación
 *     posterior no los vuelva a sumar (no doble-conteo).
 *
 * GARANTÍAS DE SEGURIDAD (data sensible):
 *   - SOLO hace INSERT en operator_payments y UPDATE de payments.operator_payment_id
 *     (únicamente sobre payments cuyo operator_payment_id ya es NULL).
 *   - NUNCA modifica montos, NUNCA borra, NUNCA toca ledger_movements ni caja.
 *   - Idempotente: omite operaciones que ya tengan algún operator_payment.
 *   - Dry-run por defecto. Requiere --apply para escribir.
 *   - --org-id OBLIGATORIO (evita tocar otras orgs por accidente).
 *
 * ANOMALÍAS:
 *   - Si Σ pagos EXPENSE PAID > monto de la deuda, el costo importado parece
 *     incorrecto. Se CAPEA paid_amount al monto y se MARCA con flag ⚠ OVERPAID.
 *     Por defecto estas ops se OMITEN; usar --include-overpaid para incluirlas.
 *   - Operaciones multi-operador con pagos EXPENSE (payments sin operator_id →
 *     no se puede atribuir con certeza): se MARCAN ⚠ AMBIGUOUS y se OMITEN salvo
 *     --include-ambiguous.
 *
 * USO:
 *   npx tsx scripts/backfill-operator-payments-safe.ts --org-id=<uuid>                 # dry-run, fase 1+2
 *   npx tsx scripts/backfill-operator-payments-safe.ts --org-id=<uuid> --phase=1       # solo fase segura
 *   npx tsx scripts/backfill-operator-payments-safe.ts --org-id=<uuid> --operation-id=<uuid>
 *   npx tsx scripts/backfill-operator-payments-safe.ts --org-id=<uuid> --apply         # ejecuta
 *   npx tsx scripts/backfill-operator-payments-safe.ts --org-id=<uuid> --apply --include-overpaid
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const args = process.argv.slice(2)
const apply = args.includes("--apply")
const orgId = args.find((a) => a.startsWith("--org-id="))?.split("=")[1] || null
const opIdFilter = args.find((a) => a.startsWith("--operation-id="))?.split("=")[1] || null
const phaseArg = args.find((a) => a.startsWith("--phase="))?.split("=")[1] || "all"
const includeOverpaid = args.includes("--include-overpaid")
const includeAmbiguous = args.includes("--include-ambiguous")

const EPS = 0.005
const PAGE = 1000

function todayISO() {
  return new Date().toISOString().split("T")[0]
}
function parseDateOnly(v: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split("-").map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(v)
}
function statusFor(amount: number, paid: number, dueDate: string | null): "PENDING" | "PAID" | "OVERDUE" {
  if (paid + EPS >= amount) return "PAID"
  if (dueDate) {
    const due = parseDateOnly(dueDate); due.setHours(0, 0, 0, 0)
    const now = new Date(); now.setHours(0, 0, 0, 0)
    if (due < now) return "OVERDUE"
  }
  return "PENDING"
}

async function page<T>(tbl: string, sel: string, col: string, val: string): Promise<T[]> {
  const out: T[] = []
  let from = 0
  while (true) {
    const { data, error } = await admin.from(tbl).select(sel).eq(col, val).range(from, from + PAGE - 1)
    if (error) throw new Error(`${tbl}: ${error.message}`)
    if (!data || data.length === 0) break
    out.push(...(data as T[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return out
}

type PlannedDebt = {
  operation_id: string
  operator_id: string
  amount: number
  currency: string
  due_date: string
  paid_amount: number
  status: "PENDING" | "PAID" | "OVERDUE"
}
type Plan = {
  file_code: string
  phase: 1 | 2
  flag: "" | "OVERPAID" | "AMBIGUOUS"
  sumPaid: number
  totalAmount: number
  debts: PlannedDebt[]
  paymentIdsToLink: string[]
}

async function main() {
  console.log(`=== Backfill operator_payments SEGURO (${apply ? "APPLY" : "DRY-RUN"}) ===`)
  if (!orgId) {
    console.error("ERROR: --org-id=<uuid> es obligatorio.")
    process.exit(1)
  }
  console.log(`org_id=${orgId} | phase=${phaseArg} | includeOverpaid=${includeOverpaid} | includeAmbiguous=${includeAmbiguous}`)
  if (opIdFilter) console.log(`operation_id=${opIdFilter}`)

  // Carga
  let ops = await page<any>("operations", "id, file_code, operator_id, operator_cost, operator_cost_currency, departure_date, created_at", "org_id", orgId)
  if (opIdFilter) ops = ops.filter((o) => o.id === opIdFilter)
  const opOps = await page<any>("operation_operators", "operation_id, operator_id, cost, cost_currency", "org_id", orgId)
  const opPays = await page<any>("operator_payments", "operation_id", "org_id", orgId)
  const payments = await page<any>("payments", "id, operation_id, payer_type, direction, amount, status, operator_payment_id", "org_id", orgId)

  const hasOpPay = new Set(opPays.map((r) => r.operation_id))
  const ooByOp = new Map<string, any[]>()
  for (const r of opOps) {
    if (!(Number(r.cost) > 0)) continue
    const a = ooByOp.get(r.operation_id) || []; a.push(r); ooByOp.set(r.operation_id, a)
  }
  const expPaidPaymentsByOp = new Map<string, any[]>()
  for (const p of payments) {
    if (p.payer_type === "OPERATOR" && p.direction === "EXPENSE" && p.status === "PAID") {
      const a = expPaidPaymentsByOp.get(p.operation_id) || []; a.push(p); expPaidPaymentsByOp.set(p.operation_id, a)
    }
  }

  const plans: Plan[] = []
  for (const op of ops) {
    if (hasOpPay.has(op.id)) continue // idempotente: ya tiene operator_payments

    // Debts a crear: desde operation_operators (cost>0); fallback a operator_cost legacy
    let debtSources: Array<{ operator_id: string; cost: number; currency: string }> = []
    const oo = ooByOp.get(op.id) || []
    if (oo.length > 0) {
      debtSources = oo.map((r) => ({ operator_id: r.operator_id, cost: Number(r.cost), currency: r.cost_currency || op.operator_cost_currency || "USD" }))
    } else if (Number(op.operator_cost) > 0 && op.operator_id) {
      debtSources = [{ operator_id: op.operator_id, cost: Number(op.operator_cost), currency: op.operator_cost_currency || "USD" }]
    } else {
      continue // sin costo atribuible
    }

    const totalAmount = debtSources.reduce((s, d) => s + d.cost, 0)
    const expPays = expPaidPaymentsByOp.get(op.id) || []
    const sumPaid = expPays.reduce((s, p) => s + Number(p.amount || 0), 0)
    const phase: 1 | 2 = sumPaid > EPS ? 2 : 1

    if (phaseArg === "1" && phase !== 1) continue
    if (phaseArg === "2" && phase !== 2) continue

    let flag: Plan["flag"] = ""
    const distinctOperators = new Set(debtSources.map((d) => d.operator_id)).size
    if (phase === 2 && sumPaid > totalAmount + EPS) flag = "OVERPAID"
    if (phase === 2 && distinctOperators > 1) flag = "AMBIGUOUS" // payments sin operator_id → no atribuible

    const dueDate = op.departure_date || op.created_at?.split("T")[0] || todayISO()

    // Distribuir sumPaid (capeado) entre las deudas, en orden, llenando cada una.
    let remaining = Math.min(sumPaid, totalAmount)
    const debts: PlannedDebt[] = debtSources.map((d) => {
      const paid = Math.min(d.cost, Math.max(0, remaining))
      remaining = Math.round((remaining - paid) * 100) / 100
      return {
        operation_id: op.id,
        operator_id: d.operator_id,
        amount: Math.round(d.cost * 100) / 100,
        currency: d.currency,
        due_date: dueDate,
        paid_amount: Math.round(paid * 100) / 100,
        status: statusFor(d.cost, paid, dueDate),
      }
    })

    // Payments a vincular (solo los EXPENSE PAID actualmente sin link) — se vinculan
    // al primer operator_payment creado de la op (suficiente para que la
    // reconciliación futura vea paid_amount consistente y no re-aplique).
    const paymentIdsToLink = phase === 2 ? expPays.filter((p) => !p.operator_payment_id).map((p) => p.id) : []

    plans.push({ file_code: op.file_code, phase, flag, sumPaid, totalAmount, debts, paymentIdsToLink })
  }

  // Reporte
  const phase1 = plans.filter((p) => p.phase === 1)
  const phase2clean = plans.filter((p) => p.phase === 2 && p.flag === "")
  const phase2flagged = plans.filter((p) => p.phase === 2 && p.flag !== "")

  const willApply = (p: Plan) =>
    p.flag === "" ||
    (p.flag === "OVERPAID" && includeOverpaid) ||
    (p.flag === "AMBIGUOUS" && includeAmbiguous)

  const show = (title: string, list: Plan[]) => {
    console.log(`\n— ${title}: ${list.length} ops —`)
    console.table(
      list.slice(0, 30).map((p) => ({
        file: p.file_code,
        debts: p.debts.length,
        amount: p.totalAmount,
        sumPaid: Math.round(p.sumPaid * 100) / 100,
        paid_set: p.debts.reduce((s, d) => s + d.paid_amount, 0),
        status: p.debts.map((d) => d.status).join(","),
        link: p.paymentIdsToLink.length,
        flag: p.flag || "-",
        apply: willApply(p) ? "✓" : "SKIP",
      }))
    )
    if (list.length > 30) console.log(`  (... ${list.length - 30} más)`)
  }

  show("FASE 1 (segura, paid_amount=0)", phase1)
  show("FASE 2 (reconciliación limpia)", phase2clean)
  if (phase2flagged.length) show("FASE 2 ⚠ FLAGGED (costo importado sospechoso / ambiguo)", phase2flagged)

  const toApply = plans.filter(willApply)
  const totalInserts = toApply.reduce((s, p) => s + p.debts.length, 0)
  const totalLinks = toApply.reduce((s, p) => s + p.paymentIdsToLink.length, 0)
  console.log(`\n=== Plan ===`)
  console.log(`Ops a procesar: ${toApply.length} (de ${plans.length} detectadas)`)
  console.log(`operator_payments a INSERTAR: ${totalInserts}`)
  console.log(`payments a VINCULAR (operator_payment_id): ${totalLinks}`)
  if (phase2flagged.length && !includeOverpaid && !includeAmbiguous) {
    console.log(`⚠ ${phase2flagged.length} ops FLAGGED omitidas. Revisalas; usá --include-overpaid / --include-ambiguous para incluirlas.`)
  }

  if (!apply) {
    console.log(`\n(DRY-RUN — usá --apply para ejecutar)`)
    return
  }

  // APPLY
  let okOps = 0, insErr = 0, linkErr = 0, insOk = 0, linkOk = 0
  for (const p of toApply) {
    let firstId: string | null = null
    let opFailed = false
    for (const d of p.debts) {
      const { data, error } = await (admin.from("operator_payments") as any)
        .insert({
          operation_id: d.operation_id,
          operator_id: d.operator_id,
          amount: d.amount,
          currency: d.currency,
          due_date: d.due_date,
          status: d.status,
          paid_amount: d.paid_amount,
          org_id: orgId,
          notes: `Backfill operator_payments (deuda no generada en import). Fase ${p.phase}.`,
        })
        .select("id")
        .single()
      if (error) { console.error(`✗ insert [${p.file_code}]: ${error.message}`); insErr++; opFailed = true; break }
      insOk++
      if (!firstId) firstId = data.id
    }
    if (opFailed || !firstId) continue
    // Vincular payments al primer operator_payment (solo los que siguen sin link)
    for (const pid of p.paymentIdsToLink) {
      const { error } = await (admin.from("payments") as any)
        .update({ operator_payment_id: firstId })
        .eq("id", pid)
        .eq("org_id", orgId)
        .is("operator_payment_id", null)
      if (error) { console.error(`✗ link payment ${pid} [${p.file_code}]: ${error.message}`); linkErr++ }
      else linkOk++
    }
    okOps++
  }

  console.log(`\n=== Resultado ===`)
  console.log(`Ops procesadas OK: ${okOps}`)
  console.log(`operator_payments insertados: ${insOk} (errores: ${insErr})`)
  console.log(`payments vinculados: ${linkOk} (errores: ${linkErr})`)
}

main().catch((e) => { console.error("FATAL:", e?.message || e); process.exit(1) })
