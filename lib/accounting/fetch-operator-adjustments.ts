/**
 * Ajustes de liquidación de operador de un período (VIB-174).
 *
 * Los lee el societario para poder mostrar la diferencia de costo del mes. Se
 * filtra por `accrual_date`, no por la fecha de la operación: el ajuste
 * pertenece al mes en que llegó la liquidación, que es todo el criterio de la
 * feature.
 *
 * Los revertidos quedan afuera: se revirtieron justamente porque no debían
 * impactar el resultado.
 */

import type { OperatorAdjustmentInput } from "@/lib/reports/societario-report"

const PAGE = 1000

export interface FetchOperatorAdjustmentsParams {
  supabase: any
  orgId: string
  dateFrom: string
  dateTo: string
  agencyId?: string | null
  agencyIds?: string[] | null
}

export interface FetchOperatorAdjustmentsResult {
  adjustments: OperatorAdjustmentInput[]
  /** El dataset se cortó por el tope de paginado. */
  truncated: boolean
}

export async function fetchOperatorAdjustments({
  supabase,
  orgId,
  dateFrom,
  dateTo,
  agencyId,
  agencyIds,
}: FetchOperatorAdjustmentsParams): Promise<FetchOperatorAdjustmentsResult> {
  const adjustments: OperatorAdjustmentInput[] = []

  for (let offset = 0; ; offset += PAGE) {
    let query = supabase
      .from("operator_cost_adjustments")
      .select("delta_amount, currency, accrual_date, agency_id")
      .eq("org_id", orgId)
      .gte("accrual_date", dateFrom)
      .lte("accrual_date", dateTo)
      .is("reversed_at", null)
      .order("id")
      .range(offset, offset + PAGE - 1)

    if (agencyId) query = query.eq("agency_id", agencyId)
    else if (agencyIds && agencyIds.length > 0) query = query.in("agency_id", agencyIds)

    const { data, error } = await query

    if (error) {
      // Best-effort, como el resto de las fuentes secundarias del societario:
      // el reporte tiene que salir igual. Se informa en consola y el reporte
      // simplemente no muestra la línea.
      console.error("[VIB-174] No se pudieron leer los ajustes de liquidación:", error)
      return { adjustments, truncated: false }
    }

    for (const row of data || []) {
      adjustments.push({
        deltaAmount: Number(row.delta_amount) || 0,
        currency: row.currency || "ARS",
        accrualDate: row.accrual_date,
        agencyId: row.agency_id ?? null,
      })
    }

    if (!data || data.length < PAGE) break

    // Tope defensivo: 10.000 ajustes en un período es un error de datos, no un
    // mes de trabajo. Se corta y se informa en vez de paginar para siempre.
    if (offset >= PAGE * 10) return { adjustments, truncated: true }
  }

  return { adjustments, truncated: false }
}
