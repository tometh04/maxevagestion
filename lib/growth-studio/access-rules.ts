import { isAccessAllowed, type BillingOrg } from "@/lib/billing/access"

export interface GrowthStudioEntitledOrganization extends BillingOrg {
  plan: string | null
}

export function isGrowthStudioEnterprisePlan(
  organization: Pick<GrowthStudioEntitledOrganization, "plan">
): boolean {
  return organization.plan === "ENTERPRISE"
}

export function hasGrowthStudioEntitlement(
  organization: Pick<
    GrowthStudioEntitledOrganization,
    "plan" | "subscription_status" | "current_period_ends_at" | "trial_ends_at"
  >
): boolean {
  return isAccessAllowed(organization) && isGrowthStudioEnterprisePlan(organization)
}

export function canAccessGrowthStudioAgency(
  access: { agencyIds: string[] },
  agencyId: string | null | undefined
): boolean {
  return Boolean(agencyId && access.agencyIds.includes(agencyId))
}
