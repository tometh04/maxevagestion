import { isAccessAllowed, type BillingOrg } from "@/lib/billing/access"

/**
 * Growth Studio requiere suscripción vigente Y el complemento contratado.
 *
 * `addonEnabled` tiene default `true` a propósito: los callers y tests que no
 * lo pasan se comportan igual que antes de que existieran los complementos.
 * `resolveGrowthStudioOrganizationAccess` le pasa el valor real.
 */
export function hasGrowthStudioEntitlement(
  organization: Pick<
    BillingOrg,
    "subscription_status" | "current_period_ends_at" | "trial_ends_at"
  > & { plan?: unknown },
  addonEnabled: boolean = true
): boolean {
  return isAccessAllowed(organization) && addonEnabled
}

export function canAccessGrowthStudioAgency(
  access: { agencyIds: string[] },
  agencyId: string | null | undefined
): boolean {
  return Boolean(agencyId && access.agencyIds.includes(agencyId))
}
