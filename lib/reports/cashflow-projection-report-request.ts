/**
 * Params y guard del Reporte de Caja y flujo proyectado (VIB-67).
 *
 * Expone cobranzas y deuda con operadores de todo el tenant: mismo permiso que
 * caja / contabilidad.
 *
 * A diferencia de los otros reportes, este no tiene rango de fechas: una
 * cobranza pendiente se debe hasta que se cobra. Lo configurable son los tramos
 * de vencimiento (`tramos=7,15,30`).
 */

import { z } from "zod"
import { resolveReportRequest, type ResolvedReportRequest } from "@/lib/reports/report-request"

const cashflowQuerySchema = z.object({
  agencyId: z.string().uuid().optional(),
  /** Lista de cortes en días, separados por coma. Ej: "7,15,30". */
  tramos: z
    .string()
    .regex(/^\d{1,4}(,\d{1,4}){0,5}$/)
    .optional(),
})

export interface CashflowProjectionReportRequestParams {
  agencyId: string | null
  tramos: number[] | undefined
  ownDataOnlyUserId: string | null
}

export type ResolvedCashflowProjectionReportRequest =
  | { ok: false; status: number; error: string }
  | {
      ok: true
      supabase: any
      orgId: string
      agencyIds: string[]
      params: CashflowProjectionReportRequestParams
    }

export async function resolveCashflowProjectionReportRequest(
  request: Request
): Promise<ResolvedCashflowProjectionReportRequest> {
  const resolved: ResolvedReportRequest<z.infer<typeof cashflowQuerySchema>> =
    await resolveReportRequest(request, {
      permissions: ["accounting", "cash"],
      ownDataModule: "cash",
      schema: cashflowQuerySchema,
      forbiddenMessage: "No tiene permiso para ver el reporte de caja",
      invalidMessage: "Parámetros inválidos para el reporte de caja",
    })

  if (!resolved.ok) return resolved

  const tramos = resolved.params.tramos
    ? resolved.params.tramos.split(",").map((n) => Number(n))
    : undefined

  return {
    ok: true,
    supabase: resolved.supabase,
    orgId: resolved.orgId,
    agencyIds: resolved.agencyIds,
    params: {
      agencyId: resolved.params.agencyId,
      tramos,
      ownDataOnlyUserId: resolved.ownDataOnlyUserId,
    },
  }
}
