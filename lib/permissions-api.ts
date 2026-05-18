/**
 * SISTEMA DE PERMISOS PARA APIs
 * 
 * Helper functions para aplicar filtros de permisos en API routes
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { isOwnDataOnly, hasPermission, type UserRole, type Module, type Permission } from "./permissions"

type SupportOperationsUser = {
  role: string
  id: string
  can_view_agency_operations_support?: boolean | null
  can_add_services_on_agency_operations?: boolean | null
}

type ScopedOperationResource = {
  agency_id: string | null
  seller_id: string | null
}

export type OperationAccessScope = "full" | "own" | "agency-support"

/**
 * Aplica filtros de permisos a una query de Supabase según el rol del usuario
 */
export function applyRoleFilters<T>(
  supabase: SupabaseClient<Database>,
  table: string,
  userRole: UserRole,
  userId: string,
  module: Module,
  agencyIds?: string[]
): any {
  let query = (supabase as any).from(table)

  // Si el rol solo puede ver sus propios datos, filtrar por user_id
  if (isOwnDataOnly(userRole, module)) {
    // Para diferentes tablas, el campo puede variar
    if (table === "leads") {
      query = query.eq("assigned_seller_id", userId)
    } else if (table === "operations") {
      query = query.eq("seller_id", userId)
    } else if (table === "commission_records") {
      query = query.eq("seller_id", userId)
    } else if (table === "alerts") {
      // Las alertas se filtran por el usuario relacionado
      query = query.or(`user_id.eq.${userId},assigned_to.eq.${userId}`)
    } else if (table === "cash_movements") {
      query = query.eq("user_id", userId)
    } else if (table === "customers") {
      // Para clientes, necesitamos filtrar por operaciones del vendedor
      // Esto se maneja de forma especial en las queries
      // Por ahora, retornamos la query sin filtrar y se maneja en el código específico
    }
  }

  // Filtrar por agencias si no es SUPER_ADMIN
  if (userRole !== "SUPER_ADMIN" && agencyIds && agencyIds.length > 0) {
    if (table === "operations" || table === "leads") {
      query = query.in("agency_id", agencyIds)
    }
  }

  return query
}

/**
 * Verifica si un usuario puede realizar una acción específica
 */
export function canPerformAction(
  user: { role: string; id: string },
  module: Module,
  permission: Permission
): boolean {
  return hasPermission(user.role as UserRole, module, permission)
}

export function hasAgencyOperationsSupportView(user: SupportOperationsUser): boolean {
  return user.role === "SELLER" && user.can_view_agency_operations_support === true
}

export function canAddAgencyOperationServices(user: SupportOperationsUser): boolean {
  return hasAgencyOperationsSupportView(user) && user.can_add_services_on_agency_operations === true
}

export function resolveOperationAccessScope(
  user: SupportOperationsUser,
  operation: ScopedOperationResource,
  agencyIds: string[]
): OperationAccessScope | null {
  if (user.role === "SUPER_ADMIN") {
    return "full"
  }

  const isWithinAssignedAgencies =
    !operation.agency_id ||
    agencyIds.length === 0 ||
    agencyIds.includes(operation.agency_id)

  if (!isWithinAssignedAgencies) {
    return null
  }

  if (user.role === "SELLER") {
    if (operation.seller_id === user.id) {
      return "own"
    }

    if (hasAgencyOperationsSupportView(user)) {
      return "agency-support"
    }

    return null
  }

  return "full"
}

/**
 * Aplica filtros de leads según el rol del usuario.
 * Multi-tenant: agencyIds ya viene acotado a la org del usuario (ver getUserAgencyIds),
 * así que filtrar por ellos también acota por org — incluso para SUPER_ADMIN.
 */
