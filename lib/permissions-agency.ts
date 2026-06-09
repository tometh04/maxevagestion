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
import { PERMISSIONS, mergeRolePermissions, type Module, type UserRole } from "@/lib/permissions"

export type ResolvedModulePerms = {
  read: boolean
  write: boolean
  delete: boolean
  export: boolean
  ownDataOnly: boolean
}

/** module → ResolvedModulePerms */
export type ResolvedPermissionsMatrix = Record<string, ResolvedModulePerms>

const ALL_MODULES: Module[] = [
  "dashboard", "leads", "operations", "customers", "operators",
  "cash", "accounting", "alerts", "reports", "commissions",
  "settings", "documents", "tasks",
]

/** Roles que siempre tienen full access — no consultan DB */
const FULL_ACCESS_ROLES: UserRole[] = ["SUPER_ADMIN", "ORG_OWNER"]

/** Roles que pueden tener permisos personalizados por agencia */
export const CONFIGURABLE_ROLES: UserRole[] = ["ADMIN", "CONTABLE", "SELLER", "VIEWER", "POST_VENTA"]

const FULL_ACCESS_MATRIX: ResolvedPermissionsMatrix = Object.fromEntries(
  ALL_MODULES.map((m) => [
    m,
    { read: true, write: true, delete: true, export: true, ownDataOnly: false },
  ])
)

/** Convierte la matriz estática de un rol al formato ResolvedPermissionsMatrix */
export function buildDefaultMatrix(role: UserRole): ResolvedPermissionsMatrix {
  if (FULL_ACCESS_ROLES.includes(role)) return FULL_ACCESS_MATRIX
  const rolePerms = PERMISSIONS[role]
  return Object.fromEntries(
    ALL_MODULES.map((m) => {
      const p = rolePerms?.[m]
      return [
        m,
        {
          read: p?.read ?? false,
          write: p?.write ?? false,
          delete: p?.delete ?? false,
          export: p?.export ?? false,
          ownDataOnly: p?.ownDataOnly ?? false,
        },
      ]
    })
  )
}

/**
 * Versión multi-rol de buildDefaultMatrix.
 * Fusiona la matriz estática de múltiples roles con OR/AND logic.
 */
export function buildDefaultMatrixMulti(roles: UserRole[]): ResolvedPermissionsMatrix {
  if (roles.length === 0) return buildDefaultMatrix("VIEWER" as UserRole)
  if (roles.length === 1) return buildDefaultMatrix(roles[0])
  if (roles.some((r) => FULL_ACCESS_ROLES.includes(r))) return FULL_ACCESS_MATRIX

  const merged = mergeRolePermissions(roles)
  return Object.fromEntries(
    ALL_MODULES.map((m) => {
      const p = merged[m]
      return [
        m,
        {
          read: p?.read ?? false,
          write: p?.write ?? false,
          delete: p?.delete ?? false,
          export: p?.export ?? false,
          ownDataOnly: p?.ownDataOnly ?? false,
        },
      ]
    })
  )
}

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
 * Verifica un permiso específico contra una ResolvedPermissionsMatrix.
 * Usado por canPerformAction cuando se pasa matrix dinámica.
 */
export function checkResolvedPermission(
  matrix: ResolvedPermissionsMatrix,
  module: string,
  permission: "read" | "write" | "delete" | "export"
): boolean {
  return matrix[module]?.[permission] === true
}

/**
 * Verifica si el rol solo puede ver sus propios datos en el módulo,
 * según la matrix resuelta.
 */
export function checkOwnDataOnly(
  matrix: ResolvedPermissionsMatrix,
  module: string
): boolean {
  return matrix[module]?.ownDataOnly === true
}

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

/**
 * Helper para API routes: dada la matrix ya resuelta, verifica un permiso.
 * Patrón recomendado cuando la ruta ya llamó resolveUserPermissions():
 *
 *   const agencyIds = await getUserAgencyIds(supabase, user.id, user.role)
 *   const perms = await resolveUserPermissions(supabase, user.id, org_id, user.role, agencyIds)
 *   if (!assertPermission(user.role, perms, "accounting", "read")) return 403
 *
 * Incluye el bypass de SUPER_ADMIN/ORG_OWNER y el fallback estático cuando
 * no hay matrix (org_id null / dev mode).
 */
export function assertPermission(
  role: string,
  matrix: ResolvedPermissionsMatrix | null,
  module: string,
  permission: "read" | "write" | "delete" | "export"
): boolean {
  if (role === "SUPER_ADMIN" || role === "ORG_OWNER") return true
  if (matrix) return checkResolvedPermission(matrix, module, permission)
  // Fallback estático (sin importar permissions-api para evitar circular dep)
  const defaults = buildDefaultMatrix(role as UserRole)
  return defaults[module]?.[permission] === true
}

/**
 * Retorna los módulos que tienen permisos customizados en DB (difieren del default)
 * para una agencia y rol dados. Útil para mostrar badge "Personalizado" en la UI.
 */
export function getCustomizedModules(
  matrix: ResolvedPermissionsMatrix,
  role: UserRole
): string[] {
  const defaults = buildDefaultMatrix(role)
  return ALL_MODULES.filter((m) => {
    const d = defaults[m]
    const c = matrix[m]
    return (
      d.read !== c.read ||
      d.write !== c.write ||
      d.delete !== c.delete ||
      d.export !== c.export ||
      d.ownDataOnly !== c.ownDataOnly
    )
  })
}
