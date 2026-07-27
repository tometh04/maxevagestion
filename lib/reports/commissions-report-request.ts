/**
 * Params y guard del Reporte de Comisiones (VIB-65).
 *
 * Mismo criterio que la pantalla de Comisiones: quien tiene lectura del módulo y
 * no está limitado a lo propio ve a todos los vendedores; el resto ve solo sus
 * comisiones, sin importar qué mande en el query string.
 */

import { z } from "zod"
import {
  baseReportQuerySchema,
  resolveReportRequest,
  type ResolvedReportRequest,
} from "@/lib/reports/report-request"

const commissionsQuerySchema = baseReportQuerySchema.extend({
  currency: z.enum(["ARS", "USD"]).optional(),
  sellerId: z.string().uuid().optional(),
})

export interface CommissionsReportRequestParams {
  dateFrom: string
  dateTo: string
  currency: "ARS" | "USD"
  agencyId: string | null
  sellerId: string | null
  ownDataOnlyUserId: string | null
}

export type ResolvedCommissionsReportRequest =
  | { ok: false; status: number; error: string }
  | {
      ok: true
      supabase: any
      orgId: string
      agencyIds: string[]
      params: CommissionsReportRequestParams
    }

export async function resolveCommissionsReportRequest(
  request: Request
): Promise<ResolvedCommissionsReportRequest> {
  const resolved: ResolvedReportRequest<z.infer<typeof commissionsQuerySchema>> =
    await resolveReportRequest(request, {
      permissions: ["commissions"],
      ownDataModule: "commissions",
      schema: commissionsQuerySchema,
      forbiddenMessage: "No tiene permiso para ver el reporte de comisiones",
      invalidMessage: "Parámetros inválidos para el reporte de comisiones",
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
