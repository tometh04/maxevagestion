/**
 * OBJETIVOS DE VENDEDORES — Cálculo de progreso
 *
 * Dado un objetivo (seller_objectives row) y un seller_id, calcula cuánto
 * avanzó ese seller en el período actual según el metric_type.
 *
 * Las métricas soportadas son las que están en el CHECK constraint de la tabla:
 *  - TRIPS_SOLD        → COUNT de operations cerradas
 *  - REVENUE_AMOUNT    → SUM de sale_amount_total
 *  - MARGIN_AMOUNT     → SUM de margin_amount
 *  - NEW_CUSTOMERS     → COUNT DISTINCT customers sin operations previas al período
 *  - CONVERSION_RATE   → (operations CONFIRMED) / (leads asignados) × 100
 *
 * Todos los filtros de fecha usan offset AR (-03:00) para no perder rows
 * cargados al final del día local.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { startOfDayAR, endOfDayAR } from "@/lib/utils/date-range"

export type ObjectiveMetricType =
  | "TRIPS_SOLD"
  | "REVENUE_AMOUNT"
  | "MARGIN_AMOUNT"
  | "NEW_CUSTOMERS"
  | "CONVERSION_RATE"

export type ObjectivePeriodType = "MONTHLY" | "QUARTERLY" | "ANNUAL"

export interface ObjectiveInput {
  id: string
  metric_type: ObjectiveMetricType | string
  target_value: number
  period_type: ObjectivePeriodType | string
  target_currency?: string | null
  seller_id?: string | null
  agency_id?: string | null
}

export interface ObjectiveProgress {
  objective_id: string
  current_value: number
  target_value: number
  percentage: number // 0-∞, puede superar 100 si excedió
  is_achieved: boolean
  period_start: string // "YYYY-MM-DD"
  period_end: string
}

/**
 * Calcula el rango [start, end] en formato YYYY-MM-DD para el período
 * actual, según el tipo. Usa la fecha local del servidor como "hoy".
 */
