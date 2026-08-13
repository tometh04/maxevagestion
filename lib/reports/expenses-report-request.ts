/**
 * Params y guard del Reporte de Gastos (VIB-64).
 *
 * El guard genérico vive en `lib/reports/report-request.ts`, compartido con los
 * reportes de comisiones, ventas y caja. Acá solo queda lo propio de gastos:
 * el schema de sus filtros y los módulos de permiso que lo habilitan.
 */

import { z } from "zod"
import {
  baseReportQuerySchema,
  currentMonthRangeAR,
  resolveReportRequest,
  type ResolvedReportRequest,
} from "@/lib/reports/report-request"

export { currentMonthRangeAR }

const expensesQuerySchema = baseReportQuerySchema.extend({
  currency: z.enum(["ARS", "USD"]).optional(),
  agencyMode: z.enum(["office", "account"]).optional(),
  type: z.enum(["recurring", "variable"]).optional(),
  /**
   * Tipo de cambio único (USD→ARS) para convertir TODO el período.
   *
   * Sin este parámetro se usa el TC de la fecha de cada gasto, que es el costo
   * real acumulado. Con él, todo se valúa a una sola cotización: es lo que pidió
   * el cliente para el cierre de mes, donde dolarizan gastos que se pagaron en
   * pesos (sueldos, alquiler) a la cotización que ellos definen.
   *
   * Llega como string por querystring. El tope es una guarda contra un dedazo
   * —un cero de más multiplicaría el reporte por diez— y no una cotización
   * plausible.
   */
  exchangeRate: z.coerce.number().positive().max(1_000_000).optional(),
})

export interface ExpensesReportRequestParams {
  dateFrom: string
  dateTo: string
  currency: "ARS" | "USD"
  agencyId: string | null
  agencyMode: "office" | "account"
  type: "recurring" | "variable" | null
  /** null = TC de la fecha de cada gasto. */
  exchangeRate: number | null
  ownDataOnlyUserId: string | null
}

export type ResolvedExpensesReportRequest =
  | { ok: false; status: number; error: string }
  | {
      ok: true
      supabase: any
      orgId: string
      params: ExpensesReportRequestParams
    }

export async function resolveExpensesReportRequest(
  request: Request
): Promise<ResolvedExpensesReportRequest> {
  // Mismo permiso que la pantalla de Gastos: quien puede ver egresos puede
  // reportarlos. El reporte no amplía alcance, solo lo presenta.
  const resolved: ResolvedReportRequest<z.infer<typeof expensesQuerySchema>> =
    await resolveReportRequest(request, {
      permissions: ["accounting", "cash"],
      ownDataModule: "cash",
      schema: expensesQuerySchema,
      forbiddenMessage: "No tiene permiso para ver el reporte de gastos",
      invalidMessage: "Parámetros inválidos para el reporte de gastos",
    })

  if (!resolved.ok) return resolved

  return {
    ok: true,
    supabase: resolved.supabase,
    orgId: resolved.orgId,
    params: {
      dateFrom: resolved.params.dateFrom,
      dateTo: resolved.params.dateTo,
      currency: resolved.params.currency ?? "ARS",
      agencyId: resolved.params.agencyId,
      agencyMode: resolved.params.agencyMode ?? "office",
      type: resolved.params.type ?? null,
      exchangeRate: resolved.params.exchangeRate ?? null,
      ownDataOnlyUserId: resolved.ownDataOnlyUserId,
    },
  }
}
