import { PLANS } from "@/lib/billing/plans"

export type MrrOrg = {
  plan: string | null
  subscription_status: string
  custom_plan_id: string | null
  manual_mrr_override_ars: number | null
}

export type MrrCustomPlan = {
  base_price_ars: number
  discount_percent: number
  discount_ends_at: string | null
}

const PAYING_STATUSES = new Set(["ACTIVE", "PAST_DUE"])

/**
 * Calcula el MRR mensual de UNA org. Devuelve 0 si no contribuye.
 *
 * Precedencia (en este orden):
 *   1. Si status NOT IN (ACTIVE, PAST_DUE) → 0
 *   2. manual_mrr_override_ars > 0          → ese valor
 *   3. custom_plan_id + customPlan          → custom plan effective price
 *   4. PLANS[plan].priceArsMonthly          → plan default
 *   5. fallback                              → 0
 */
export function computeMrrArs(
  org: MrrOrg,
  customPlan: MrrCustomPlan | null,
): number {
  if (!PAYING_STATUSES.has(org.subscription_status)) return 0
  return computeBaseMrrArs(org, customPlan)
}

/**
 * MRR proyectado de orgs en TRIALING. Mismo cálculo que MRR pero ignorando
 * el filtro de "ya está pagando". Para orgs que NO están en TRIALING devuelve 0.
 */
export function computeTrialPipelineMrrArs(
  org: MrrOrg,
  customPlan: MrrCustomPlan | null,
): number {
  if (org.subscription_status !== "TRIALING") return 0
  return computeBaseMrrArs(org, customPlan)
}

/**
 * MRR "potencial" — lo que pagaría/pagaba la org si fuera ACTIVE. Usado para
 * Churn MRR (sumar lo que se perdió de orgs canceladas/suspendidas). NO filtra
 * por status, solo aplica override → custom → plan.
 */
export function computePotentialMrrArs(
  org: MrrOrg,
  customPlan: MrrCustomPlan | null,
): number {
  return computeBaseMrrArs(org, customPlan)
}

// Lógica compartida: override → custom → plan. NO chequea status.
function computeBaseMrrArs(
  org: MrrOrg,
  customPlan: MrrCustomPlan | null,
): number {
  if (org.manual_mrr_override_ars && org.manual_mrr_override_ars > 0) {
    return Math.round(Number(org.manual_mrr_override_ars))
  }
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
