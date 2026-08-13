"use client"

/**
 * PermissionsProvider — expone la matriz de permisos dinámicos resuelta a los
 * Client Components, para reemplazar el gating por `userRole ===` hardcodeado.
 *
 * Se siembra UNA vez en el layout del dashboard (que ya calcula
 * `resolvedPermissions`), evitando prop-drilling de `userRole`/`canEdit` por
 * todo el árbol.
 *
 * Importa solo helpers PUROS de "@/lib/permissions/resolved" y tipos de
 * "@/lib/permissions" — nada de esto toca la DB ni `react` cache, así que es
 * seguro en el bundle cliente.
 */

import { createContext, useContext, useMemo } from "react"
import {
  assertPermission,
  checkOwnDataOnly,
  type ResolvedPermissionsMatrix,
} from "@/lib/permissions/resolved"
import { isOwnDataOnly, type Module, type UserRole } from "@/lib/permissions"

type PermissionsContextValue = {
  role: UserRole
  matrix: ResolvedPermissionsMatrix | null
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null)

export function PermissionsProvider({
  role,
  matrix,
  children,
}: {
  role: UserRole
  matrix: ResolvedPermissionsMatrix | null
  children: React.ReactNode
}) {
  const value = useMemo(() => ({ role, matrix }), [role, matrix])
  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>
}

function usePermissionsContext(): PermissionsContextValue {
  const ctx = useContext(PermissionsContext)
  if (!ctx) {
    throw new Error("usePermissions debe usarse dentro de <PermissionsProvider>")
  }
  return ctx
}

/** Devuelve { role, matrix } crudos por si un componente necesita ambos. */
export function usePermissions(): PermissionsContextValue {
  return usePermissionsContext()
}

/**
 * Verifica un permiso (read/write/delete/export) contra la matriz resuelta.
 * Respeta el bypass de SUPER_ADMIN/ORG_OWNER y el fallback estático (matrix null).
 */
export function useCan(
  module: Module,
  permission: "read" | "write" | "delete" | "export"
): boolean {
  const { role, matrix } = usePermissionsContext()
  return assertPermission(role, matrix, module, permission)
}

/**
 * Indica si el usuario solo ve sus propios datos en el módulo.
 * SUPER_ADMIN/ORG_OWNER nunca están restringidos.
 */
export function useOwnDataOnly(module: Module): boolean {
  const { role, matrix } = usePermissionsContext()
  if (role === "SUPER_ADMIN" || role === "ORG_OWNER") return false
  return matrix ? checkOwnDataOnly(matrix, module) : isOwnDataOnly(role, module)
}
