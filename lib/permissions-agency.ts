/**
 * PERMISOS DINÁMICOS POR AGENCIA
 *
 * Capa de resolución que lee la tabla agency_role_permissions de Supabase
 * y la combina con los defaults estáticos de lib/permissions.ts.
 *
 * Comportamiento:
 * - SUPER_ADMIN / ORG_OWNER → full access hardcoded, sin consulta a DB
 * - Resto de roles → unión de permisos de todas las agencias del usuario
 * - Si no hay registros en DB para una (agency, role, module) → usa default estático
 */

import { cache } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import type { UserRole } from "@/lib/permissions"
import {
  ALL_MODULES,
  FULL_ACCESS_ROLES,
  FULL_ACCESS_MATRIX,
  CONFIGURABLE_ROLES,
  buildDefaultMatrix,
  buildDefaultMatrixMulti,
  type ResolvedModulePerms,
  type ResolvedPermissionsMatrix,
} from "@/lib/permissions/resolved"

// Re-export de los helpers PUROS (client-safe) para no romper los ~27 imports
// existentes que consumen estos símbolos desde "@/lib/permissions-agency".
export {
  ALL_MODULES,
  CONFIGURABLE_ROLES,
  buildDefaultMatrix,
  buildDefaultMatrixMulti,
  checkResolvedPermission,
  checkOwnDataOnly,
  assertPermission,
  getCustomizedModules,
} from "@/lib/permissions/resolved"
export type { ResolvedModulePerms, ResolvedPermissionsMatrix } from "@/lib/permissions/resolved"

type DbPermRow = {
  agency_id: string
  role: string
  module: string
  can_read: boolean
  can_write: boolean
  can_delete: boolean
  can_export: boolean
  own_data_only: boolean
}

/**
 * Carga los registros de agency_role_permissions para un conjunto de agencias y roles.
 * Retorna solo los registros que existen en DB (puede ser subconjunto de módulos).
 * Acepta uno o varios roles para soportar usuarios multi-rol.
 */
async function fetchAgencyPermissions(
  supabase: SupabaseClient<Database>,
  agencyIds: string[],
  roles: string | string[]
): Promise<DbPermRow[]> {
  if (agencyIds.length === 0) return []
  const roleArray = Array.isArray(roles) ? roles : [roles]
  if (roleArray.length === 0) return []

  const { data, error } = await (supabase as any)
    .from("agency_role_permissions")
    .select("agency_id, role, module, can_read, can_write, can_delete, can_export, own_data_only")
    .in("agency_id", agencyIds)
    .in("role", roleArray)

  if (error) {
    console.error("[permissions-agency] Error fetching permissions:", error.message)
    return []
  }

  return (data as DbPermRow[]) ?? []
}

/**
 * Resuelve la matriz efectiva de permisos para un usuario.
 *
 * Acepta un rol único (string) o múltiples roles (string[]) para soporte multi-rol.
 * Los callers existentes que pasan un string siguen funcionando sin cambios.
 *
 * Lógica:
 * 1. Si ANY rol es SUPER_ADMIN/ORG_OWNER → FULL_ACCESS_MATRIX sin DB
 * 2. Para cada módulo: OR de todas las agencias Y todos los roles con registro en DB
 * 3. Módulos sin registro en DB → usa default fusionado de todos los roles
 *
 * Cacheado con React.cache() para deduplicar dentro del mismo server request.
 */
export const resolveUserPermissions = cache(async (
  supabase: SupabaseClient<Database>,
  _userId: string,
  _orgId: string,
  roleOrRoles: string | string[],
  agencyIds: string[]
): Promise<ResolvedPermissionsMatrix> => {
  const roles = (Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles]) as UserRole[]

  if (roles.some((r) => FULL_ACCESS_ROLES.includes(r))) {
    return FULL_ACCESS_MATRIX
  }

  const rows = await fetchAgencyPermissions(supabase, agencyIds, roles.map(String))

  // Construir mapa: module → merged perms (OR de agencias y roles)
  const merged: Record<string, ResolvedModulePerms> = {}

  for (const row of rows) {
    const existing = merged[row.module]
    if (!existing) {
      merged[row.module] = {
        read: row.can_read,
        write: row.can_write,
        delete: row.can_delete,
        export: row.can_export,
        ownDataOnly: row.own_data_only,
      }
    } else {
      // OR: si cualquier agencia/rol lo habilita, el usuario lo tiene
      merged[row.module] = {
        read: existing.read || row.can_read,
        write: existing.write || row.can_write,
        delete: existing.delete || row.can_delete,
        export: existing.export || row.can_export,
        // AND: ownDataOnly=true solo si TODOS los registros lo tienen
        ownDataOnly: existing.ownDataOnly && row.own_data_only,
      }
    }
  }

  // Para módulos sin registro en DB → usar defaults fusionados de todos los roles
  const defaults = buildDefaultMatrixMulti(roles)
  const result: ResolvedPermissionsMatrix = {}
  for (const m of ALL_MODULES) {
    result[m] = merged[m] ?? defaults[m]
  }

  return result
})

/**
 * Carga la matriz completa de TODAS las agencias de una org y TODOS los roles
 * configurables, para mostrarla en la UI de gestión de permisos.
 *
 * Formato: { [agencyId]: { [role]: { [module]: ResolvedModulePerms } } }
 */
export async function loadFullAgencyMatrix(
  supabase: SupabaseClient<Database>,
  agencyId: string,
  orgId: string
): Promise<Record<string, ResolvedPermissionsMatrix>> {
  const { data, error } = await (supabase as any)
    .from("agency_role_permissions")
    .select("role, module, can_read, can_write, can_delete, can_export, own_data_only")
    .eq("agency_id", agencyId)
    .eq("org_id", orgId)

  if (error) {
    console.error("[permissions-agency] Error loading full matrix:", error.message)
  }

  const rows = (data as Omit<DbPermRow, "agency_id">[]) ?? []

  const result: Record<string, ResolvedPermissionsMatrix> = {}

  for (const role of CONFIGURABLE_ROLES) {
    const defaults = buildDefaultMatrix(role)
    const roleResult: ResolvedPermissionsMatrix = { ...defaults }

    for (const row of rows) {
      if (row.role !== role) continue
      roleResult[row.module] = {
        read: row.can_read,
        write: row.can_write,
        delete: row.can_delete,
        export: row.can_export,
        ownDataOnly: row.own_data_only,
      }
    }

    result[role] = roleResult
  }

  return result
}
