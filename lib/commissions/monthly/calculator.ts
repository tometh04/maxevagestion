/**
 * Calculator puro de comisiones mensuales. NO toca BD — recibe inputs
 * armados por fetcher.ts y devuelve el cálculo completo.
 *
 * Diseñado para ser easy-test y deterministic. Toda la lógica de
 * negocio del esquema VICO está acá. Si algo en el cálculo está mal,
 * se cambia acá y los tests se ajustan.
 */

import type {
  CalculationInputs,
  CalculationResult,
  MonthlyCommissionRule,
  CommissionBracket,
} from "./types"

/**
 * Convierte un monto en su currency original a USD usando la tasa.
 * - currency=USD → devuelve amount tal cual
 * - currency=ARS → divide por rate (rate = cuántos ARS por 1 USD)
 *
 * fx_rate_usd_to_ars = 1000 significa "1 USD = 1000 ARS".
 * Convertir 50000 ARS a USD: 50000 / 1000 = 50 USD.
 */
function toUsd(amount: number, currency: "USD" | "ARS", fxRate: number): number {
  if (currency === "USD") return amount
  if (!fxRate || fxRate <= 0) return 0
  return amount / fxRate
}

/**
 * Identifica el tramo aplicable según el margen total.
 * Los brackets están ordenados asc por threshold_usd. Se toma el ÚLTIMO
 * cuyo threshold sea <= margin. Si margin < primer threshold → 0%.
 */
function findBracket(brackets: CommissionBracket[], marginUsd: number): CommissionBracket | null {
  if (!brackets || brackets.length === 0) return null
  const sorted = [...brackets].sort((a, b) => a.threshold_usd - b.threshold_usd)
  let applied: CommissionBracket | null = null
  for (const b of sorted) {
    if (marginUsd >= b.threshold_usd) applied = b
    else break
  }
  return applied
}

/**
 * Interpolación lineal entre dos puntos (x0,y0) y (x1,y1) para un x dado.
 * - Si x <= x0 → escala lineal desde (0,0) hasta (x0,y0)
 * - Si x0 < x < x1 → interpola entre (x0,y0) y (x1,y1)
 * - Si x >= x1 → y1 (cap)
 *
 * Usado para componente Ventas (margin → %) y para los indicadores de
 * gestión (rate → %).
 */
function interpolate(
  x: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): number {
  if (x <= 0) return 0
  if (x >= x1) return y1
  if (x <= x0) {
    // Lineal desde (0, 0) hasta (x0, y0)
    return (x / x0) * y0
  }
  // Lineal entre (x0, y0) y (x1, y1)
  const t = (x - x0) / (x1 - x0)
  return y0 + t * (y1 - y0)
}

/** Round a 2 decimales (cents). Para presentación + storage. */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Round a 4 decimales (para pct con más precisión). */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

/**
 * Calcula la comisión mensual completa. Función pura.
 *
 * Pasos:
 * 1. Suma márgenes USD de las ops del mes (descartando CANCELLED, aplicando
 *    seller_split_pct para multi-vendedora).
 * 2. Identifica tramo aplicable y calcula comisión base sobre el excedente.
 * 3. Calcula componente Ventas (interpolación según rule).
 * 4. Calcula indicadores de Gestión (cotizaciones, leads, opcional manual).
 * 5. Promedia indicadores, aplica piso. Resultado = componente Gestión.
 * 6. Combina ambos componentes según los pesos (default 50/50) → factor.
 * 7. Aplica factor sobre comisión base.
 * 8. Suma ajustes retroactivos (negativos = descuentos).
 */
