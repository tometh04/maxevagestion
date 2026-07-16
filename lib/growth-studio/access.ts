import type { SupabaseClient } from "@supabase/supabase-js"
import { isAccessAllowed, type BillingOrg } from "@/lib/billing/access"
import { getUserAgencyIds } from "@/lib/permissions-api"
import {
  getEffectiveAgencyScopeRole,
  type UserRole,
} from "@/lib/permissions"
import type { Database } from "@/lib/supabase/types"
import { isGrowthStudioEnterprisePlan } from "@/lib/growth-studio/access-rules"

export {
  canAccessGrowthStudioAgency,
  hasGrowthStudioEntitlement,
  isGrowthStudioEnterprisePlan,
} from "@/lib/growth-studio/access-rules"

export interface GrowthStudioAccessUser {
  id: string
  org_id: string | null
  role: string
  roles?: string[] | null
}

export interface GrowthStudioOrganization extends BillingOrg {
  id: string
  plan: string | null
}

export interface GrowthStudioAgency {
  id: string
  name: string
}

export type GrowthStudioAccessDeniedCode =
  | "missing_organization"
  | "organization_not_found"
  | "subscription_inactive"
  | "growth_studio_plan_required"
  | "access_check_failed"

export type GrowthStudioOrganizationAccessResult =
  | {
      allowed: true
      organization: GrowthStudioOrganization
    }
  | {
      allowed: false
      status: number
      code: GrowthStudioAccessDeniedCode
      message: string
    }

export type GrowthStudioAccessResult =
  | (Extract<GrowthStudioOrganizationAccessResult, { allowed: true }> & {
      agencies: GrowthStudioAgency[]
      agencyIds: string[]
    })
  | Extract<GrowthStudioOrganizationAccessResult, { allowed: false }>

export async function resolveGrowthStudioOrganizationAccess(
  supabase: SupabaseClient<Database>,
  user: GrowthStudioAccessUser
): Promise<GrowthStudioOrganizationAccessResult> {
  if (!user.org_id) {
    return {
      allowed: false,
      status: 400,
      code: "missing_organization",
      message: "Usuario sin organización asociada",
    }
  }

  const { data, error } = await supabase
    .from("organizations")
    .select("id, plan, subscription_status, current_period_ends_at, trial_ends_at")
    .eq("id", user.org_id)
    .maybeSingle()

  if (error) {
    console.error("[growth-studio-access] No se pudo resolver la organización", {
      orgId: user.org_id,
      userId: user.id,
      cause: error.message,
    })
    return {
      allowed: false,
      status: 500,
      code: "access_check_failed",
      message: "No se pudo verificar el acceso a Growth Studio",
    }
  }

  if (!data) {
    return {
      allowed: false,
      status: 404,
      code: "organization_not_found",
      message: "Organización no encontrada",
    }
  }

  const organization = data as GrowthStudioOrganization
  if (!isAccessAllowed(organization)) {
    return {
      allowed: false,
      status: 403,
      code: "subscription_inactive",
      message: "La suscripción no permite usar Growth Studio",
    }
  }

  if (!isGrowthStudioEnterprisePlan(organization)) {
    return {
      allowed: false,
      status: 403,
      code: "growth_studio_plan_required",
      message: "Growth Studio está disponible con el plan Enterprise",
    }
  }

  return { allowed: true, organization }
}

export async function resolveGrowthStudioAccess(
  supabase: SupabaseClient<Database>,
  user: GrowthStudioAccessUser
): Promise<GrowthStudioAccessResult> {
  const organizationAccess = await resolveGrowthStudioOrganizationAccess(
    supabase,
    user
  )
  if (!organizationAccess.allowed) return organizationAccess

  const roles = (user.roles?.length ? user.roles : [user.role]) as UserRole[]
  const effectiveRole = getEffectiveAgencyScopeRole(roles)
  const agencyIds = await getUserAgencyIds(supabase, user.id, effectiveRole)

  if (agencyIds.length === 0) {
    return { ...organizationAccess, agencies: [], agencyIds: [] }
  }

  const { data, error } = await supabase
    .from("agencies")
    .select("id, name")
    .eq("org_id", organizationAccess.organization.id)
    .in("id", agencyIds)
    .order("name")

  if (error) {
    console.error("[growth-studio-access] No se pudieron resolver las agencias", {
      orgId: organizationAccess.organization.id,
      userId: user.id,
      cause: error.message,
    })
    return {
      allowed: false,
      status: 500,
      code: "access_check_failed",
      message: "No se pudo verificar el acceso a las agencias",
    }
  }

  const agencies = (data ?? []) as GrowthStudioAgency[]
  return {
    ...organizationAccess,
    agencies,
    agencyIds: agencies.map((agency) => agency.id),
  }
}