export function applyLeadsFilters(
  query: any,
  user: { role: string; id: string },
  agencyIds: string[]
): any {
  const userRole = user.role as UserRole

  // SELLER ve todos los leads de sus agencias (para poder ver listas compartidas en el CRM y arrastrar leads)
  if (userRole === "SELLER") {
    if (agencyIds.length > 0) {
      return query.in("agency_id", agencyIds)
    }
    // Fallback: solo sus leads asignados si no tiene agencias
    return query.eq("assigned_seller_id", user.id)
  }

  // CONTABLE no ve leads
  if (userRole === "CONTABLE") {
    throw new Error("No tiene permiso para ver leads")
  }

  // ADMIN / SUPER_ADMIN / VIEWER: siempre filtrar por las agencias de su org
  if (agencyIds.length > 0) {
    query = query.in("agency_id", agencyIds)
  }

  return query
}

/**
 * Aplica filtros de operaciones según el rol del usuario.
 * Multi-tenant: agencyIds viene acotado a la org, así que filtrar por ellos también
 * acota por org para todos los roles.
 */
export function applyOperationsFilters(
  query: any,
  user: SupportOperationsUser,
  agencyIds: string[]
): any {
  const userRole = user.role as UserRole

  // SELLER con permiso especial puede ver todas las operaciones de sus agencias
  if (userRole === "SELLER") {
    if (hasAgencyOperationsSupportView(user)) {
      if (agencyIds.length > 0) {
        return query.in("agency_id", agencyIds)
      }

      return query.eq("seller_id", user.id)
    }

    return query.eq("seller_id", user.id)
  }

  // ADMIN / SUPER_ADMIN / VIEWER / CONTABLE: filtrar por agencias de su org
  if (agencyIds.length > 0) {
    query = query.in("agency_id", agencyIds)
  }

  return query
}

/**
 * Aplica filtros de clientes según el rol del usuario.
 * Multi-tenant: clients.org_id es NOT NULL — filtramos por la org del usuario.
 * Sellers siguen con su restricción adicional de "solo clientes de mis operaciones".
 *
 * Retorna `{ query }` (wrapped) a propósito: PostgrestFilterBuilder es thenable,
 * y si lo retornáramos directo desde una función async, el `await` del caller
 * auto-ejecutaría la query y devolvería el response `{ data, error, ... }` en
 * vez del builder. Wrapping en objeto evita el auto-await.
 */
export async function applyCustomersFilters(
  query: any,
  user: { role: string; id: string },
  agencyIds: string[],
  supabase: SupabaseClient<Database>,
  context?: string
): Promise<{ query: any }> {
  const userRole = user.role as UserRole

  // Resolver org_id del usuario (una sola vez por request)
  const { data: userRow } = await supabase
    .from('users')
    .select('org_id')
    .eq('id', user.id)
    .maybeSingle()
  const orgId = (userRow as any)?.org_id as string | null | undefined

  if (orgId) {
    query = query.eq('org_id', orgId)
  }

  // SUPER_ADMIN, ADMIN y VIEWER ven TODOS los clientes de su org (sin restricción adicional)
  if (userRole === "SUPER_ADMIN" || userRole === "ADMIN" || userRole === "VIEWER") {
    return { query }
  }

  // CONTABLE no ve clientes
  if (userRole === "CONTABLE") {
    throw new Error("No tiene permiso para ver clientes")
  }

  // SELLER: en contexto de selector (crear operación), ver todos los clientes
  // para poder asignar cualquier cliente existente a una nueva operación
  if (userRole === "SELLER" && context === "selector") {
    return { query }
  }

  // SELLER en vista normal: solo ve clientes de sus operaciones
  if (userRole === "SELLER") {
    // Primero obtener las operaciones del vendedor
    const { data: operations } = await supabase
      .from("operations")
      .select("id")
      .eq("seller_id", user.id)

    const operationIds = (operations || []).map((op: any) => op.id)

    if (operationIds.length === 0) {
      // No tiene operaciones, retornar query que no devuelva resultados usando limit(0)
      return { query: query.limit(0) }
    }

    // Obtener customer_ids de operation_customers (chunked: .in() revienta URL con >300 UUIDs)
    const customerIds: string[] = []
    const chunkSize = 200
    for (let i = 0; i < operationIds.length; i += chunkSize) {
      const chunk = operationIds.slice(i, i + chunkSize)
      const { data: operationCustomers } = await supabase
        .from("operation_customers")
        .select("customer_id")
        .in("operation_id", chunk)
      if (operationCustomers) {
        for (const oc of operationCustomers as any[]) {
          if (oc.customer_id) customerIds.push(oc.customer_id)
        }
      }
    }

    if (customerIds.length === 0) {
      // No hay clientes asociados, retornar query que no devuelva resultados
      return { query: query.limit(0) }
    }

    return { query: query.in("id", customerIds) }
  }

  // Para otros roles no contemplados, retornar query vacío por seguridad
  return { query: query.limit(0) }
}

