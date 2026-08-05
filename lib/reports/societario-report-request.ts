/**
 * Params y guard del Reporte Societario (VIB-101).
 *
 * Sobre el guard genérico (`lib/reports/report-request.ts`) se apilan dos capas
 * propias:
 *
 *  1. La lista de roles de `societario-access.ts`. `accounting.read` sola no
 *     alcanza: VIEWER la tiene en `true` y este reporte muestra el reparto entre
 *     socios. La lista RESTRINGE, nunca otorga — por eso corre después del
 *     guard, así un override por agencia que revoque `accounting` sigue
 *     bloqueando.
 *  2. El rechazo de `ownDataOnly`. Un resultado societario "limitado a mis
 *     datos" no significa nada; devolver un parcial que se lee como el total es
 *     peor que negar el acceso.
 */

import { z } from "zod"
import {
  baseReportQuerySchema,
  currentMonthRangeAR,
  resolveReportRequest,
  type ResolvedReportRequest,
} from "@/lib/reports/report-request"
import { canViewSocietarioReport } from "@/lib/reports/societario-access"

export { currentMonthRangeAR }

/** Alícuota por defecto: paquetes turísticos nacionales (pedido de Lozada). */
export const DEFAULT_IVA_RATE_PCT = 10.5

const societarioQuerySchema = baseReportQuerySchema.extend({
  currency: z.enum(["ARS", "USD"]).optional(),
  /**
   * Tipo de cambio único (USD→ARS) para todo el período, igual que en el
   * reporte de gastos. El tope es una guarda contra un dedazo.
   */
  exchangeRate: z.coerce.number().positive().max(1_000_000).optional(),
  /**
   * Alícuota de IVA sobre el margen, EN PORCENTAJE (10.5 = 10,5%).
   *
   * Es un parámetro del reporte, no un dato del sistema: no existe alícuota por
   * operación. Acepta 0 a propósito —no `.positive()`— para la org que ya carga
   * el IVA como gasto y no quiere estimarlo de nuevo acá.
   */
  ivaRatePct: z.coerce.number().min(0).max(100).optional(),
})

export interface SocietarioReportRequestParams {
  dateFrom: string
  dateTo: string
  currency: "ARS" | "USD"
  agencyId: string | null
  /** Agencias visibles del usuario. Vacío = sin restricción. */
  agencyIds: string[]
  /** null = TC de la fecha de cada movimiento. */
  exchangeRate: number | null
  /** En porcentaje, tal como lo eligió el usuario. */
  ivaRatePct: number
  /** Fracción lista para el agregador (0.105). Se convierte una sola vez, acá. */
  ivaRate: number
}

export type ResolvedSocietarioReportRequest =
  | { ok: false; status: number; error: string }
  | {
      ok: true
      supabase: any
      orgId: string
      params: SocietarioReportRequestParams
    }

const FORBIDDEN = "No tiene permiso para ver el reporte societario"

export async function resolveSocietarioReportRequest(
  request: Request
): Promise<ResolvedSocietarioReportRequest> {
  const resolved: ResolvedReportRequest<z.infer<typeof societarioQuerySchema>> =
    await resolveReportRequest(request, {
      permissions: ["accounting"],
      ownDataModule: "accounting",
      schema: societarioQuerySchema,
      forbiddenMessage: FORBIDDEN,
      invalidMessage: "Parámetros inválidos para el reporte societario",
    })

  if (!resolved.ok) return resolved

  if (!canViewSocietarioReport(resolved.user)) {
    return { ok: false, status: 403, error: FORBIDDEN }
  }

  if (resolved.ownDataOnlyUserId) {
    return { ok: false, status: 403, error: FORBIDDEN }
  }

  const ivaRatePct = resolved.params.ivaRatePct ?? DEFAULT_IVA_RATE_PCT

  return {
    ok: true,
    supabase: resolved.supabase,
    orgId: resolved.orgId,
    params: {
      dateFrom: resolved.params.dateFrom,
      dateTo: resolved.params.dateTo,
      currency: resolved.params.currency ?? "USD",
      agencyId: resolved.params.agencyId,
      agencyIds: resolved.agencyIds,
      exchangeRate: resolved.params.exchangeRate ?? null,
      ivaRatePct,
      ivaRate: ivaRatePct / 100,
    },
  }
}
