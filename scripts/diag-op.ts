/**
 * Diagnóstico genérico de una operación por id (o file_code).
 * Run: npx tsx scripts/diag-op.ts <opId|file_code>
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const ARG = process.argv[2]
if (!ARG) { console.error("Uso: npx tsx scripts/diag-op.ts <opId|file_code>"); process.exit(1) }

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

;(async () => {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(ARG)
  let opQuery = admin.from("operations").select("*")
  opQuery = isUuid ? opQuery.eq("id", ARG) : opQuery.eq("file_code", ARG)
  const { data: op, error: opErr } = await opQuery.maybeSingle()

  if (opErr || !op) { console.error("No se encontró la operación", ARG, opErr); return }
  const OP_ID = op.id

  console.log("========== operations row (campos clave) ==========")
  console.table([{
    id: op.id?.slice(0, 8),
    file_code: op.file_code,
    org_id: op.org_id?.slice(0, 8),
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

  const { data: flag } = await admin
    .from("org_settings")
    .select("*")
    .eq("org_id", op.org_id)
    .maybeSingle()
    .then((r) => r, () => ({ data: null }))
  // feature flags viven donde sea; sólo informativo
  void flag

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
  console.log("SUM payments INCOME PAID =", paidIncome)
})()
