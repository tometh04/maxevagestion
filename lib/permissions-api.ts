/**
 * SISTEMA DE PERMISOS PARA APIs
 * 
 * Helper functions para aplicar filtros de permisos en API routes
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import {
  isOwnDataOnly,
  hasPermission,
  isIndependentAdvisor,
  INDEPENDENT_ADVISOR_PERMS,
  type UserRole,
  type Module,
  type Permission,
} from "./permissions"
import { checkResolvedPermission, checkOwnDataOnly, type ResolvedPermissionsMatrix } from "./permissions-agency"

type SupportOperationsUser = {
  role: string
  id: string
  can_view_agency_operations_support?: boolean | null
  can_add_services_on_agency_operations?: boolean | null
  can_create_operations_for_other_sellers?: boolean | null
  can_register_payments_on_agency_operations?: boolean | null
  /** VIB-69: asesor de viajes independiente (SELLER endurecido). */
  is_independent_advisor?: boolean | null
}

type ScopedOperationResource = {
  agency_id: string | null
  seller_id: string | null
}

// "agency-payments": SELLER con can_register_payments_on_agency_operations. Ve y
// abre operaciones de sus agencias en modo SOLO cobros/pagos: puede imputar
// pagos (el gate real vive en /api/payments), pero NO editar la operación,
// pasajeros, documentos ni servicios. Es más acotado que "full" y distinto de
// "agency-support" (postventa), que en cambio oculta el tab de pagos.
export type OperationAccessScope = "full" | "own" | "agency-support" | "agency-payments"

/**
 * UUID que no puede existir como PK. Se usa para construir un filtro que no
 * matchea nada.
 */
export const NO_MATCH_UUID = "00000000-0000-0000-0000-000000000000"

/**
 * Devuelve la query acotada a CERO filas, de forma que el caller no pueda
 * deshacerlo sin querer.
 *
 * 🔴 Fix (VIB-69): acá antes se usaba `.limit(0)`. Es una trampa: `.limit()` y
 * `.range()` escriben el MISMO parámetro `limit` de PostgREST, y `.set()` pisa
 * el valor anterior. Todo endpoint que después pagina —
 * `query.order(...).range(offset, offset + limit - 1)`, que es el patrón normal
 * del repo — convertía el `limit=0` en `limit=2000` y devolvía TODO lo que
 * quedaba después de los filtros que sí sobrevivían (típicamente solo `org_id`).
 *
 * Se veía como un vendedor sin clientes propios mirando la base entera de la
 * agencia: el caso "no tiene nada" era justamente el que abría todo.
 *
 * Un `.eq()` sobre un UUID imposible sí sobrevive a la paginación.
 */
function emptyResult(query: any): any {
  return query.eq("id", NO_MATCH_UUID)
}

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
 * Verifica si un usuario puede realizar una acción específica.
 *
 * Si se pasa resolvedMatrix (permisos dinámicos por agencia), se usa esa.
 * Sin matrix → fallback a permisos estáticos de lib/permissions.ts.
 * SUPER_ADMIN y ORG_OWNER siempre retornan true sin importar la matrix.
 */
export function canPerformAction(
  user: { role: string; id: string; is_independent_advisor?: boolean | null },
  module: Module,
  permission: Permission,
  resolvedMatrix?: ResolvedPermissionsMatrix
): boolean {
  // VIB-69: el techo del asesor independiente se aplica acá, no en cada route,
  // porque muchos gates llaman a canPerformAction() sin matrix resuelta (fallback
  // estático de SELLER) y esa rama le habilitaría leads.
  if (isIndependentAdvisor(user) && INDEPENDENT_ADVISOR_PERMS[module]?.[permission] !== true) {
    return false
  }
  if (user.role === "SUPER_ADMIN" || user.role === "ORG_OWNER") return true
  if (resolvedMatrix) return checkResolvedPermission(resolvedMatrix, module, permission)
  return hasPermission(user.role as UserRole, module, permission)
}

/**
 * Verifica si el usuario solo puede ver sus propios datos en el módulo.
 * Acepta matrix dinámica opcional; sin ella usa el static default.
 */
export function isOwnDataOnlyResolved(
  user: { role: string; is_independent_advisor?: boolean | null },
  module: Module,
  resolvedMatrix?: ResolvedPermissionsMatrix
): boolean {
  // VIB-69: para un asesor independiente alcanza con que el techo lo restrinja,
  // aunque la agencia le haya apagado ownDataOnly al rol SELLER.
  if (isIndependentAdvisor(user) && INDEPENDENT_ADVISOR_PERMS[module]?.ownDataOnly === true) {
    return true
  }
  if (user.role === "SUPER_ADMIN" || user.role === "ORG_OWNER") return false
  if (resolvedMatrix) return checkOwnDataOnly(resolvedMatrix, module)
  return isOwnDataOnly(user.role as UserRole, module)
}

