import { PLANS } from "@/lib/billing/plans"

export type MrrOrg = {
  plan: string | null
  subscription_status: string
  custom_plan_id: string | null
}

export type MrrCustomPlan = {
  base_price_ars: number
  discount_percent: number
  discount_ends_at: string | null
}

const PAYING_STATUSES = new Set(["ACTIVE", "PAST_DUE"])

export function computeMrrArs(
  org: MrrOrg,
  customPlan: MrrCustomPlan | null,
): number {
  if (!PAYING_STATUSES.has(org.subscription_status)) return 0
  if (org.custom_plan_id && customPlan) {
    const discountActive =
      customPlan.discount_ends_at != null &&
      new Date(customPlan.discount_ends_at).getTime() > Date.now()
    const factor = discountActive ? 1 - customPlan.discount_percent / 100 : 1
    return Math.round(customPlan.base_price_ars * factor)
  }
  const planDef = PLANS[org.plan as keyof typeof PLANS]
  return planDef?.priceArsMonthly ?? 0
}
