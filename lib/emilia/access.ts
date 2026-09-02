import { checkAddon } from "@/lib/addons/access"
import { isAccessAllowed, type BillingOrg } from "@/lib/billing/guard"
import {
  canAccessAgencyResource,
  resolveAgencyPermissionScope,
  type AgencyPermissionScope,
} from "@/lib/permissions/agency-scope-server"

/**
 * Acceso promocional para todos los tenants con suscripción vigente, extendido
 * tres meses calendario. El instante equivale al 11/11/2026 16:32:31 en Argentina.
 *
 * Railway puede sobrescribirlo con EMILIA_PROMOTION_END_AT sin redeploy.
 */
export const DEFAULT_EMILIA_PROMOTION_END_AT = "2026-11-11T19:32:31.000Z"

export interface EmiliaAccessUser {
  id: string
  org_id: string | null
  role: string
  roles?: string[] | null
}

export interface EmiliaAccessOrganization extends BillingOrg {
  plan: string | null
  custom_plan_id: string | null
}

export type EmiliaAccessDeniedCode =
  | "missing_organization"
  | "organization_not_found"
  | "subscription_inactive"
  | "emilia_plan_required"
  | "addon_required"
  | "permission_denied"
  | "access_check_failed"

export type EmiliaOrganizationAccessResult =
  | {
      allowed: true
      organization: EmiliaAccessOrganization
      promotionActive: boolean
      promotionEndsAt: string
    }
  | {
      allowed: false
      status: number
      code: EmiliaAccessDeniedCode
      message: string
    }

export type LeadEmiliaAccessResult =
  | (Extract<EmiliaOrganizationAccessResult, { allowed: true }> & {
      agencyIds: string[]
      agencyScope: AgencyPermissionScope
      ownSellerId: string | null
    })
  | Extract<EmiliaOrganizationAccessResult, { allowed: false }>

export function getEmiliaPromotionEndAt(
  configuredValue: string | undefined = process.env.EMILIA_PROMOTION_END_AT
): string {
  const candidate = configuredValue?.trim()
  if (!candidate || !Number.isFinite(Date.parse(candidate))) {
    return DEFAULT_EMILIA_PROMOTION_END_AT
  }
  return new Date(candidate).toISOString()
}

export function isEmiliaPromotionActive(
  now: number = Date.now(),
  promotionEndsAt: string = getEmiliaPromotionEndAt()
): boolean {
  return now < Date.parse(promotionEndsAt)
}

export function isEnterpriseEmiliaPlan(
  organization: Pick<EmiliaAccessOrganization, "plan" | "custom_plan_id">
): boolean {
  return organization.plan === "ENTERPRISE" || Boolean(organization.custom_plan_id)
}

export function hasEmiliaPlanAccess(
  organization: Pick<EmiliaAccessOrganization, "plan" | "custom_plan_id">,
  now: number = Date.now(),
  promotionEndsAt: string = getEmiliaPromotionEndAt()
): boolean {
  return isEmiliaPromotionActive(now, promotionEndsAt) || isEnterpriseEmiliaPlan(organization)
}

/**
 * Resuelve suscripción + promoción/plan. Se usa también para el chat general de
 * Emilia, que no está vinculado a un lead.
 */
export async function resolveEmiliaOrganizationAccess(
  supabase: any,
  user: EmiliaAccessUser
): Promise<EmiliaOrganizationAccessResult> {
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
    .select("plan, custom_plan_id, subscription_status, current_period_ends_at, trial_ends_at")
    .eq("id", user.org_id)
    .maybeSingle()

  if (error) {
    console.error("[emilia-access] No se pudo resolver la organización:", {
      orgId: user.org_id,
      userId: user.id,
      cause: error.message,
    })
    return {
      allowed: false,
      status: 500,
      code: "access_check_failed",
      message: "No se pudo verificar el acceso a Emilia",
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

  const organization = data as EmiliaAccessOrganization
  if (!isAccessAllowed(organization)) {
    return {
      allowed: false,
      status: 403,
      code: "subscription_inactive",
      message: "La suscripción no permite usar Emilia",
    }
  }

  const promotionEndsAt = getEmiliaPromotionEndAt()
  const promotionActive = isEmiliaPromotionActive(Date.now(), promotionEndsAt)

  // La promoción sigue siendo un OR por encima del complemento: mientras esté
  // vigente nadie pierde el acceso, aunque no lo tenga contratado. Sacar este
  // OR antes del 11/11/2026 le cortaría Emilia a todos los tenants de golpe.
  if (!promotionActive) {
    const addonAccess = await checkAddon(supabase, user.org_id, "emilia")
    if (!addonAccess.allowed && !isEnterpriseEmiliaPlan(organization)) {
      return {
        allowed: false,
        status: addonAccess.status,
        code: "addon_required",
        message: addonAccess.message,
      }
    }
  }

  if (!hasEmiliaPlanAccess(organization, Date.now(), promotionEndsAt)) {
    return {
      allowed: false,
      status: 403,
      code: "emilia_plan_required",
      message: "Emilia está disponible únicamente con el plan Enterprise",
    }
  }

  return {
    allowed: true,
    organization,
    promotionActive,
    promotionEndsAt,
  }
}

/**
 * Agrega el permiso funcional y el scope de agencias requerido para cotizar
 * desde un lead. Tener acceso por plan nunca amplía permisos del tenant.
 */
export async function resolveLeadEmiliaAccess(
  supabase: any,
  user: EmiliaAccessUser
): Promise<LeadEmiliaAccessResult> {
  if (!user.org_id) {
    return {
      allowed: false,
      status: 400,
      code: "missing_organization",
      message: "Usuario sin organización asociada",
    }
  }

  const agencyScope = await resolveAgencyPermissionScope(
    supabase,
    user,
    "leads",
    "write"
  )

  if (agencyScope.agencyIds.length === 0) {
    return {
      allowed: false,
      status: 403,
      code: "permission_denied",
      message: "No tiene permiso para crear cotizaciones",
    }
  }

  const organizationAccess = await resolveEmiliaOrganizationAccess(supabase, user)
  if (!organizationAccess.allowed) return organizationAccess

  return {
    ...organizationAccess,
    agencyIds: agencyScope.agencyIds,
    agencyScope,
    ownSellerId: agencyScope.fullAgencyIds.length === 0
      && agencyScope.ownAgencyIds.length > 0
      ? user.id
      : null,
  }
}

export function canAccessEmiliaLeadAgency(
  access: Extract<LeadEmiliaAccessResult, { allowed: true }>,
  agencyId: string | null | undefined,
  assignedSellerId?: string | null
): boolean {
  if (!agencyId) return false
  return canAccessAgencyResource(access.agencyScope, {
    agency_id: agencyId,
    seller_id: assignedSellerId,
  })
}
