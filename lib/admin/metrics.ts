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

// Bug #4: ENTERPRISE en PLANS tiene priceArsMonthly=null porque el precio
// real depende del deal. Cuando una org ACTIVE/PAST_DUE quedó como ENTERPRISE
// sin custom_plan y sin override, el cálculo daba 0 → MRR/ARR aparentaban
// ser $0 aunque la org sí está pagando. Usamos PRO como fallback conservador
// (asumimos que un Enterprise paga al menos lo de un Pro) y exponemos el
// flag para que la página avise al admin que falta config real.
const ENTERPRISE_FALLBACK_PLAN: keyof typeof PLANS = "PRO"

/**
 * Calcula el MRR mensual de UNA org. Devuelve 0 si no contribuye.
 *
 * Precedencia:
 *   1. Si status NOT IN (ACTIVE, PAST_DUE) → 0
 *   2. manual_mrr_override_ars > 0          → ese valor (real)
 *   3. custom_plan_id + customPlan          → custom plan effective price (real)
 *   4. PLANS[plan].priceArsMonthly          → plan default (real)
 *   5. ENTERPRISE sin config                 → PRO price (estimado)
 *   6. fallback                              → 0
 */
export function computeMrrArs(
  org: MrrOrg,
  customPlan: MrrCustomPlan | null,
): number {
  if (!PAYING_STATUSES.has(org.subscription_status)) return 0
  return computeBaseMrrArs(org, customPlan).amount
}

/**
 * Variante que devuelve también si el monto es estimado (fallback) o real.
 * Útil para que la UI avise al admin que el MRR de esa org puede no ser exacto.
 */
export function computeMrrArsDetailed(
  org: MrrOrg,
  customPlan: MrrCustomPlan | null,
): { amount: number; estimated: boolean } {
  if (!PAYING_STATUSES.has(org.subscription_status)) return { amount: 0, estimated: false }
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
  // Aplicamos fallback para alinear con MRR Real: si una org está en trialing
  // como ENTERPRISE sin config, asumimos PRO como estimación del pipeline.
  return computeBaseMrrArs(org, customPlan, { useEnterpriseFallback: true }).amount
}

/**
 * MRR "potencial" — lo que pagaría/pagaba la org si fuera ACTIVE. Usado para
 * Churn MRR (sumar lo que se perdió de orgs canceladas/suspendidas). NO filtra
 * por status, solo aplica override → custom → plan. NO usa fallback ENTERPRISE
 * porque "lo que se perdió" debe medirse contra precio real conocido — si la org
 * nunca tuvo precio configurado, lo perdido es 0.
 */
export function computePotentialMrrArs(
  org: MrrOrg,
  customPlan: MrrCustomPlan | null,
): number {
  return computeBaseMrrArs(org, customPlan, { useEnterpriseFallback: false }).amount
}

// Lógica compartida: override → custom → plan → (opcional) enterprise-fallback.
// NO chequea status. Devuelve `estimated: true` si tuvo que usar fallback.
function computeBaseMrrArs(
  org: MrrOrg,
  customPlan: MrrCustomPlan | null,
  opts: { useEnterpriseFallback?: boolean } = { useEnterpriseFallback: true },
): { amount: number; estimated: boolean } {
  if (org.manual_mrr_override_ars && org.manual_mrr_override_ars > 0) {
    return { amount: Math.round(Number(org.manual_mrr_override_ars)), estimated: false }
  }
  if (org.custom_plan_id && customPlan) {
    const discountActive =
      customPlan.discount_ends_at != null &&
      new Date(customPlan.discount_ends_at).getTime() > Date.now()
    const factor = discountActive ? 1 - customPlan.discount_percent / 100 : 1
    return { amount: Math.round(customPlan.base_price_ars * factor), estimated: false }
  }
  const planDef = PLANS[org.plan as keyof typeof PLANS]
  if (planDef?.priceArsMonthly && planDef.priceArsMonthly > 0) {
    return { amount: planDef.priceArsMonthly, estimated: false }
  }
  // ENTERPRISE sin precio definido: usar fallback PRO estimado solo si lo pidieron.
  if (org.plan === "ENTERPRISE" && opts.useEnterpriseFallback !== false) {
    const fallback = PLANS[ENTERPRISE_FALLBACK_PLAN].priceArsMonthly ?? 0
    return { amount: fallback, estimated: true }
  }
  return { amount: 0, estimated: false }
}
