/**
 * Diagnóstico OP a3bb84e1 (VICO).
 * Run: npx tsx scripts/diag-op-a3bb84e1.ts
 *
 * VICO reporta: modificaron una operación (cargaron un servicio y luego lo
 * borraron porque el cliente no lo quería), y "se rompió todo": el Financiero
 * quedó en USD 0,00 (venta/costo/margen) aunque el Resumen de Compra sigue
 * mostrando USD 10.202,91 y operator_payments siguen totalizando 10.202,91.
 *
 * Hipótesis: recalculateOperationTotals (services/[serviceId] DELETE) sumó
 * operation_services y, al quedar vacío/incompleto, sobreescribió
 * sale_amount_total y operator_cost con 0.
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const OP_ID = "a3bb84e1-8fb3-4fff-bb07-e65e3c389d47"

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

;(async () => {
  const { data: op, error: opErr } = await admin
    .from("operations")
    .select("*")
    .eq("id", OP_ID)
    .single()

  if (opErr || !op) {
    console.error("No se encontró la operación", OP_ID, opErr)
    return
  }

  console.log("========== operations row (campos clave) ==========")
  console.table([{
    id: op.id?.slice(0, 8),
    file_code: op.file_code,
    status: op.status,
    currency: op.currency,
    sale_currency: op.sale_currency,
    operator_cost_currency: op.operator_cost_currency,
    sale_amount_total: op.sale_amount_total,
    operator_cost: op.operator_cost,
    margin_amount: op.margin_amount,
    margin_percentage: op.margin_percentage,
    updated_at: op.updated_at,
  }])

  const { data: opOps } = await admin
    .from("operation_operators")
    .select("*")
    .eq("operation_id", OP_ID)
    .order("created_at", { ascending: true })
  console.log("\n========== operation_operators ==========")
  console.table((opOps || []).map((r: any) => ({
    id: r.id?.slice(0, 8),
    operator_id: r.operator_id?.slice(0, 8),
    product_type: r.product_type,
    cost: r.cost,
    cost_currency: r.cost_currency,
    sale_amount: r.sale_amount,
    sale_currency: r.sale_currency,
    created_at: r.created_at,
    updated_at: r.updated_at,
  })))
  console.log("SUM operation_operators.cost =", (opOps || []).reduce((s: number, r: any) => s + (Number(r.cost) || 0), 0))
  console.log("SUM operation_operators.sale_amount =", (opOps || []).reduce((s: number, r: any) => s + (Number(r.sale_amount) || 0), 0))

  const { data: opSvcs } = await admin
    .from("operation_services")
    .select("*")
    .eq("operation_id", OP_ID)
    .order("created_at", { ascending: true })
  console.log("\n========== operation_services ==========")
  console.table((opSvcs || []).map((r: any) => ({
    id: r.id?.slice(0, 8),
    service_type: r.service_type,
    operator_id: r.operator_id?.slice(0, 8) ?? null,
    operator_payment_id: r.operator_payment_id?.slice(0, 8) ?? null,
    sale_amount: r.sale_amount,
    sale_currency: r.sale_currency,
    cost_amount: r.cost_amount,
    cost_currency: r.cost_currency,
    created_at: r.created_at,
    updated_at: r.updated_at,
  })))
  console.log("COUNT operation_services =", (opSvcs || []).length)

  const { data: opPays } = await admin
    .from("operator_payments")
    .select("*")
    .eq("operation_id", OP_ID)
    .order("created_at", { ascending: true })
  console.log("\n========== operator_payments ==========")
  console.table((opPays || []).map((r: any) => ({
    id: r.id?.slice(0, 8),
    operator_id: r.operator_id?.slice(0, 8),
    amount: r.amount,
    paid_amount: r.paid_amount,
    currency: r.currency,
    status: r.status,
    operation_service_id: r.operation_service_id?.slice(0, 8) ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  })))
  console.log("SUM operator_payments.amount =", (opPays || []).reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0))
  console.log("SUM operator_payments.paid_amount =", (opPays || []).reduce((s: number, r: any) => s + (Number(r.paid_amount) || 0), 0))

  const { data: payments } = await admin
    .from("payments")
    .select("*")
    .eq("operation_id", OP_ID)
    .order("created_at", { ascending: true })
  console.log("\n========== payments ==========")
  console.table((payments || []).map((r: any) => ({
    id: r.id?.slice(0, 8),
    direction: r.direction,
    payer_type: r.payer_type,
    amount: r.amount,
    currency: r.currency,
    status: r.status,
    date_paid: r.date_paid,
    created_at: r.created_at,
  })))
  const paidIncome = (payments || []).filter((p: any) => p.direction === "INCOME" && p.status === "PAID").reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0)
  const paidExpense = (payments || []).filter((p: any) => p.direction === "EXPENSE" && p.status === "PAID").reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0)
  console.log("SUM payments INCOME PAID =", paidIncome)
  console.log("SUM payments EXPENSE PAID =", paidExpense)
})()