/**
 * Los permisos especiales de agencia (postventa, cargar a nombre de otro,
 * registrar cobros de terceros) son ampliaciones sobre el vendedor de la
 * agencia. Un asesor independiente es externo: nunca los recibe, aunque el flag
 * quede prendido en su fila por un cambio de rol previo.
 */
function canReceiveAgencyOperationPerms(user: SupportOperationsUser): boolean {
  return user.role === "SELLER" && !isIndependentAdvisor(user)
}

export function hasAgencyOperationsSupportView(user: SupportOperationsUser): boolean {
  return canReceiveAgencyOperationPerms(user) && user.can_view_agency_operations_support === true
}

export function canAddAgencyOperationServices(user: SupportOperationsUser): boolean {
  return hasAgencyOperationsSupportView(user) && user.can_add_services_on_agency_operations === true
}

/**
 * ¿El vendedor puede cargar operaciones a nombre de OTRO vendedor?
 * Sólo aplica a SELLER: los demás roles (ADMIN, SUPER_ADMIN, etc.) ya pueden
 * asignar cualquier vendedor sin necesidad de este flag. Opt-in por usuario,
 * lo habilita el admin desde "Permisos especiales".
 */
export function canCreateOperationsForOtherSellers(user: SupportOperationsUser): boolean {
  return canReceiveAgencyOperationPerms(user) && user.can_create_operations_for_other_sellers === true
}

/**
 * ¿El usuario puede elegir un VENDEDOR SECUNDARIO al cargar una operación?
 *
 * Es distinto de `canCreateOperationsForOtherSellers` (VIB-105): ese permiso
 * decide de quién ES la operación (cargarla a nombre de otro). El secundario no
 * cambia la propiedad: es una venta compartida donde el principal parte su
 * comisión con un compañero de sus mismas agencias. Eso lo hace cualquier
 * vendedor sin permiso especial, así que gatear el secundario con ese flag
 * dejaba a los SELLER comunes sin poder cargar ventas compartidas.
 *
 * La única excepción es el asesor independiente (VIB-69): es externo a la
 * agencia, no ve al equipo y no comparte comisiones con él.
 *
 * El vendedor concreto igual se valida contra las agencias del usuario con
 * `isSellerWithinUserAgencies`.
 */
export function canAssignSecondarySeller(user: SupportOperationsUser): boolean {
  return !isIndependentAdvisor(user)
}

/**
 * ¿El vendedor puede registrar cobros/pagos en operaciones de OTRO vendedor de
 * sus mismas agencias? Sólo aplica a SELLER (los demás roles con acceso a caja
 * ya operan sobre toda su agencia). Opt-in por usuario, lo habilita el admin
 * desde "Permisos especiales". El alcance es SOLO plata: no habilita editar la
 * operación ni sus datos. La pertenencia a la agencia se valida en el gate de
 * /api/payments; acá sólo resolvemos el flag.
 */
export function canRegisterPaymentsOnAgencyOperations(user: SupportOperationsUser): boolean {
  return canReceiveAgencyOperationPerms(user) && user.can_register_payments_on_agency_operations === true
}

/**
 * Valida que un vendedor destino pertenezca a alguna de las agencias del usuario
 * actual (acotado a su org: agencyIds ya viene filtrado por org, ver getUserAgencyIds).
 * Se usa para restringir "cargar a nombre de otro" a vendedores de las mismas
 * agencias, no de toda la organización.
 */
export async function isSellerWithinUserAgencies(
  supabase: SupabaseClient<Database>,
  targetSellerId: string,
  agencyIds: string[]
): Promise<boolean> {
  if (!targetSellerId || agencyIds.length === 0) return false
  const { data } = await supabase
    .from("user_agencies")
    .select("agency_id")
    .eq("user_id", targetSellerId)
    .in("agency_id", agencyIds)
    .limit(1)
  return (data?.length ?? 0) > 0
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

    // VIB-69: el asesor independiente no accede a operaciones ajenas ni siquiera
    // en modo postventa o cobros — es externo a la agencia.
    if (isIndependentAdvisor(user)) {
      return null
    }

    // Postventa (ver pasajeros/documentos/servicios) tiene prioridad como scope
    // "primario". El permiso de cobros se expone además por prop
    // (canRegisterPaymentsOnAgencyOperations) para que un vendedor con AMBOS
    // flags pueda operar pagos aunque el scope resuelto sea postventa.
    if (hasAgencyOperationsSupportView(user)) {
      return "agency-support"
    }

    if (canRegisterPaymentsOnAgencyOperations(user)) {
      return "agency-payments"
    }

    return null
  }

  return "full"
}

