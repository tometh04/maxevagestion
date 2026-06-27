/**
 * Fix OP a3bb84e1 (VICO) — restaurar totales borrados por el bug de recalc.
 * Run (dry):   npx tsx scripts/fix-op-a3bb84e1-restore-totals.ts
 * Run (apply): npx tsx scripts/fix-op-a3bb84e1-restore-totals.ts --apply
 *
 * Causa: al borrar un servicio, recalculateOperationTotals sumó
 * operation_services (vacío, la op usa el modelo operation_operators) y
 * sobreescribió sale_amount_total / operator_cost / margin con 0.
 *
 * Valores reales (verificados con diag-op-a3bb84e1.ts):
 *   - operator_cost  = SUM(operation_operators.cost) = SUM(operator_payments.amount) = 10202.91 USD
 *   - sale_amount_total = INCOME PAID del cliente (op pagada completa) = 11760 USD
 *   - margin = 11760 - 10202.91 = 1557.09 ; margin% = 13.24
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const OP_ID = "a3bb84e1-8fb3-4fff-bb07-e65e3c389d47"
const APPLY = process.argv.includes("--apply")

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

;(async () => {
  const { data: op } = await admin
    .from("operations")
    .select("id, file_code, sale_amount_total, operator_cost, margin_amount, margin_percentage, sale_currency, operator_cost_currency")
    .eq("id", OP_ID)
    .single()

  if (!op) { console.error("Operación no encontrada"); return }

  // Reconstruir costo desde operation_operators (fuente del Resumen de Compra).
  const { data: opOps } = await admin
    .from("operation_operators")
    .select("cost, cost_currency")
    .eq("operation_id", OP_ID)
  const operatorCost = (opOps || []).reduce((s, r: any) => s + (Number(r.cost) || 0), 0)

  // Sanity-check contra operator_payments.amount (deuda registrada).
  const { data: opPays } = await admin
    .from("operator_payments")
    .select("amount")
    .eq("operation_id", OP_ID)
  const operatorPaymentsTotal = (opPays || []).reduce((s, r: any) => s + (Number(r.amount) || 0), 0)

  // Venta = cobros INCOME PAID del cliente (op figuraba "Pagado completo").
  const { data: payments } = await admin
    .from("payments")
    .select("amount, direction, status")
    .eq("operation_id", OP_ID)
  const saleTotal = (payments || [])
    .filter((p: any) => p.direction === "INCOME" && p.status === "PAID")
    .reduce((s, r: any) => s + (Number(r.amount) || 0), 0)

  const margin = Math.round((saleTotal - operatorCost) * 100) / 100
  const marginPct = saleTotal > 0 ? Math.round((margin / saleTotal) * 100 * 100) / 100 : 0

  console.log("== Estado actual (roto) ==")
  console.table([{
    sale_amount_total: op.sale_amount_total,
    operator_cost: op.operator_cost,
    margin_amount: op.margin_amount,
    margin_percentage: op.margin_percentage,
  }])

  console.log("\n== Sanity checks ==")
  console.log("SUM operation_operators.cost   =", operatorCost)
  console.log("SUM operator_payments.amount   =", operatorPaymentsTotal, operatorCost === operatorPaymentsTotal ? "✓ coincide" : "⚠ NO coincide")
  console.log("INCOME PAID (cliente)          =", saleTotal)

  console.log("\n== Valores a restaurar ==")
  console.table([{
    sale_amount_total: saleTotal,
    operator_cost: operatorCost,
    margin_amount: margin,
    margin_percentage: marginPct,
  }])

  if (operatorCost <= 0 || saleTotal <= 0) {
    console.error("\n⚠ Abortado: algún valor reconstruido es <= 0, revisar manualmente.")
    return
  }

  if (!APPLY) {
    console.log("\n(dry-run) Re-ejecutar con --apply para escribir los cambios.")
    return
  }

  const { error } = await admin
    .from("operations")
    .update({
      sale_amount_total: saleTotal,
      operator_cost: operatorCost,
      margin_amount: margin,
      margin_percentage: marginPct,
      updated_at: new Date().toISOString(),
    })
    .eq("id", OP_ID)

  if (error) { console.error("ERROR al actualizar:", error); return }
  console.log("\n✅ Totales restaurados para", op.file_code)
})()
