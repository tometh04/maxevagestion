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

const boolParam = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => value === "true")

const commissionsQuerySchema = baseReportQuerySchema.extend({
  currency: z.enum(["ARS", "USD"]).optional(),
  sellerId: z.string().uuid().optional(),
  // Qué información de la agencia se incluye. Default: nada (VIB-94).
  includeSale: boolParam,
  includeMargin: boolParam,
  includeReferrals: boolParam,
})

/**
 * Datos del paquete que el reporte puede incluir, a pedido.
 *
 * Pedido del cliente: la dirección necesita verlo todo, pero el mismo reporte
 * se le entrega a cada vendedor y ahí solo corresponde lo que ganó él. Por eso
 * es opt-in y no un permiso nuevo: el default no muestra nada de la agencia.
 */
export interface CommissionsReportInclude {
  /** Monto de venta de la operación. */
  sale: boolean
  /** Ganancia de la operación (margen), la base sobre la que se comisiona. */
  margin: boolean
  /** Sección con la comisión que le toca a cada socio referidor. */
  referrals: boolean
}

export interface CommissionsReportRequestParams {
  dateFrom: string
  dateTo: string
  currency: "ARS" | "USD"
  agencyId: string | null
  sellerId: string | null
  ownDataOnlyUserId: string | null
  include: CommissionsReportInclude
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

  // Un vendedor limitado a lo suyo no puede destildar el checkbox desde el query
  // string: la venta, la ganancia y los referidos son de la agencia. El guard va
  // acá, en el servidor, no en la pantalla que dibuja los checkboxes.
  const restricted = !!resolved.ownDataOnlyUserId
  const include = {
    sale: !restricted && resolved.params.includeSale,
    margin: !restricted && resolved.params.includeMargin,
    referrals: !restricted && resolved.params.includeReferrals,
  }

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
      include,
    },
  }
}
