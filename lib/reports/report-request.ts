/**
 * Guard compartido de los endpoints de reportes.
 *
 * Resuelve auth, permisos, alcance por agencia y validación de query params una
 * sola vez para los cuatro reportes (gastos, comisiones, ventas, caja). El
 * chequeo de que el `agencyId` pedido esté dentro de las agencias visibles del
 * usuario es un control de seguridad: tener una única copia es el punto.
 *
 * Lo que cambia entre reportes son los parámetros, no el guard: por eso el spec
 * recibe el schema zod y los módulos de permiso, y todo lo demás es común.
 */

import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Module } from "@/lib/permissions"
import type { ResolvedPermissionsMatrix } from "@/lib/permissions-agency"
import { canPerformAction, isOwnDataOnlyResolved } from "@/lib/permissions-api"
import { getRequestPermissions } from "@/lib/permissions/request"

const AR_OFFSET_MS = 3 * 60 * 60 * 1000

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/** Campos que todo reporte acepta. Cada uno extiende este schema con lo suyo. */
export const baseReportQuerySchema = z.object({
  dateFrom: z.string().regex(DATE_ONLY).optional(),
  dateTo: z.string().regex(DATE_ONLY).optional(),
  agencyId: z.string().uuid().optional(),
})

export interface ReportRequestSpec<S extends z.ZodTypeAny> {
  /** Alcanza con tener lectura en UNO de estos módulos. */
  permissions: Module[]
  /** Módulo cuyo `ownDataOnly` acota el reporte a los datos del propio usuario. */
  ownDataModule: Module
  schema: S
  forbiddenMessage: string
  invalidMessage?: string
}

export interface ResolvedReportParamsBase {
  dateFrom: string
  dateTo: string
  agencyId: string | null
}

export type ResolvedReportRequest<P> =
  | { ok: false; status: number; error: string }
  | {
      ok: true
      supabase: SupabaseClient<any>
      user: any
      orgId: string
      /** Agencias visibles para el usuario. Vacío = sin restricción por agencia. */
      agencyIds: string[]
      matrix: ResolvedPermissionsMatrix | null
      /** Tiene lectura del módulo y NO está limitado a sus propios datos. */
      canViewAll: boolean
      /** Id del usuario cuando el reporte debe limitarse a lo propio; si no, null. */
      ownDataOnlyUserId: string | null
      params: P & ResolvedReportParamsBase
    }

/** Primer y último día del mes actual en hora Argentina. */
export function currentMonthRangeAR(now = new Date()): { from: string; to: string } {
  const shifted = new Date(now.getTime() - AR_OFFSET_MS)
  const y = shifted.getUTCFullYear()
  const m = shifted.getUTCMonth()
  const pad = (n: number) => String(n).padStart(2, "0")
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(lastDay)}` }
}

export async function resolveReportRequest<S extends z.ZodTypeAny>(
  request: Request,
  spec: ReportRequestSpec<S>
): Promise<ResolvedReportRequest<z.infer<S>>> {
  const { user, supabase, agencyIds, matrix } = await getRequestPermissions()

  const hasRead = spec.permissions.some((mod) =>
    canPerformAction(user, mod, "read", matrix ?? undefined)
  )
  if (!hasRead) {
    return { ok: false, status: 403, error: spec.forbiddenMessage }
  }

  // Multi-tenant: sin org no hay reporte posible. No se confía en RLS.
  if (!(user as any).org_id) {
    return { ok: false, status: 400, error: "Usuario sin organización asociada" }
  }
  const orgId = (user as any).org_id as string

  const { searchParams } = new URL(request.url)
  // "" y "ALL" son la forma en que la UI dice "sin filtro": se descartan antes
  // de validar para no obligar a cada schema a contemplarlos.
  const raw = Object.fromEntries(
    Array.from(searchParams.entries()).filter(([, v]) => v !== "" && v !== "ALL")
  )
  const parsed = spec.schema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      error: spec.invalidMessage ?? "Parámetros inválidos para el reporte",
    }
  }

  const data = parsed.data as z.infer<S> & Partial<ResolvedReportParamsBase>
  const fallback = currentMonthRangeAR()
  const dateFrom = data.dateFrom ?? fallback.from
  const dateTo = data.dateTo ?? fallback.to
  if (dateTo < dateFrom) {
    return { ok: false, status: 400, error: "El rango de fechas es inválido" }
  }

  // Un usuario no puede pedir el reporte de una oficina que no ve.
  // `agencyIds` vacío = usuario sin restricción de agencias.
  const agencyId = data.agencyId ?? null
  if (agencyId && agencyIds.length > 0 && !agencyIds.includes(agencyId)) {
    return { ok: false, status: 403, error: "No tiene acceso a esa agencia" }
  }

  const ownDataOnly = isOwnDataOnlyResolved(user, spec.ownDataModule, matrix ?? undefined)
  const canViewAll =
    canPerformAction(user, spec.ownDataModule, "read", matrix ?? undefined) && !ownDataOnly

  return {
    ok: true,
    supabase: supabase as any,
    user,
    orgId,
    agencyIds,
    matrix,
    canViewAll,
    ownDataOnlyUserId: ownDataOnly ? user.id : null,
    params: { ...data, dateFrom, dateTo, agencyId },
  }
}