/**
 * Verifica si un usuario puede acceder a un recurso específico
 */
export function canAccessResource(
  userRole: UserRole,
  resourceOwnerId: string | null | undefined,
  currentUserId: string
): boolean {
  // SUPER_ADMIN y ADMIN pueden acceder a todo
  if (userRole === "SUPER_ADMIN" || userRole === "ADMIN") {
    return true
  }

  // CONTABLE puede acceder a recursos financieros (no aplica aquí)
  // VIEWER puede leer todo (no aplica aquí)

  // SELLER solo puede acceder a sus propios recursos
  if (userRole === "SELLER") {
    return resourceOwnerId === currentUserId
  }

  return false
}

async function getCustomerOperationAccessScopes(
  supabase: SupabaseClient<Database>,
  user: SupportOperationsUser,
  customerId: string
): Promise<OperationAccessScope[]> {
  const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as UserRole)

  const { data: operationCustomers } = await supabase
    .from("operation_customers")
    .select("operations:operation_id(agency_id, seller_id)")
    .eq("customer_id", customerId)

  const scopes = new Set<OperationAccessScope>()

  for (const relation of (operationCustomers || []) as Array<{ operations?: ScopedOperationResource | null }>) {
    if (!relation.operations) {
      continue
    }

    const scope = resolveOperationAccessScope(user, relation.operations, agencyIds)
    if (scope) {
      scopes.add(scope)
    }
  }

  return Array.from(scopes)
}

export async function canAccessDocumentResource(
  supabase: SupabaseClient<Database>,
  user: SupportOperationsUser,
  resource: {
    operationId?: string | null
    customerId?: string | null
  },
  options?: {
    write?: boolean
  }
): Promise<boolean> {
  const write = options?.write === true

  if (write && !canPerformAction(user, "documents", "write")) {
    return false
  }

  if (resource.operationId) {
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as UserRole)
    const { data: operation } = await (supabase.from("operations") as any)
      .select("agency_id, seller_id")
      .eq("id", resource.operationId)
      .maybeSingle()

    if (!operation) {
      return false
    }

    const scope = resolveOperationAccessScope(user, operation, agencyIds)
    if (!scope) {
      return false
    }

    return !write || scope !== "agency-support"
  }

  if (resource.customerId) {
    const scopes = await getCustomerOperationAccessScopes(supabase, user, resource.customerId)
    if (scopes.length === 0) {
      return user.role !== "SELLER" && (
        write
          ? canPerformAction(user, "documents", "write")
          : canPerformAction(user, "documents", "read")
      )
    }

    return !write || scopes.some((scope) => scope !== "agency-support")
  }

  return write
    ? canPerformAction(user, "documents", "write")
    : canPerformAction(user, "documents", "read")
}

/**
 * Trae las agencias accesibles para el user (con nombre), scoped por org.
 * Uso tipico: dropdown de "Agencia" en pages. Reemplaza el anti-patron:
 *   if (user.role === 'SUPER_ADMIN') supabase.from('agencies').select().order()
 * que no filtra por org y leakea agencias cross-tenant.
 *
 * - SUPER_ADMIN / CONTABLE: ven TODAS las agencias de SU org
 * - Otros roles: solo las agencias asignadas via user_agencies (y dentro de su org)
 * - User legacy sin org_id: fallback a comportamiento pre-SaaS
 */
