/**
 * Params y guard del Reporte de Referidores (VIB-122).
 *
 * El gate es el módulo propio `referrals` (VIB-86): el vendedor que carga la
 * venta no tiene que ver cuánto se lleva el referidor, así que no accede a este
 * reporte. No hay noción de "solo lo mío": el referidor es un tercero externo,
 * no un usuario, y quien tiene `referrals.read` ve a todos los de sus agencias.
 */

import { z } from "zod"
import {
  baseReportQuerySchema,
  resolveReportRequest,
  type ResolvedReportRequest,
} from "@/lib/reports/report-request"

const referralsQuerySchema = baseReportQuerySchema.extend({
  currency: z.enum(["ARS", "USD"]).optional(),
  partnerId: z.string().uuid().optional(),
})

export interface ReferralsReportRequestParams {
  dateFrom: string
  dateTo: string
  currency: "ARS" | "USD"
  agencyId: string | null
  partnerId: string | null
}

export type ResolvedReferralsReportRequest =
  | { ok: false; status: number; error: string }
  | {
      ok: true
      supabase: any
      orgId: string
      agencyIds: string[]
      params: ReferralsReportRequestParams
    }

export async function resolveReferralsReportRequest(
  request: Request
): Promise<ResolvedReferralsReportRequest> {
  const resolved: ResolvedReportRequest<z.infer<typeof referralsQuerySchema>> =
    await resolveReportRequest(request, {
      permissions: ["referrals"],
      ownDataModule: "referrals",
      schema: referralsQuerySchema,
      forbiddenMessage: "No tiene permiso para ver el reporte de referidores",
      invalidMessage: "Parámetros inválidos para el reporte de referidores",
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
      partnerId: resolved.params.partnerId ?? null,
    },
  }
}
