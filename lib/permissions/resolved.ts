/**
 * MATRIZ DE PERMISOS RESUELTA — helpers PUROS (client-safe)
 *
 * Este módulo NO toca la DB ni importa `react` cache, así que puede importarse
 * tanto en Server Components / API routes como en Client Components (el
 * PermissionsProvider). La resolución contra Supabase vive en
 * `lib/permissions-agency.ts`, que re-exporta todo lo de acá para no romper los
 * imports existentes.
 */

import {
  PERMISSIONS,
  INDEPENDENT_ADVISOR_PERMS,
  mergeRolePermissions,
  type Module,
  type UserRole,
} from "@/lib/permissions"

export type ResolvedModulePerms = {
  read: boolean
  write: boolean
  delete: boolean
  export: boolean
  ownDataOnly: boolean
}

/** module → ResolvedModulePerms */
export type ResolvedPermissionsMatrix = Record<string, ResolvedModulePerms>

/**
 * Se deriva de la matriz en vez de mantenerse a mano. Como lista paralela ya
 * había quedado desactualizada: un módulo nuevo no aparecía acá y entonces
 * `resolveUserPermissions` devolvía `undefined` para él, o sea que el permiso
 * quedaba en un limbo silencioso.
 */
export const ALL_MODULES: Module[] = Object.keys(PERMISSIONS.SUPER_ADMIN) as Module[]

/** Roles que siempre tienen full access — no consultan DB */
export const FULL_ACCESS_ROLES: UserRole[] = ["SUPER_ADMIN", "ORG_OWNER"]

/** Roles que pueden tener permisos personalizados por agencia */
export const CONFIGURABLE_ROLES: UserRole[] = ["ADMIN", "CONTABLE", "SELLER", "VIEWER", "POST_VENTA"]

export const FULL_ACCESS_MATRIX: ResolvedPermissionsMatrix = Object.fromEntries(
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

/** Techo de permisos de un asesor independiente (VIB-69), ya en formato resuelto. */
export const INDEPENDENT_ADVISOR_MATRIX: ResolvedPermissionsMatrix = Object.fromEntries(
  ALL_MODULES.map((m) => {
    const p = INDEPENDENT_ADVISOR_PERMS[m]
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

/**
 * Interseca una matriz resuelta con el techo del asesor independiente (VIB-69).
 *
 * Es una intersección, no un reemplazo: si la agencia le recortó todavía más los
 * permisos al vendedor, ese recorte se respeta. Lo que no puede pasar es lo
 * inverso — que un override de agencia, un rol adicional o un default futuro le
 * abran a un freelancer datos que no son suyos.
 */
export function clampMatrixForIndependentAdvisor(
  matrix: ResolvedPermissionsMatrix
): ResolvedPermissionsMatrix {
  const result: ResolvedPermissionsMatrix = {}
  for (const m of Object.keys(matrix)) {
    const current = matrix[m]
    const ceiling = INDEPENDENT_ADVISOR_MATRIX[m] ?? {
      read: false, write: false, delete: false, export: false, ownDataOnly: true,
    }
    result[m] = {
      read: current.read && ceiling.read,
      write: current.write && ceiling.write,
      delete: current.delete && ceiling.delete,
      export: current.export && ceiling.export,
      // OR: alcanza con que uno de los dos lo restrinja a datos propios.
      ownDataOnly: current.ownDataOnly || ceiling.ownDataOnly,
    }
  }
  return result
}

/**
 * Verifica un permiso específico contra una ResolvedPermissionsMatrix.
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
 * Helper para gates: dada la matrix ya resuelta, verifica un permiso.
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
  // Fallback estático (sin matrix: org_id null / dev)
  const defaults = buildDefaultMatrix(role as UserRole)
  return defaults[module]?.[permission] === true
}

/**
 * Retorna los módulos que tienen permisos customizados (difieren del default)
 * para un rol dado. Útil para el badge "Personalizado" en la UI.
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
