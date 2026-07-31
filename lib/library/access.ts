import { canPerformAction } from "@/lib/permissions-api"
import type { ResolvedPermissionsMatrix } from "@/lib/permissions-agency"
import type { LibraryContext } from "./types"

// Errores del módulo. Las routes los mapean a status HTTP.

export class LibraryValidationError extends Error {
  constructor(message = "Datos inválidos") {
    super(message)
    this.name = "LibraryValidationError"
  }
}

export class LibraryNotFoundError extends Error {
  constructor(message = "Recurso no encontrado") {
    super(message)
    this.name = "LibraryNotFoundError"
  }
}

export class LibraryPersistenceError extends Error {
  constructor(message = "No se pudo completar la operación") {
    super(message)
    this.name = "LibraryPersistenceError"
  }
}

type LibraryUser = { id: string; role: string; is_independent_advisor?: boolean | null }

/**
 * ¿El usuario puede gestionar la Biblioteca (crear/editar/borrar)? Default:
 * solo ADMIN/ORG_OWNER/SUPER_ADMIN; configurable por la matriz de permisos.
 */
export function canManageLibrary(
  user: LibraryUser,
  matrix: ResolvedPermissionsMatrix | null
): boolean {
  return canPerformAction(user, "library", "write", matrix ?? undefined)
}

/**
 * Arma el contexto del módulo a partir de un usuario ya autenticado con org_id.
 * Lanza si no hay org_id (los callers ya deberían haberlo validado).
 */
export function buildLibraryContext(input: {
  supabase: LibraryContext["supabase"]
  user: { id: string; org_id?: string | null; role: string; roles?: string[] | null }
}): LibraryContext {
  const orgId = input.user.org_id
  if (!orgId) {
    throw new LibraryValidationError("Usuario sin organización asociada")
  }
  const userRoles =
    input.user.roles && input.user.roles.length > 0
      ? input.user.roles
      : [input.user.role]
  return {
    supabase: input.supabase,
    orgId,
    userId: input.user.id,
    userRoles,
  }
}
