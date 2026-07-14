/**
 * Fix OP-20260518-3C89DA03 (VICO) — restaurar totales borrados por el bug de recalc.
 * Run (dry):   npx tsx scripts/fix-op-3c89da03-restore-totals.ts
 * Run (apply): npx tsx scripts/fix-op-3c89da03-restore-totals.ts --apply
 *
 * Causa: casualty PRE-guard del bug conocido (mismo que op a3bb84e1). La op usa
 * el modelo `operation_operators` (0 operation_services). Alguien agregó un
 * servicio y lo borró ~2026-06-18; recalculateOperationTotals sumó un set vacío
 * de operation_services y pisó sale_amount_total / operator_cost / margin con 0.
 * El guard `if (services.length === 0) return` se agregó DESPUÉS (incidente
 * a3bb84e1, 2026-06-26), así que no protegió a esta op. El guard ya evita la
 * recurrencia; esto sólo restaura los datos destruidos.
 *
 * Valores reales (verificados con diag, TRIPLE corroboración):
 *   - operator_cost = SUM(operation_operators.cost) = SUM(operator_payments.amount)
 *                   = 3660 USD  (2014 DELFOS + 1646 MITIKA)
 *   - sale_amount_total = SUM(payments INCOME PAID) = 4100 USD (400+1650+2050)
 *   - margin = 4100 - 3660 = 440  → coincide con billing_margin_amount (440)
 *   - margin% = 10.73             → coincide con billing_margin_percentage (10.73)
 */
import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })

const FILE_CODE = "OP-20260518-3C89DA03"
const APPLY = process.argv.includes("--apply")

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

;(async () => {
  const { data: op } = await admin
    .from("operations")
    .select("id, file_code, sale_amount_total, operator_cost, margin_amount, margin_percentage, billing_margin_amount, billing_margin_percentage, sale_currency, operator_cost_currency")
    .eq("file_code", FILE_CODE)
    .maybeSingle()

  if (!op) { console.error("Operación no encontrada"); return }
  const OP_ID = op.id

  // Costo desde operation_operators (fuente del Resumen de Compra).
  const { data: opOps } = await admin
    .from("operation_operators").select("cost").eq("operation_id", OP_ID)
  const operatorCost = (opOps || []).reduce((s, r: any) => s + (Number(r.cost) || 0), 0)

  // Sanity: operator_payments.amount (deuda registrada, ambas PAID).
  const { data: opPays } = await admin
    .from("operator_payments").select("amount").eq("operation_id", OP_ID)
  const operatorPaymentsTotal = (opPays || []).reduce((s, r: any) => s + (Number(r.amount) || 0), 0)

  // Venta = cobros INCOME PAID del cliente.
  const { data: payments } = await admin
    .from("payments").select("amount, direction, status").eq("operation_id", OP_ID)
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

  console.log("\n== Sanity checks (deben coincidir) ==")
  console.log("SUM operation_operators.cost   =", operatorCost)
  console.log("SUM operator_payments.amount   =", operatorPaymentsTotal, operatorCost === operatorPaymentsTotal ? "✓" : "⚠ NO coincide")
  console.log("INCOME PAID (cliente)          =", saleTotal)
  console.log("billing_margin_amount          =", op.billing_margin_amount, margin === Number(op.billing_margin_amount) ? "✓ coincide con margin" : "⚠ NO coincide")
  console.log("billing_margin_percentage      =", op.billing_margin_percentage, marginPct === Number(op.billing_margin_percentage) ? "✓ coincide con margin%" : "⚠ NO coincide")

  console.log("\n== Valores a restaurar ==")
  console.table([{ sale_amount_total: saleTotal, operator_cost: operatorCost, margin_amount: margin, margin_percentage: marginPct }])

  if (operatorCost <= 0 || saleTotal <= 0) {
    console.error("\n⚠ Abortado: algún valor reconstruido es <= 0, revisar manualmente."); return
  }
  if (margin !== Number(op.billing_margin_amount)) {
    console.error("\n⚠ El margen reconstruido NO coincide con billing_margin_amount. Frenar y revisar a mano."); return
  }

  if (!APPLY) { console.log("\n(dry-run) Re-ejecutar con --apply para escribir los cambios."); return }

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
