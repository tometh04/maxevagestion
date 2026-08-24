import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import {
  canPerformAction,
  getUserAgencyIds,
  isOwnDataOnlyResolved,
  NO_MATCH_UUID,
} from "@/lib/permissions-api"
import { resolveUserPermissions } from "@/lib/permissions-agency"
import {
  getEffectiveAgencyScopeRole,
  isIndependentAdvisor,
  type Module,
  type Permission,
  type UserRole,
} from "@/lib/permissions"
import type { ResolvedPermissionsMatrix } from "@/lib/permissions/resolved"
import type { Database } from "@/lib/supabase/types"

export type AgencyPermissionMode = "full" | "own"

/**
 * Alcance efectivo para un único módulo/permiso, resuelto agencia por agencia.
 *
 * `memberAgencyIds` representa pertenencia; `agencyIds` sólo las agencias donde
 * el permiso solicitado está habilitado. Separar ambos evita que un override de
 * la agencia A autorice datos de la agencia B por la unión OR histórica de
 * `resolveUserPermissions`.
 */
export interface AgencyPermissionScope {
  module: Module
  permission: Permission
  userId: string
  memberAgencyIds: string[]
  agencyIds: string[]
  fullAgencyIds: string[]
  ownAgencyIds: string[]
  permissionsByAgency: Record<string, ResolvedPermissionsMatrix>
}

type AgencyScopedUser = {
  id: string
  org_id: string | null
  role: string
  roles?: string[] | null
  is_independent_advisor?: boolean | null
}

export async function resolveAgencyPermissionScope(
  supabase: SupabaseClient<Database>,
  user: AgencyScopedUser,
  module: Module,
  permission: Permission
): Promise<AgencyPermissionScope> {
  if (!user.org_id) {
    return {
      module,
      permission,
      userId: user.id,
      memberAgencyIds: [],
      agencyIds: [],
      fullAgencyIds: [],
      ownAgencyIds: [],
      permissionsByAgency: {},
    }
  }

  const roles = (user.roles?.length ? user.roles : [user.role]) as UserRole[]
  // El techo AVI también aplica a la membresía. Un additional role ADMIN o
  // CONTABLE no puede convertir el lookup de SELLER (user_agencies) en todas
  // las agencias del tenant.
  const effectiveAgencyRole = isIndependentAdvisor(user)
    ? "SELLER"
    : getEffectiveAgencyScopeRole(roles)
  const memberAgencyIds = await getUserAgencyIds(supabase, user.id, effectiveAgencyRole)
  const resolved = await Promise.all(
    memberAgencyIds.map(async (agencyId) => ({
      agencyId,
      permissions: await resolveUserPermissions(
        supabase,
        user.id,
        user.org_id!,
        roles,
        [agencyId]
      ),
    }))
  )

  const fullAgencyIds: string[] = []
  const ownAgencyIds: string[] = []
  const permissionsByAgency: Record<string, ResolvedPermissionsMatrix> = {}

  for (const entry of resolved) {
    permissionsByAgency[entry.agencyId] = entry.permissions
    if (!canPerformAction(user, module, permission, entry.permissions)) continue

    if (isOwnDataOnlyResolved(user, module, entry.permissions)) {
      ownAgencyIds.push(entry.agencyId)
    } else {
      fullAgencyIds.push(entry.agencyId)
    }
  }

  return {
    module,
    permission,
    userId: user.id,
    memberAgencyIds,
    agencyIds: [...fullAgencyIds, ...ownAgencyIds],
    fullAgencyIds,
    ownAgencyIds,
    permissionsByAgency,
  }
}

export function agencyPermissionMode(
  scope: AgencyPermissionScope,
  agencyId: string | null | undefined
): AgencyPermissionMode | null {
  if (!agencyId) return null
  if (scope.fullAgencyIds.includes(agencyId)) return "full"
  if (scope.ownAgencyIds.includes(agencyId)) return "own"
  return null
}

export function canAccessAgencyResource(
  scope: AgencyPermissionScope,
  resource: {
    agency_id: string | null | undefined
    seller_id?: string | null | undefined
  }
): boolean {
  const mode = agencyPermissionMode(scope, resource.agency_id)
  if (mode === "full") return true
  return mode === "own" && resource.seller_id === scope.userId
}

/**
 * Aplica en una sola query el scope mixto:
 *
 *   agencia full OR (agencia own AND seller = usuario)
 *
 * La query del caller debe incluir además el filtro de `org_id`. Si no existe
 * ninguna agencia permitida se agrega un UUID imposible, nunca `.limit(0)`.
 */
export function applyAgencyPermissionScope(
  query: any,
  scope: AgencyPermissionScope,
  options: {
    agencyColumn?: string
    sellerColumn?: string
    emptyIdColumn?: string
  } = {}
): any {
  const agencyColumn = options.agencyColumn ?? "agency_id"
  const sellerColumn = options.sellerColumn ?? "seller_id"
  const emptyIdColumn = options.emptyIdColumn ?? "id"

  if (scope.fullAgencyIds.length === 0 && scope.ownAgencyIds.length === 0) {
    return query.eq(emptyIdColumn, NO_MATCH_UUID)
  }
  if (scope.ownAgencyIds.length === 0) {
    return query.in(agencyColumn, scope.fullAgencyIds)
  }
  if (scope.fullAgencyIds.length === 0) {
    return query
      .in(agencyColumn, scope.ownAgencyIds)
      .eq(sellerColumn, scope.userId)
  }

  return query.or(
    `${agencyColumn}.in.(${scope.fullAgencyIds.join(",")}),` +
      `and(${agencyColumn}.in.(${scope.ownAgencyIds.join(",")}),${sellerColumn}.eq.${scope.userId})`
  )
}
