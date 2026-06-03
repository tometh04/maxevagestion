/**
 * Diagnóstico de la op OP-20260528-F27F2F1E (Lozada VG / AMICHI).
 * Run: npx tsx scripts/check-lozada-amichi-op.ts
 *
 * Objetivo: ver por qué "Pendiente a Operador" muestra ARS 3.341.245 mientras
 * el costo en operación/operation_operators es ARS 3.018.466.
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const FILE_CODE = "OP-20260528-F27F2F1E"

;(async () => {
  console.log(`\n=== Diagnóstico ${FILE_CODE} ===\n`)

  const { data: op, error: opErr } = await admin
    .from("operations")
    .select(
      "id, file_code, org_id, agency_id, operator_id, operator_cost, operator_cost_currency, sale_amount_total, sale_currency, currency, status, created_at, updated_at"
    )
    .eq("file_code", FILE_CODE)
    .maybeSingle()

  if (opErr || !op) {
    console.error("No se encontró la operación:", opErr)
    return
  }

  console.log("1) operations row:")
  console.table([op])

  const { data: opOps } = await admin
    .from("operation_operators")
    .select("id, operator_id, cost, cost_currency, sale_amount, product_type, created_at, updated_at")
    .eq("operation_id", op.id)
  console.log("\n2) operation_operators rows:")
  console.table(opOps)

  const { data: opPays } = await admin
    .from("operator_payments")
    .select("id, operator_id, amount, paid_amount, currency, status, org_id, agency_id, operation_service_id, notes, created_at, updated_at")
    .eq("operation_id", op.id)
  console.log("\n3) operator_payments rows (sin filtro org_id):")
  console.table(opPays)

  const { data: opSvcs } = await admin
    .from("operation_services")
    .select("id, operator_id, operator_payment_id, sale_amount, cost_amount, sale_currency, cost_currency, service_type, created_at")
    .eq("operation_id", op.id)
  console.log("\n4) operation_services rows:")
  console.table(opSvcs)

  const { data: payments } = await admin
    .from("payments")
    .select("id, direction, payer_type, amount, currency, status, paid_at, date_due, created_at")
    .eq("operation_id", op.id)
  console.log("\n5) payments rows (todos):")
  console.table(payments)

  // Resumen
  console.log("\n=== Resumen ===")
  const totalOpOpsCost = (opOps || []).reduce((s, r: any) => s + Number(r.cost || 0), 0)
  const totalOpPayAmount = (opPays || []).reduce((s, r: any) => s + Number(r.amount || 0), 0)
  const totalOpPayPaid = (opPays || []).reduce((s, r: any) => s + Number(r.paid_amount || 0), 0)
  const hasPaid = (opPays || []).some(
    (r: any) => r.status === "PAID" || Number(r.paid_amount || 0) > 0
  )
  const pendingCount = (opPays || []).filter((r: any) => ["PENDING", "OVERDUE"].includes(r.status)).length

  console.log("operations.operator_cost:", op.operator_cost, op.operator_cost_currency)
  console.log("SUM(operation_operators.cost):", totalOpOpsCost)
  console.log("SUM(operator_payments.amount):", totalOpPayAmount)
  console.log("SUM(operator_payments.paid_amount):", totalOpPayPaid)
  console.log("operator_payments count:", (opPays || []).length, "PENDING/OVERDUE:", pendingCount)
  console.log("hasPaidOperatorPayments (path multi):", hasPaid)
  console.log(
    "→ Path multi-op recreará?:",
    !hasPaid ? "SÍ (delete+insert)" : "NO (conserva existentes)"
  )
  console.log(
    "→ Path legacy actualizará amount?:",
    pendingCount === 1 ? "SÍ (length===1)" : `NO (pendingCount=${pendingCount})`
  )
})()
