/**
 * Tipos del módulo de Comisiones Mensuales.
 * Pedido por VICO TRAVEL GROUP (2026-05). Esquema:
 *
 *   Comisión Final = Comisión Base × Factor de Desempeño + Ajustes Retroactivos
 *
 *   Comisión Base = (Margen Total − No Comisionable) × % Tramo
 *   Factor = (50% × % Ventas) + (50% × % Gestión)
 *   % Gestión = MAX(piso, AVG(indicadores))
 *
 * Ver supabase/migrations/20260522000001_monthly_commissions_module.sql.
 */

export type DateFieldForPeriod =
  | "operation_date"
  | "created_at"
  | "departure_date"

export interface CommissionBracket {
  threshold_usd: number
  percentage: number
}

export interface MonthlyCommissionRule {
  id: string
  seller_id: string
  org_id: string

  // Comisión base
  non_commissionable_amount_usd: number
  brackets: CommissionBracket[]

  // Componente Ventas
  sales_floor_usd: number
  sales_floor_pct: number
  sales_target_usd: number
  sales_target_pct: number

  // Indicador 1: cotizaciones
  mgmt_quotations_floor_rate: number  // ej. 0.03 (3%)
  mgmt_quotations_floor_pct: number   // ej. 80
  mgmt_quotations_target_rate: number // ej. 0.04 (4%)
  mgmt_quotations_target_pct: number  // ej. 100

  // Indicador 2: leads
  mgmt_leads_floor_rate: number
  mgmt_leads_floor_pct: number
  mgmt_leads_target_rate: number
  mgmt_leads_target_pct: number

  // Piso global del componente Gestión
  mgmt_floor_pct: number

  // Pesos del factor (deben sumar 100)
  factor_sales_weight_pct: number
  factor_mgmt_weight_pct: number

  // Configuración del periodo
  date_field_for_period: DateFieldForPeriod

  // Estado
  enabled: boolean
  effective_from: string | null
  effective_to: string | null

  created_at: string
  updated_at: string
  created_by_user_id: string | null
}

/**
 * Datos de entrada que necesita el calculator. Lo arma el fetcher
 * desde BD (operations, quotations, leads, adjustments pendientes).
 */
export interface CalculationInputs {
  rule: MonthlyCommissionRule
  year_month: string  // "YYYY-MM"

  /** Operaciones del seller que caen dentro del mes según rule.date_field_for_period */
  operations: Array<{
    id: string
    sale_amount_total: number
    operator_cost: number
    currency: "USD" | "ARS"
    fx_rate_usd_to_ars: number  // tasa al momento de la operación (snapshot)
    /** % de margen que le toca a este seller (100 si es primary sin split, 60/40 etc) */
    seller_split_pct: number
    status: string
  }>

  /** Cantidad de cotizaciones CREADAS en el mes por el seller */
  quotations_sent_count: number

  /** Cantidad de leads ASIGNADOS al seller en el mes */
  leads_received_count: number

  /** Indicador manual (auditoría) — admin lo carga opcionalmente */
  manual_indicator_pct?: number | null

  /** Suma de ajustes retroactivos pendientes (negativo = descuento) */
  pending_adjustments_usd: number
}

/** Resultado del cálculo. Match con columns de monthly_commission_settlements. */
export interface CalculationResult {
  total_margin_usd: number
  non_commissionable_amount_usd: number
  excess_usd: number
  bracket_applied_pct: number
  base_commission_usd: number

  sales_component_pct: number
  mgmt_quotations_indicator_pct: number
  mgmt_leads_indicator_pct: number
  mgmt_manual_indicator_pct: number | null
  mgmt_component_pct: number  // promedio (con piso aplicado)
  performance_factor_pct: number

  retroactive_adjustment_usd: number
  final_commission_usd: number

  // Counts para auditoría
  quotations_sent_count: number
  leads_received_count: number
  sales_closed_count: number
  operations_included: string[]  // operation IDs

  /** Breakdown legible para mostrar al user */
  breakdown: {
    operations: Array<{
      id: string
      margin_usd: number
      split_pct: number
      counted_margin_usd: number
    }>
    conv_quotations_rate: number  // ventas / cotizaciones (0—1)
    conv_leads_rate: number       // ventas / leads (0—1)
  }
}
