/**
 * Auth + permisos + validación de query params del Reporte de Gastos.
 * Lo comparten `/api/reports/expenses` (JSON para la pantalla) y
 * `/api/reports/expenses/pdf` (descarga), para que ambos apliquen exactamente
 * el mismo guard de tenant, de permisos y de alcance por agencia.
 */

import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import { canPerformAction, isOwnDataOnlyResolved } from "@/lib/permissions-api"
import { getRequestPermissions } from "@/lib/permissions/request"

const AR_OFFSET_MS = 3 * 60 * 60 * 1000

const querySchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  currency: z.enum(["ARS", "USD"]).optional(),
  agencyId: z.string().uuid().optional(),
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
      supabase: SupabaseClient<any>
      orgId: string
      params: ExpensesReportRequestParams
    }

/** Primer y último día del mes actual en hora Argentina. */
function currentMonthRangeAR(now = new Date()): { from: string; to: string } {
  const shifted = new Date(now.getTime() - AR_OFFSET_MS)
  const y = shifted.getUTCFullYear()
  const m = shifted.getUTCMonth()
  const pad = (n: number) => String(n).padStart(2, "0")
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return {
    from: `${y}-${pad(m + 1)}-01`,
    to: `${y}-${pad(m + 1)}-${pad(lastDay)}`,
  }
}

export async function resolveExpensesReportRequest(
  request: Request
): Promise<ResolvedExpensesReportRequest> {
  const { user, supabase, agencyIds, matrix } = await getRequestPermissions()

  // Mismo permiso que la pantalla de Gastos: quien puede ver egresos puede
  // reportarlos. El reporte no amplía alcance, solo lo presenta.
  if (
    !canPerformAction(user, "accounting", "read", matrix ?? undefined) &&
    !canPerformAction(user, "cash", "read", matrix ?? undefined)
  ) {
    return { ok: false, status: 403, error: "No tiene permiso para ver el reporte de gastos" }
  }

  if (!(user as any).org_id) {
    return { ok: false, status: 400, error: "Usuario sin organización asociada" }
  }
  const orgId = (user as any).org_id as string

  const { searchParams } = new URL(request.url)
  const raw = Object.fromEntries(
    Array.from(searchParams.entries()).filter(([, v]) => v !== "" && v !== "ALL")
  )
  const parsed = querySchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, status: 400, error: "Parámetros inválidos para el reporte de gastos" }
  }

  const fallbackRange = currentMonthRangeAR()
  const dateFrom = parsed.data.dateFrom ?? fallbackRange.from
  const dateTo = parsed.data.dateTo ?? fallbackRange.to
  if (dateTo < dateFrom) {
    return { ok: false, status: 400, error: "El rango de fechas es inválido" }
  }

  // Alcance por agencia: un usuario no puede pedir el reporte de una oficina
  // que no ve. `agencyIds` vacío = usuario sin restricción de agencias.
  const agencyId = parsed.data.agencyId ?? null
  if (agencyId && agencyIds.length > 0 && !agencyIds.includes(agencyId)) {
    return { ok: false, status: 403, error: "No tiene acceso a esa agencia" }
  }

  return {
    ok: true,
    supabase,
    orgId,
    params: {
      dateFrom,
      dateTo,
      currency: parsed.data.currency ?? "ARS",
      agencyId,
      agencyMode: parsed.data.agencyMode ?? "office",
      type: parsed.data.type ?? null,
      ownDataOnlyUserId: isOwnDataOnlyResolved(user, "cash", matrix ?? undefined) ? user.id : null,
    },
  }
}