export async function getScopedAgenciesForUser(
  supabase: SupabaseClient<Database>,
  user: { id: string; role: string; org_id?: string | null }
): Promise<Array<{ id: string; name: string }>> {
  let q = (supabase.from("agencies") as any).select("id, name").order("name")

  if (user.org_id) {
    q = q.eq("org_id", user.org_id)
  }

  if (user.role === "SUPER_ADMIN" || user.role === "CONTABLE" || user.role === "POST_VENTA") {
    const { data } = await q
    return (data || []) as Array<{ id: string; name: string }>
  }

  const { data: userAgencies } = await supabase
    .from("user_agencies")
    .select("agency_id")
    .eq("user_id", user.id)
  const assignedIds = (userAgencies || []).map((ua: any) => ua.agency_id as string)
  if (assignedIds.length === 0) return []

  q = q.in("id", assignedIds)
  const { data } = await q
  return (data || []) as Array<{ id: string; name: string }>
}

/**
 * Obtiene los IDs de agencias del usuario para filtrar queries.
 *
 * Multi-tenant: si el usuario tiene org_id, el resultado está acotado a las agencias
 * de SU org. SUPER_ADMIN y CONTABLE ven todas las agencias de la org, pero NO las de
 * otras orgs. Los demás roles solo ven las agencias a las que están asignados via
 * user_agencies (también acotado a su org).
 *
 * Usuarios legacy sin org_id caen al comportamiento pre-SaaS (ver todo globalmente si
 * es SUPER_ADMIN/CONTABLE). Esto preserva el modo dev con mock user y cualquier dato
 * huérfano que haya quedado fuera del backfill de la migración 132.
 */
export async function getUserAgencyIds(
  supabase: SupabaseClient<Database>,
  userId: string,
  userRole: UserRole
): Promise<string[]> {
  // Nota (2026-04-20): removimos `unstable_cache` porque producía falsos
  // positivos tras deploys — si una primera llamada tras migraciones
  // RLS o cambios de auth devolvía `[]`, Next.js cacheaba esa lista
  // vacía por 5 min, rompiendo endpoints como /api/analytics/pending-balances
  // que dependen de esta lista para filtrar (`.in("agency_id", [])` devuelve 0
  // rows). El costo de 2-3 SELECTs simples por request es despreciable y vale
  // la pena por la consistencia.

  // Buscar el org_id del usuario (nullable: usuarios pre-SaaS pueden no tenerlo)
  const { data: userRow } = await supabase
    .from('users')
    .select('org_id')
    .eq('id', userId)
    .maybeSingle()
  const orgId = (userRow as any)?.org_id as string | null | undefined

  if (userRole === 'SUPER_ADMIN' || userRole === 'ORG_OWNER' || userRole === 'CONTABLE' || userRole === 'POST_VENTA') {
    let q = supabase.from('agencies').select('id')
    if (orgId) q = q.eq('org_id', orgId)
    const { data: agencies } = await q
    return (agencies || []).map((a: any) => a.id)
  }

  // Roles con alcance limitado: intersección de user_agencies con agencias de la org
  const { data: userAgencies } = await supabase
    .from('user_agencies')
    .select('agency_id')
    .eq('user_id', userId)
  const assignedIds = (userAgencies || []).map((ua: any) => ua.agency_id as string)

  if (!orgId || assignedIds.length === 0) return assignedIds

  const { data: orgAgencies } = await supabase
    .from('agencies')
    .select('id')
    .eq('org_id', orgId)
    .in('id', assignedIds)
  return (orgAgencies || []).map((a: any) => a.id)
}

/**
 * Aplica filtros de reportes según el rol del usuario
 */
export function applyReportsFilters(
  user: { role: string; id: string },
  agencyIds: string[]
): { canAccess: boolean; ownDataOnly: boolean } {
  const userRole = user.role as UserRole

  // CONTABLE solo puede ver reportes financieros
  if (userRole === "CONTABLE") {
    return { canAccess: true, ownDataOnly: false }
  }

  // SELLER solo puede ver sus propios reportes
  if (userRole === "SELLER") {
    return { canAccess: true, ownDataOnly: true }
  }

  // Otros roles pueden ver todos los reportes
  return { canAccess: true, ownDataOnly: false }
}
