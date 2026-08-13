/**
 * Params y guard del Reporte de Ventas por producto (VIB-66).
 *
 * Mismo permiso que el resto de Reportes (`reports.read`), con el
 * `ownDataOnly` del módulo acotando a un vendedor a sus propias ventas.
 */

import { z } from "zod"
import {
  baseReportQuerySchema,
  resolveReportRequest,
  type ResolvedReportRequest,
} from "@/lib/reports/report-request"

const salesBreakdownQuerySchema = baseReportQuerySchema.extend({
  currency: z.enum(["ARS", "USD"]).optional(),
  sellerId: z.string().uuid().optional(),
})

export interface SalesBreakdownReportRequestParams {
  dateFrom: string
  dateTo: string
  currency: "ARS" | "USD"
  agencyId: string | null
  sellerId: string | null
  ownDataOnlyUserId: string | null
}

export type ResolvedSalesBreakdownReportRequest =
  | { ok: false; status: number; error: string }
  | {
      ok: true
      supabase: any
      orgId: string
      agencyIds: string[]
      params: SalesBreakdownReportRequestParams
    }

export async function resolveSalesBreakdownReportRequest(
  request: Request
): Promise<ResolvedSalesBreakdownReportRequest> {
  const resolved: ResolvedReportRequest<z.infer<typeof salesBreakdownQuerySchema>> =
    await resolveReportRequest(request, {
      permissions: ["reports"],
      ownDataModule: "reports",
      schema: salesBreakdownQuerySchema,
      forbiddenMessage: "No tiene permiso para ver el reporte de ventas",
      invalidMessage: "Parámetros inválidos para el reporte de ventas",
    })

  if (!resolved.ok) return resolved

  return {
    ok: true,
    supabase: resolved.supabase,
    orgId: resolved.orgId,
    agencyIds: resolved.agencyIds,
    params: {
      dateFrom: resolved.params.dateFrom,
      dateTo: resolved.params.dateTo,
      currency: resolved.params.currency ?? "ARS",
      agencyId: resolved.params.agencyId,
      sellerId: resolved.params.sellerId ?? null,
      ownDataOnlyUserId: resolved.ownDataOnlyUserId,
    },
  }
}