export function getObjectivePeriod(
  periodType: ObjectivePeriodType | string,
  now: Date = new Date()
): { start: string; end: string } {
  const year = now.getFullYear()
  const month = now.getMonth() // 0-11

  let start: Date
  let end: Date

  switch (periodType) {
    case "QUARTERLY": {
      const quarter = Math.floor(month / 3) // 0-3
      start = new Date(year, quarter * 3, 1)
      end = new Date(year, quarter * 3 + 3, 0) // último día del último mes del Q
      break
    }
    case "ANNUAL": {
      start = new Date(year, 0, 1)
      end = new Date(year, 11, 31)
      break
    }
    case "MONTHLY":
    default: {
      start = new Date(year, month, 1)
      end = new Date(year, month + 1, 0)
      break
    }
  }

  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`

  return { start: fmt(start), end: fmt(end) }
}

// Helper para Date objects en los filtros de Supabase (TIMESTAMPTZ)
function rangeTimestamps(periodStart: string, periodEnd: string) {
  return {
    gte: startOfDayAR(periodStart),
    lte: endOfDayAR(periodEnd),
  }
}

/**
 * Cálculo del progreso. Retorna 0 si no hay data suficiente (ej.
 * CONVERSION_RATE con 0 leads → 0%).
 */
export async function computeObjectiveProgress(
  supabase: SupabaseClient<any>,
  objective: ObjectiveInput,
  sellerId: string
): Promise<ObjectiveProgress> {
  const { start: periodStart, end: periodEnd } = getObjectivePeriod(objective.period_type)
  const ts = rangeTimestamps(periodStart, periodEnd)

  let current_value = 0

  try {
    switch (objective.metric_type) {
      case "TRIPS_SOLD": {
        const { count } = await (supabase.from("operations") as any)
          .select("id", { count: "exact", head: true })
          .eq("seller_id", sellerId)
          .in("status", ["CONFIRMED", "TRAVELLED", "CLOSED"])
          .gte("created_at", ts.gte)
          .lte("created_at", ts.lte)
        current_value = count || 0
        break
      }

      case "REVENUE_AMOUNT": {
        // Filtro por currency si está definida en el objetivo
        let query = (supabase.from("operations") as any)
          .select("sale_amount_total, currency")
          .eq("seller_id", sellerId)
          .in("status", ["CONFIRMED", "TRAVELLED", "CLOSED"])
          .gte("created_at", ts.gte)
          .lte("created_at", ts.lte)
        if (objective.target_currency) {
          query = query.eq("currency", objective.target_currency)
        }
        const { data } = await query
        current_value = (data || []).reduce(
          (sum: number, op: any) => sum + (parseFloat(op.sale_amount_total) || 0),
          0
        )
        break
      }

      case "MARGIN_AMOUNT": {
        let query = (supabase.from("operations") as any)
          .select("margin_amount, currency")
          .eq("seller_id", sellerId)
          .in("status", ["CONFIRMED", "TRAVELLED", "CLOSED"])
          .gte("created_at", ts.gte)
          .lte("created_at", ts.lte)
        if (objective.target_currency) {
          query = query.eq("currency", objective.target_currency)
        }
        const { data } = await query
        current_value = (data || []).reduce(
          (sum: number, op: any) => sum + (parseFloat(op.margin_amount) || 0),
          0
        )
        break
      }

      case "NEW_CUSTOMERS": {
        // Clientes que aparecen vinculados a una operation del seller en el período
        // Y no tienen operations previas (de cualquier seller) antes del período.
        const { data: currentOps } = await (supabase.from("operations") as any)
          .select("id, operation_customers(customer_id)")
          .eq("seller_id", sellerId)
          .in("status", ["CONFIRMED", "TRAVELLED", "CLOSED"])
          .gte("created_at", ts.gte)
          .lte("created_at", ts.lte)

        const customerIdsInPeriod = new Set<string>()
        for (const op of (currentOps as any[]) || []) {
          for (const oc of op.operation_customers || []) {
            if (oc?.customer_id) customerIdsInPeriod.add(oc.customer_id)
          }
        }

        if (customerIdsInPeriod.size === 0) {
          current_value = 0
          break
        }

        // De esos, contar los que NO tienen operation_customers previas al período
        const { data: priorLinks } = await (supabase.from("operation_customers") as any)
          .select("customer_id, operations!inner(created_at)")
          .in("customer_id", Array.from(customerIdsInPeriod))
          .lt("operations.created_at", ts.gte)

        const customersWithPrior = new Set<string>()
        for (const pl of (priorLinks as any[]) || []) {
          if (pl?.customer_id) customersWithPrior.add(pl.customer_id)
        }

        current_value = Array.from(customerIdsInPeriod).filter(
          (id) => !customersWithPrior.has(id)
        ).length
        break
      }

      case "CONVERSION_RATE": {
        // leads_count = leads asignados al seller cuya created_at está en el período
        const { count: leadsCount } = await (supabase.from("leads") as any)
          .select("id", { count: "exact", head: true })
          .eq("assigned_seller_id", sellerId)
          .gte("created_at", ts.gte)
          .lte("created_at", ts.lte)

        // ops_count = operations cerradas del seller en el período
        const { count: opsCount } = await (supabase.from("operations") as any)
          .select("id", { count: "exact", head: true })
          .eq("seller_id", sellerId)
          .in("status", ["CONFIRMED", "TRAVELLED", "CLOSED"])
          .gte("created_at", ts.gte)
          .lte("created_at", ts.lte)

        if (!leadsCount) {
          current_value = 0
        } else {
          current_value = ((opsCount || 0) / leadsCount) * 100
        }
        break
      }

      default:
        current_value = 0
    }
  } catch (error) {
    console.error(
      `[objectives-progress] Error calculando progreso objective=${objective.id} seller=${sellerId} metric=${objective.metric_type}:`,
      error
    )
    current_value = 0
  }

  const target_value = Number(objective.target_value) || 0
  const percentage =
    target_value > 0 ? (current_value / target_value) * 100 : 0
  const is_achieved = current_value >= target_value && target_value > 0

  return {
    objective_id: objective.id,
    current_value: Math.round(current_value * 100) / 100,
    target_value,
    percentage: Math.round(percentage * 100) / 100,
    is_achieved,
    period_start: periodStart,
    period_end: periodEnd,
  }
}