export function calculateMonthlyCommission(
  inputs: CalculationInputs
): CalculationResult {
  const { rule, operations, quotations_sent_count, leads_received_count,
          manual_indicator_pct, pending_adjustments_usd } = inputs

  // ─── 1. Margen total USD ─────────────────────────────────────────
  // Excluir CANCELLED. Aplicar seller_split_pct.
  const validOps = operations.filter((op) => op.status !== "CANCELLED")
  const opsBreakdown = validOps.map((op) => {
    const marginRaw = (op.sale_amount_total || 0) - (op.operator_cost || 0)
    const marginUsd = toUsd(marginRaw, op.currency, op.fx_rate_usd_to_ars)
    const splitFactor = (op.seller_split_pct ?? 100) / 100
    const counted = marginUsd * splitFactor
    return {
      id: op.id,
      margin_usd: round2(marginUsd),
      split_pct: op.seller_split_pct ?? 100,
      counted_margin_usd: round2(counted),
    }
  })
  const totalMargin = opsBreakdown.reduce((s, o) => s + o.counted_margin_usd, 0)
  const totalMarginUsd = round2(totalMargin)

  // ─── 2. Comisión base ────────────────────────────────────────────
  const nonCommissionable = rule.non_commissionable_amount_usd
  const excessRaw = totalMarginUsd - nonCommissionable
  const excessUsd = round2(Math.max(0, excessRaw))
  const bracket = findBracket(rule.brackets, totalMarginUsd)
  const bracketPct = bracket?.percentage ?? 0
  const baseCommissionUsd = round2((excessUsd * bracketPct) / 100)

  // ─── 3. Componente Ventas (sobre margen bruto) ───────────────────
  const salesComponentPct = round2(
    interpolate(
      totalMarginUsd,
      rule.sales_floor_usd,
      rule.sales_floor_pct,
      rule.sales_target_usd,
      rule.sales_target_pct
    )
  )

  // ─── 4. Componente Gestión - Indicadores ─────────────────────────
  const salesClosedCount = opsBreakdown.length

  // Indicador 1: conv sobre cotizaciones
  const convQuotationsRate = quotations_sent_count > 0
    ? salesClosedCount / quotations_sent_count
    : 0
  const mgmtQuotationsIndicatorPct = round2(
    interpolate(
      convQuotationsRate,
      rule.mgmt_quotations_floor_rate,
      rule.mgmt_quotations_floor_pct,
      rule.mgmt_quotations_target_rate,
      rule.mgmt_quotations_target_pct
    )
  )

  // Indicador 2: conv sobre leads
  const convLeadsRate = leads_received_count > 0
    ? salesClosedCount / leads_received_count
    : 0
  const mgmtLeadsIndicatorPct = round2(
    interpolate(
      convLeadsRate,
      rule.mgmt_leads_floor_rate,
      rule.mgmt_leads_floor_pct,
      rule.mgmt_leads_target_rate,
      rule.mgmt_leads_target_pct
    )
  )

  // Indicador 3 (opcional): manual de auditoría
  const indicators = [mgmtQuotationsIndicatorPct, mgmtLeadsIndicatorPct]
  let mgmtManualIndicatorPct: number | null = null
  if (typeof manual_indicator_pct === "number" && !isNaN(manual_indicator_pct)) {
    mgmtManualIndicatorPct = round2(manual_indicator_pct)
    indicators.push(mgmtManualIndicatorPct)
  }

  // Promedio + piso
  const avgIndicators = indicators.reduce((s, n) => s + n, 0) / indicators.length
  const mgmtComponentPct = round2(Math.max(avgIndicators, rule.mgmt_floor_pct))

  // ─── 5. Factor de desempeño ──────────────────────────────────────
  // factor = (sales% × sales_weight + mgmt% × mgmt_weight) / 100
  const performanceFactorPct = round4(
    (salesComponentPct * rule.factor_sales_weight_pct +
      mgmtComponentPct * rule.factor_mgmt_weight_pct) /
      100
  )

  // ─── 6. Comisión final ───────────────────────────────────────────
  // base × factor (factor está en %, dividir por 100)
  const commissionBeforeAdjustments = round2(
    (baseCommissionUsd * performanceFactorPct) / 100
  )

  // Ajustes retroactivos (signed; negativo = descuento)
  const retroactiveAdjustmentUsd = round2(pending_adjustments_usd || 0)

  const finalCommissionUsd = round2(
    commissionBeforeAdjustments + retroactiveAdjustmentUsd
  )

  return {
    total_margin_usd: totalMarginUsd,
    non_commissionable_amount_usd: nonCommissionable,
    excess_usd: excessUsd,
    bracket_applied_pct: bracketPct,
    base_commission_usd: baseCommissionUsd,

    sales_component_pct: salesComponentPct,
    mgmt_quotations_indicator_pct: mgmtQuotationsIndicatorPct,
    mgmt_leads_indicator_pct: mgmtLeadsIndicatorPct,
    mgmt_manual_indicator_pct: mgmtManualIndicatorPct,
    mgmt_component_pct: mgmtComponentPct,
    performance_factor_pct: performanceFactorPct,

    retroactive_adjustment_usd: retroactiveAdjustmentUsd,
    final_commission_usd: finalCommissionUsd,

    quotations_sent_count,
    leads_received_count,
    sales_closed_count: salesClosedCount,
    operations_included: opsBreakdown.map((o) => o.id),

    breakdown: {
      operations: opsBreakdown,
      conv_quotations_rate: round4(convQuotationsRate),
      conv_leads_rate: round4(convLeadsRate),
    },
  }
}

/** Default rule cuando una vendedora no tiene config explícita pero el org tiene el módulo. */
export function buildDefaultRule(orgId: string, sellerId: string): Omit<MonthlyCommissionRule, "id" | "created_at" | "updated_at" | "created_by_user_id"> {
  return {
    seller_id: sellerId,
    org_id: orgId,
    non_commissionable_amount_usd: 1450,
    brackets: [
      { threshold_usd: 1450, percentage: 15 },
      { threshold_usd: 3000, percentage: 20 },
      { threshold_usd: 5000, percentage: 25 },
      { threshold_usd: 7000, percentage: 30 },
    ],
    sales_floor_usd: 19000,
    sales_floor_pct: 80,
    sales_target_usd: 22000,
    sales_target_pct: 100,
    mgmt_quotations_floor_rate: 0.03,
    mgmt_quotations_floor_pct: 80,
    mgmt_quotations_target_rate: 0.04,
    mgmt_quotations_target_pct: 100,
    mgmt_leads_floor_rate: 0.03,
    mgmt_leads_floor_pct: 80,
    mgmt_leads_target_rate: 0.04,
    mgmt_leads_target_pct: 100,
    mgmt_floor_pct: 80,
    factor_sales_weight_pct: 50,
    factor_mgmt_weight_pct: 50,
    date_field_for_period: "operation_date",
    enabled: true,
    effective_from: null,
    effective_to: null,
  }
}
