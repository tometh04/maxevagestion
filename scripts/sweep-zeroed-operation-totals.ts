/**
 * Barrido: detectar operaciones cuyos totales agregados quedaron en 0 por el bug
 * de recalculateOperationTotals (pisó sale_amount_total/operator_cost/margin con
 * 0 al sumar operation_services vacío/incompleto), pero que tienen datos reales
 * vivos en operation_operators / operator_payments (modelo operador).
 *
 * Run: npx tsx scripts/sweep-zeroed-operation-totals.ts
 *      npx tsx scripts/sweep-zeroed-operation-totals.ts <org_id>   (scopear a 1 org)
 *
 * Firma del bug (mismo caso que OP-20260518-3C89DA03 / a3bb84e1):
 *   operations.operator_cost == 0  PERO  SUM(operation_operators.cost) > 0
 *   (y/o sale_amount_total == 0 con billing_margin_amount sobreviviente).
 * NO reporta drafts legítimos: exige plata real en el modelo operador.
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const ORG_FILTER = process.argv[2] || null
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const EPS = 0.01

async function fetchAll(table: string, cols: string, orgCol?: string) {
  const rows: any[] = []
  let from = 0
  const page = 1000
  for (;;) {
    let q = admin.from(table).select(cols).range(from, from + page - 1)
    if (ORG_FILTER && orgCol) q = q.eq(orgCol, ORG_FILTER)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data || []))
    if (!data || data.length < page) break
    from += page
  }
  return rows
}

;(async () => {
  console.log("Cargando operation_operators...")
  const ops = await fetchAll("operation_operators", "operation_id, cost, sale_amount", "org_id")
  const byOpCost = new Map<string, number>()
  const byOpSale = new Map<string, number>()
  for (const r of ops) {
    byOpCost.set(r.operation_id, (byOpCost.get(r.operation_id) || 0) + (Number(r.cost) || 0))
    byOpSale.set(r.operation_id, (byOpSale.get(r.operation_id) || 0) + (Number(r.sale_amount) || 0))
  }

  console.log("Cargando operator_payments...")
  const opPays = await fetchAll("operator_payments", "operation_id, amount", "org_id")
  const byOpPay = new Map<string, number>()
  for (const r of opPays) {
    if (!r.operation_id) continue
    byOpPay.set(r.operation_id, (byOpPay.get(r.operation_id) || 0) + (Number(r.amount) || 0))
  }

  console.log("Cargando operations...")
  const operations = await fetchAll(
    "operations",
    "id, file_code, org_id, status, sale_amount_total, operator_cost, margin_amount, margin_percentage, billing_margin_amount, billing_margin_percentage",
    "org_id"
  )

  const suspects: any[] = []
  for (const op of operations) {
    const sumOperators = byOpCost.get(op.id) || 0
    const sumOpPay = byOpPay.get(op.id) || 0
    const realCost = Math.max(sumOperators, sumOpPay)
    const opCost = Number(op.operator_cost) || 0
    const opSale = Number(op.sale_amount_total) || 0
    const billMargin = Number(op.billing_margin_amount) || 0

    // Firma A: hay costo real en el modelo operador pero operator_cost quedó en 0.
    const costZeroed = realCost > EPS && opCost < EPS
    // Firma B: venta en 0 pero el snapshot de billing sobrevivió con margen real.
    const saleZeroedWithBilling = opSale < EPS && Math.abs(billMargin) > EPS && realCost > EPS

    if (costZeroed || saleZeroedWithBilling) {
      suspects.push({
        file_code: op.file_code,
        org: op.org_id?.slice(0, 8),
        status: op.status,
        op_cost: opCost,
        SUM_operators: Math.round(sumOperators * 100) / 100,
        SUM_op_payments: Math.round(sumOpPay * 100) / 100,
        op_sale: opSale,
        billing_margin: billMargin,
        signal: [costZeroed && "costo=0", saleZeroedWithBilling && "venta=0+billing"].filter(Boolean).join(" | "),
      })
    }
  }

  console.log(`\n=== Operaciones sospechosas: ${suspects.length} ===`)
  if (suspects.length) {
    suspects.sort((a, b) => (a.org || "").localeCompare(b.org || "") || String(a.file_code).localeCompare(String(b.file_code)))
    console.table(suspects)
    const byOrg = new Map<string, number>()
    for (const s of suspects) byOrg.set(s.org, (byOrg.get(s.org) || 0) + 1)
    console.log("\nPor org:")
    console.table([...byOrg.entries()].map(([org, count]) => ({ org, count })))
  } else {
    console.log("✅ No se detectaron otras operaciones con totales borrados.")
  }
})()
