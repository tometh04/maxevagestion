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
})

export interface ExpensesReportRequestParams {
  dateFrom: string
  dateTo: string
  currency: "ARS" | "USD"
  agencyId: string | null
  agencyMode: "office" | "account"
  type: "recurring" | "variable" | null
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
      ownDataOnlyUserId: resolved.ownDataOnlyUserId,
    },
  }
}
