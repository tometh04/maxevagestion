import { createServerClient } from '@/lib/supabase/server'
import { Database } from '@/lib/supabase/types'

type Organization = Database['public']['Tables']['organizations']['Row']
type OrgMember = Database['public']['Tables']['organization_members']['Row']

/**
 * Retorna el scope de datos de una org: array de agency_ids que pertenecen a ella.
 * Usado para filtrar queries en tablas que solo tienen agency_id (operations, leads, payments, etc.)
 * y que deben ser accesibles solo a miembros de la misma org.
 *
 * Si orgId es null (ej: modo dev con mock sin org), retorna null y las queries no deberían
 * aplicar filtro (comportamiento legacy).
 */
export async function getOrgAgencyIds(orgId: string | null): Promise<string[] | null> {
  if (!orgId) return null

  const supabase = await createServerClient()
  const { data } = await (supabase.from('agencies') as any)
    .select('id')
    .eq('org_id', orgId)

  const rows = (data ?? []) as Array<{ id: string }>
  return rows.map((r) => r.id)
}

/**
 * Get the current user's organization.
 * In a multi-tenant SaaS, every authenticated user belongs to exactly one org.
 * Returns null if the user has no active membership.
 */
export async function getUserOrganization(authUserId: string): Promise<Organization | null> {
  const supabase = await createServerClient()

  const { data: member } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', authUserId)
    .eq('status', 'ACTIVE')
    .maybeSingle() as { data: { organization_id: string } | null }

  if (!member) return null

  const { data: org } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', member.organization_id)
    .single() as { data: Organization | null }

  return org
}

/**
 * Get the org_id for the current user. This is the most common call
 * throughout the app — used to scope all queries.
 */
export async function getUserOrgId(authUserId: string): Promise<string | null> {
  const supabase = await createServerClient()

  const { data: member } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', authUserId)
    .eq('status', 'ACTIVE')
    .maybeSingle() as { data: { organization_id: string } | null }

  return member?.organization_id ?? null
}

/**
 * Get the user's role within their organization.
 */
export async function getUserOrgRole(authUserId: string, orgId?: string): Promise<OrgMember['role'] | null> {
  const supabase = await createServerClient()

  let query = supabase
    .from('organization_members')
    .select('role')
    .eq('user_id', authUserId)
    .eq('status', 'ACTIVE')

  if (orgId) {
    query = query.eq('organization_id', orgId)
  }

  const { data: member } = await query.maybeSingle() as { data: { role: OrgMember['role'] } | null }
  return member?.role ?? null
}

/**
 * Check if the user is the owner of the organization.
 */
export async function isOrgOwner(authUserId: string, orgId: string): Promise<boolean> {
  const role = await getUserOrgRole(authUserId, orgId)
  return role === 'OWNER'
}

/**
 * Check if the user is an admin (OWNER or ADMIN) in the organization.
 */
export async function isOrgAdmin(authUserId: string, orgId: string): Promise<boolean> {
  const role = await getUserOrgRole(authUserId, orgId)
  return role === 'OWNER' || role === 'ADMIN'
}

/**
 * Get all members of an organization.
 */
export async function getOrgMembers(orgId: string): Promise<OrgMember[]> {
  const supabase = await createServerClient()

  const { data } = await supabase
    .from('organization_members')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: true }) as { data: OrgMember[] | null }

  return data ?? []
}

/**
 * Check plan limits for a resource.
 * Returns { allowed: true } or { allowed: false, reason: string }
 */
export async function checkPlanLimit(
  orgId: string,
  resource: 'users' | 'agencies' | 'operations'
): Promise<{ allowed: boolean; reason?: string }> {
  const supabase = await createServerClient()

  const { data: org } = await supabase
    .from('organizations')
    .select('max_users, max_agencies, max_operations_per_month, subscription_status')
    .eq('id', orgId)
    .single() as { data: Pick<Organization, 'max_users' | 'max_agencies' | 'max_operations_per_month' | 'subscription_status'> | null }

  if (!org) return { allowed: false, reason: 'Organización no encontrada' }

  if (org.subscription_status === 'SUSPENDED') {
    return { allowed: false, reason: 'La suscripción está suspendida. Contactá a soporte.' }
  }

  if (resource === 'users') {
    const { count } = await supabase
      .from('organization_members')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('status', 'ACTIVE')

    if ((count ?? 0) >= org.max_users) {
      return { allowed: false, reason: `Límite de usuarios alcanzado (${org.max_users}). Upgrade tu plan.` }
    }
  }

  if (resource === 'agencies') {
    const { count } = await supabase
      .from('agencies')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)

    if ((count ?? 0) >= org.max_agencies) {
      return { allowed: false, reason: `Límite de agencias alcanzado (${org.max_agencies}). Upgrade tu plan.` }
    }
  }

  if (resource === 'operations') {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const { data: orgAgencies } = await supabase
      .from('agencies')
      .select('id')
      .eq('org_id', orgId) as { data: { id: string }[] | null }

    const agencyIds = orgAgencies?.map(a => a.id) ?? []

    if (agencyIds.length > 0) {
      const { count } = await supabase
        .from('operations')
        .select('*', { count: 'exact', head: true })
        .in('agency_id', agencyIds)
        .gte('created_at', startOfMonth.toISOString())

      if ((count ?? 0) >= org.max_operations_per_month) {
        return { allowed: false, reason: `Límite de operaciones del mes alcanzado (${org.max_operations_per_month}). Upgrade tu plan.` }
      }
    }
  }

  return { allowed: true }
}