/**
 * Scopes de acceso "de agencia" (no propietario) que son de SOLO LECTURA para
 * datos de la operación (documentos, servicios): postventa y cobros. Un vendedor
 * con estos scopes puede ver/operar lo que su flag habilita, pero NO editar los
 * datos de una operación ajena. "own"/"full" sí pueden escribir.
 */
export function isAgencyReadonlyScope(scope: OperationAccessScope): boolean {
  return scope === "agency-support" || scope === "agency-payments"
}

/**
 * Aplica filtros de leads según el rol del usuario.
 * Multi-tenant: agencyIds ya viene acotado a la org del usuario (ver getUserAgencyIds),
 * así que filtrar por ellos también acota por org — incluso para SUPER_ADMIN.
 *
 * resolvedMatrix: si se pasa, los bloqueos hardcodeados por rol se omiten cuando
 * la matrix dinámica habilita el acceso (ej: CONTABLE con leads habilitado desde UI).
 */
export function applyLeadsFilters(
  query: any,
  user: { role: string; id: string; is_independent_advisor?: boolean | null },
  agencyIds: string[],
  resolvedMatrix?: ResolvedPermissionsMatrix
): any {
  const userRole = user.role as UserRole

  // VIB-69: el asesor independiente trae su propia cartera y no ve el CRM de la
  // agencia. Se corta acá — y no solo en el gate del route — porque el vendedor
  // ve TODOS los leads de sus agencias y este helper es el que aplica ese filtro.
  if (isIndependentAdvisor(user)) {
    throw new Error("No tiene permiso para ver leads")
  }

  // SELLER ve todos los leads de sus agencias (para poder ver listas compartidas en el CRM y arrastrar leads)
  if (userRole === "SELLER") {
    if (agencyIds.length > 0) {
      return query.in("agency_id", agencyIds)
    }
    // Fallback: solo sus leads asignados si no tiene agencias
    return query.eq("assigned_seller_id", user.id)
  }

  // CONTABLE no ve leads por defecto, salvo que la matrix dinámica lo habilite
  if (userRole === "CONTABLE") {
    if (!resolvedMatrix || !checkResolvedPermission(resolvedMatrix, "leads", "read")) {
      throw new Error("No tiene permiso para ver leads")
    }
    // Habilitado dinámicamente: filtrar por agencias como cualquier otro rol
    if (agencyIds.length > 0) {
      return query.in("agency_id", agencyIds)
    }
    return query
  }

  // ADMIN / SUPER_ADMIN / VIEWER / demás roles: filtrar por las agencias de su org
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

  // VIB-69: asesor independiente → siempre solo sus operaciones.
  if (isIndependentAdvisor(user)) {
    return query.eq("seller_id", user.id)
  }

  // SELLER con permiso especial puede ver todas las operaciones de sus agencias:
  // ya sea para postventa (can_view_agency_operations_support) o para registrar
  // cobros/pagos (can_register_payments_on_agency_operations). Necesita verlas en
  // el listado para poder abrirlas e imputar el pago.
  if (userRole === "SELLER") {
    if (hasAgencyOperationsSupportView(user) || canRegisterPaymentsOnAgencyOperations(user)) {
      if (agencyIds.length > 0) {
        return query.in("agency_id", agencyIds)
      }

      return query.eq("seller_id", user.id)
    }

    return query.eq("seller_id", user.id)
  }

  // ADMIN / SUPER_ADMIN / VIEWER / CONTABLE: filtrar por agencias de su org.
  // 🔴 Fix cross-tenant (2026-05-18): si no tiene agency_ids, ANTES devolvía
  // query sin filtro → leak cross-tenant. Ahora no devuelve nada (el endpoint
  // que llame esto deberá lidiar con 0 resultados).
  if (agencyIds.length > 0) {
    return query.in("agency_id", agencyIds)
  }
  return emptyResult(query)
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
  user: { role: string; id: string; is_independent_advisor?: boolean | null },
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

  // 🔴 Fix cross-tenant (2026-05-18): si el user no tiene org_id, ANTES la
  // función devolvía la query sin filtrar → leak cross-tenant (cualquier
  // user sin org veía clientes de TODAS las orgs). Ahora throw error.
  if (!orgId) {
    throw new Error("Usuario sin organización asociada — no se pueden filtrar clientes")
  }
  query = query.eq('org_id', orgId)

  // SUPER_ADMIN, ADMIN y VIEWER ven TODOS los clientes de su org (sin restricción adicional)
  if (userRole === "SUPER_ADMIN" || userRole === "ADMIN" || userRole === "VIEWER") {
    return { query }
  }

  // CONTABLE no ve clientes
  if (userRole === "CONTABLE") {
    throw new Error("No tiene permiso para ver clientes")
  }

  // SELLER: en contexto de selector (crear operación), ver todos los clientes
  // para poder asignar cualquier cliente existente a una nueva operación.
  // VIB-69: el asesor independiente queda afuera de esta apertura — la cartera de
  // clientes de la agencia no es información suya. Carga la venta con sus propios
  // clientes (los que él creó o ya tienen operación con él).
  if (userRole === "SELLER" && context === "selector" && !isIndependentAdvisor(user)) {
    return { query }
  }

  // SELLER en vista normal: ve clientes de sus operaciones + los que ella creó.
  // El "created_by" se agregó (migration 2026-06-03) para que un cliente
  // recién creado (todavía sin operación) sea visible para quien lo creó —
  // antes quedaba invisible y la vendedora terminaba creando duplicados.
  if (userRole === "SELLER") {
    const customerIds = new Set<string>()

    // 1) Customers vinculados a operaciones del vendedor
    const { data: operations } = await supabase
      .from("operations")
      .select("id")
      .eq("seller_id", user.id)

    const operationIds = (operations || []).map((op: any) => op.id)

    if (operationIds.length > 0) {
      // chunked: .in() revienta URL con >300 UUIDs
      const chunkSize = 200
      for (let i = 0; i < operationIds.length; i += chunkSize) {
        const chunk = operationIds.slice(i, i + chunkSize)
        const { data: operationCustomers } = await supabase
          .from("operation_customers")
          .select("customer_id")
          .in("operation_id", chunk)
        if (operationCustomers) {
          for (const oc of operationCustomers as any[]) {
            if (oc.customer_id) customerIds.add(oc.customer_id)
          }
        }
      }
    }

    // 2) Customers creados por el vendedor (aunque todavía no tengan operación).
    // Cast a any: created_by se agregó en migration 2026-06-03 pero los
    // tipos generados de Supabase no se regeneraron todavía.
    const { data: createdByMe } = await (supabase.from("customers") as any)
      .select("id")
      .eq("created_by", user.id)
      .eq("org_id", orgId)

    for (const c of (createdByMe || []) as any[]) {
      if (c.id) customerIds.add(c.id)
    }

    if (customerIds.size === 0) {
      // No tiene clientes asociados ni creados, retornar query vacía
      return { query: emptyResult(query) }
    }

    return { query: query.in("id", Array.from(customerIds)) }
  }

  // Para otros roles no contemplados, retornar query vacío por seguridad
  return { query: emptyResult(query) }
}

