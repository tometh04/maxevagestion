import { isAccessAllowed, type BillingOrg } from "@/lib/billing/access"

export function hasGrowthStudioEntitlement(
  organization: Pick<
    BillingOrg,
    "subscription_status" | "current_period_ends_at" | "trial_ends_at"
  > & { plan?: unknown }
): boolean {
  return isAccessAllowed(organization)
}

export function canAccessGrowthStudioAgency(
  access: { agencyIds: string[] },
  agencyId: string | null | undefined
): boolean {
  return Boolean(agencyId && access.agencyIds.includes(agencyId))
}
