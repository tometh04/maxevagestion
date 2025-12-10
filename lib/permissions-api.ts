/**
 * SISTEMA DE PERMISOS PARA APIs
 * 
 * Helper functions para aplicar filtros de permisos en API routes
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { isOwnDataOnly, hasPermission, type UserRole, type Module, type Permission } from "./permissions"

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
  let query = supabase.from(table) as any

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

/**
 * Aplica filtros de leads según el rol del usuario
 */
export function applyLeadsFilters(
  query: any,
  user: { role: string; id: string },
  agencyIds: string[]
): any {
  const userRole = user.role as UserRole

  // SELLER solo ve sus leads asignados
  if (userRole === "SELLER") {
    return query.eq("assigned_seller_id", user.id)
  }

  // CONTABLE no ve leads
  if (userRole === "CONTABLE") {
    throw new Error("No tiene permiso para ver leads")
  }

  // Filtrar por agencias si no es SUPER_ADMIN
  if (userRole !== "SUPER_ADMIN" && agencyIds.length > 0) {
    query = query.in("agency_id", agencyIds)
  }

  return query
}

/**
 * Aplica filtros de operaciones según el rol del usuario
 */
export function applyOperationsFilters(
  query: any,
  user: { role: string; id: string },
  agencyIds: string[]
): any {
  const userRole = user.role as UserRole

  // SELLER solo ve sus operaciones
  if (userRole === "SELLER") {
    return query.eq("seller_id", user.id)
  }

  // Filtrar por agencias si no es SUPER_ADMIN
  if (userRole !== "SUPER_ADMIN" && agencyIds.length > 0) {
    query = query.in("agency_id", agencyIds)
  }

  return query
}

/**
 * Aplica filtros de clientes según el rol del usuario
 * NOTA: Esta función es async porque necesita hacer queries adicionales
 */
export async function applyCustomersFilters(
  query: any,
  user: { role: string; id: string },
  agencyIds: string[],
  supabase: SupabaseClient<Database>
): Promise<any> {
  const userRole = user.role as UserRole

  // CONTABLE no ve clientes
  if (userRole === "CONTABLE") {
    throw new Error("No tiene permiso para ver clientes")
  }

  // SELLER solo ve clientes de sus operaciones
  if (userRole === "SELLER") {
    // Primero obtener las operaciones del vendedor
    const { data: operations } = await supabase
      .from("operations")
      .select("id")
      .eq("seller_id", user.id)

    const operationIds = (operations || []).map((op: any) => op.id)

    if (operationIds.length === 0) {
      // No tiene operaciones, retornar query vacío
      return query.eq("id", "00000000-0000-0000-0000-000000000000") // ID que no existe
    }

    // Obtener customer_ids de operation_customers
    const { data: operationCustomers } = await supabase
      .from("operation_customers")
      .select("customer_id")
      .in("operation_id", operationIds)

    const customerIds = (operationCustomers || []).map((oc: any) => oc.customer_id)

    if (customerIds.length === 0) {
      return query.eq("id", "00000000-0000-0000-0000-000000000000") // ID que no existe
    }

    return query.in("id", customerIds)
  }

  // Filtrar por agencias si no es SUPER_ADMIN
  if (userRole !== "SUPER_ADMIN" && agencyIds.length > 0) {
    // ADMIN y otros roles pueden ver todos los clientes (no filtramos por operaciones)
    // ya que los clientes pueden existir sin operaciones asociadas
    if (userRole === "ADMIN" || userRole === "VIEWER") {
      // No aplicar filtro adicional, devolver todos los clientes
      return query
    }

    // Para otros roles (si hay), aplicar filtros similares a SELLER
    // Obtener customer_ids de operaciones
    const { data: operations } = await supabase
      .from("operations")
      .select("id")
      .in("agency_id", agencyIds)

    const operationIds = (operations || []).map((op: any) => op.id)
    const customerIdsFromOperations: string[] = []

    if (operationIds.length > 0) {
      const { data: operationCustomers } = await supabase
        .from("operation_customers")
        .select("customer_id")
        .in("operation_id", operationIds)

      customerIdsFromOperations.push(...((operationCustomers || []).map((oc: any) => oc.customer_id)))
    }

    // También obtener customer_ids de leads de las agencias
    const { data: leads } = await supabase
      .from("leads")
      .select("contact_phone, contact_email")
      .in("agency_id", agencyIds)

    const customerIdsFromLeads: string[] = []
    if (leads && leads.length > 0) {
      // Buscar clientes que coincidan con los leads por phone o email
      const phones = [...new Set(leads.map((l: any) => l.contact_phone).filter(Boolean))]
      const emails = [...new Set(leads.map((l: any) => l.contact_email).filter(Boolean))]

      if (phones.length > 0) {
        const { data: customersByPhone } = await supabase
          .from("customers")
          .select("id")
          .in("phone", phones)
        
        if (customersByPhone) {
          customerIdsFromLeads.push(...customersByPhone.map((c: any) => c.id))
        }
      }

      if (emails.length > 0) {
        const { data: customersByEmail } = await supabase
          .from("customers")
          .select("id")
          .in("email", emails)
        
        if (customersByEmail) {
          customerIdsFromLeads.push(...customersByEmail.map((c: any) => c.id))
        }
      }
    }

    // Combinar ambos conjuntos de IDs
    const allCustomerIds = [...new Set([...customerIdsFromOperations, ...customerIdsFromLeads])]

    if (allCustomerIds.length > 0) {
      return query.in("id", allCustomerIds)
    }

    // Si no hay matches, retornar query vacío solo si no es ADMIN
    return query.eq("id", "00000000-0000-0000-0000-000000000000") // ID que no existe
  }

  return query
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

/**
 * Obtiene los IDs de agencias del usuario para filtrar queries
 */
export async function getUserAgencyIds(
  supabase: SupabaseClient<Database>,
  userId: string,
  userRole: UserRole
): Promise<string[]> {
  if (userRole === "SUPER_ADMIN") {
    // SUPER_ADMIN ve todas las agencias
    const { data: allAgencies } = await supabase.from("agencies").select("id")
    return (allAgencies || []).map((a: any) => a.id)
  }

  const { data: userAgencies } = await supabase
    .from("user_agencies")
    .select("agency_id")
    .eq("user_id", userId)

  return (userAgencies || []).map((ua: any) => ua.agency_id)
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