/**
 * VIB-69: ¿este cliente es "suyo" para un asesor independiente?
 *
 * Mismo criterio que la rama de SELLER en applyCustomersFilters: clientes de sus
 * operaciones + los que él dio de alta. Se usa en los endpoints que resuelven un
 * cliente por id, donde el scope por org alcanzaba para un vendedor de la
 * agencia pero no para un freelancer externo.
 */
export async function isCustomerOwnedByAdvisor(
  supabase: SupabaseClient<Database>,
  userId: string,
  customerId: string
): Promise<boolean> {
  const { data: created } = await (supabase.from("customers") as any)
    .select("id")
    .eq("id", customerId)
    .eq("created_by", userId)
    .maybeSingle()

  if (created) return true

  const { data: linked } = await (supabase.from("operation_customers") as any)
    .select("customer_id, operations!inner(seller_id)")
    .eq("customer_id", customerId)
    .eq("operations.seller_id", userId)
    .limit(1)

  return (linked?.length ?? 0) > 0
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
    /**
     * Matriz de permisos resuelta por agencia. Si se pasa, el gate del módulo
     * `documents` y el scope de `customers` respetan los overrides por agencia
     * en vez de los defaults estáticos del rol.
     */
    matrix?: ResolvedPermissionsMatrix | null
  }
): Promise<boolean> {
  const write = options?.write === true
  const matrix = options?.matrix ?? undefined

  if (write && !canPerformAction(user, "documents", "write", matrix)) {
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

    return !write || !isAgencyReadonlyScope(scope)
  }

  if (resource.customerId) {
    const scopes = await getCustomerOperationAccessScopes(supabase, user, resource.customerId)
    if (scopes.length === 0) {
      // Cliente sin operaciones vinculadas al usuario. Antes esto bloqueaba a
      // SELLER de forma fija; ahora se permite salvo que esté restringido a sus
      // propios clientes (customers.ownDataOnly) según el matrix por agencia.
      if (isOwnDataOnlyResolved(user, "customers", matrix)) {
        return false
      }
      return write
        ? canPerformAction(user, "documents", "write", matrix)
        : canPerformAction(user, "documents", "read", matrix)
    }

    return !write || scopes.some((scope) => !isAgencyReadonlyScope(scope))
  }

  return write
    ? canPerformAction(user, "documents", "write", matrix)
    : canPerformAction(user, "documents", "read", matrix)
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
