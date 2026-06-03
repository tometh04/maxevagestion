/**
 * Audit cross-org: detecta drift entre operator_payments.amount y el costo
 * real de la operación (operation_operators.cost o operations.operator_cost
 * cuando no hay rows en operation_operators).
 *
 * Solo reporta drift donde paid_amount = 0 — esos son arreglables. Drift
 * con paid_amount > 0 es histórico legítimo (el costo cambió después de
 * pagos parciales y no se debe sobreescribir).
 *
 * Run:
 *   npx tsx scripts/audit-operator-payment-drift.ts
 *   npx tsx scripts/audit-operator-payment-drift.ts --org-id <uuid>
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const args = process.argv.slice(2)
const orgArg = args.find((a) => a.startsWith("--org-id="))
const orgIdFilter = orgArg ? orgArg.split("=")[1] : null

const EPS = 0.01

type Row = {
  org_id: string
  org_name: string
  operation_id: string
  file_code: string | null
  operator_payment_id: string
  operator_id: string
  operator_name: string | null
  current_amount: number
  expected_cost: number
  drift: number
  currency: string
  source: "operation_operators" | "operations.operator_cost"
}

;(async () => {
  console.log("=== Audit operator_payments drift ===")
  if (orgIdFilter) console.log(`Filtrando por org_id=${orgIdFilter}`)

  // 1) Cargar todos los operator_payments PENDING/OVERDUE con paid_amount = 0
  let opPayQuery = admin
    .from("operator_payments")
    .select("id, operation_id, operator_id, amount, currency, paid_amount, status, org_id")
    .in("status", ["PENDING", "OVERDUE"])
    .eq("paid_amount", 0)
    .not("operation_id", "is", null)

  if (orgIdFilter) opPayQuery = opPayQuery.eq("org_id", orgIdFilter)

  const { data: opPays, error: opPayErr } = await opPayQuery
  if (opPayErr) {
    console.error("Error cargando operator_payments:", opPayErr)
    return
  }
  console.log(`\nTotal operator_payments PENDING/OVERDUE con paid_amount=0: ${(opPays || []).length}`)

  if (!opPays || opPays.length === 0) return

  // 2) Cargar operation_operators y operations en batch
  const operationIds = Array.from(new Set(opPays.map((p: any) => p.operation_id).filter(Boolean)))
  const orgIds = Array.from(new Set(opPays.map((p: any) => p.org_id).filter(Boolean)))

  const [{ data: opOpsRows }, { data: opsRows }, { data: orgsRows }, { data: operatorsRows }] = await Promise.all([
    admin
      .from("operation_operators")
      .select("operation_id, operator_id, cost, cost_currency")
      .in("operation_id", operationIds as string[]),
    admin
      .from("operations")
      .select("id, file_code, operator_cost, operator_cost_currency, sale_currency, currency, org_id")
      .in("id", operationIds as string[]),
    admin.from("organizations").select("id, name").in("id", orgIds as string[]),
    admin
      .from("operators")
      .select("id, name")
      .in("id", Array.from(new Set(opPays.map((p: any) => p.operator_id).filter(Boolean))) as string[]),
  ])

  const opOpsByOp = new Map<string, any[]>()
  for (const r of opOpsRows || []) {
    const k = (r as any).operation_id
    const arr = opOpsByOp.get(k) || []
    arr.push(r)
    opOpsByOp.set(k, arr)
  }
  const opsById = new Map<string, any>((opsRows || []).map((r: any) => [r.id, r]))
  const orgsById = new Map<string, any>((orgsRows || []).map((r: any) => [r.id, r]))
  const operatorsById = new Map<string, any>((operatorsRows || []).map((r: any) => [r.id, r]))

  // 3) Comparar
  const drifts: Row[] = []
  for (const p of opPays as any[]) {
    const op = opsById.get(p.operation_id)
    if (!op) continue

    const opOpsForThis = opOpsByOp.get(p.operation_id) || []
    let expectedCost: number | null = null
    let source: Row["source"] = "operation_operators"

    if (opOpsForThis.length > 0) {
      const match = opOpsForThis.find((r: any) => r.operator_id === p.operator_id)
      if (match) {
        expectedCost = Number(match.cost || 0)
      } else {
        continue
      }
    } else {
      const opPaysSameOpSamePayer = (opPays as any[]).filter(
        (q) => q.operation_id === p.operation_id
      )
      if (opPaysSameOpSamePayer.length === 1) {
        expectedCost = Number(op.operator_cost || 0)
        source = "operations.operator_cost"
      } else {
        continue
      }
    }

    const drift = Number(p.amount || 0) - expectedCost
    if (Math.abs(drift) > EPS) {
      drifts.push({
        org_id: p.org_id,
        org_name: orgsById.get(p.org_id)?.name || "?",
        operation_id: p.operation_id,
        file_code: op.file_code,
        operator_payment_id: p.id,
        operator_id: p.operator_id,
        operator_name: operatorsById.get(p.operator_id)?.name || null,
        current_amount: Number(p.amount || 0),
        expected_cost: expectedCost,
        drift,
        currency: p.currency,
        source,
      })
    }
  }

  console.log(`\nDrifts detectados: ${drifts.length}`)
  if (drifts.length === 0) return

  drifts.sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift))

  console.log("\nTop 20 por monto de drift (abs):")
  console.table(
    drifts.slice(0, 20).map((r) => ({
      org: r.org_name,
      file: r.file_code,
      operator: r.operator_name,
      amount: r.current_amount,
      expected: r.expected_cost,
      drift: r.drift,
      curr: r.currency,
      source: r.source,
    }))
  )

  // Resumen por org
  const byOrg = new Map<string, { rows: number; totalAbsDrift: number; name: string }>()
  for (const r of drifts) {
    const cur = byOrg.get(r.org_id) || { rows: 0, totalAbsDrift: 0, name: r.org_name }
    cur.rows += 1
    cur.totalAbsDrift += Math.abs(r.drift)
    byOrg.set(r.org_id, cur)
  }
  console.log("\nResumen por org:")
  console.table(
    Array.from(byOrg.entries())
      .map(([id, v]) => ({ org: v.name, rows: v.rows, total_abs_drift: v.totalAbsDrift }))
      .sort((a, b) => b.rows - a.rows)
  )
})()
