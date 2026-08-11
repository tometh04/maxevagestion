import {
  defaultPlanPriceCatalog,
  type PlanPriceCatalog,
} from "@/lib/billing/plan-pricing"
import type { PlanId } from "@/lib/billing/plans"
import { agreedPriceFor } from "@/lib/billing/agreed-price"

export type MrrOrg = {
  plan: string | null
  subscription_status: string
  custom_plan_id: string | null
  manual_mrr_override_ars: number | null
  /**
   * Precio congelado de la org (grandfathering). Opcionales para que los
   * callers/fixtures que no los pasan sigan comportándose igual que antes.
   */
  agreed_plan_price_ars?: number | string | null
  agreed_plan_id?: string | null
}

export type MrrCustomPlan = {
  base_price_ars: number
  discount_percent: number
  discount_ends_at: string | null
}

const PAYING_STATUSES = new Set(["ACTIVE", "PAST_DUE"])

// Bug #4: ENTERPRISE tiene precio null porque el precio real depende del deal.
// Cuando una org ACTIVE/PAST_DUE quedó como ENTERPRISE sin custom_plan y sin
// override, el cálculo daba 0 → MRR/ARR aparentaban ser $0 aunque la org sí está
// pagando. Usamos PRO como fallback conservador (asumimos que un Enterprise paga
// al menos lo de un Pro) y exponemos el flag para que la página avise al admin.
const ENTERPRISE_FALLBACK_PLAN: PlanId = "PRO"

/**
 * Los precios de planes estándar ahora son editables desde admin (tabla
 * plan_prices). Estas funciones aceptan un `planPrices` opcional para reflejar
 * ese catálogo; si no se pasa, usan la constante `PLANS` como default (mismo
 * comportamiento histórico → tests existentes intactos). Los callers server-side
 * (páginas admin) inyectan el catálogo de DB vía getPlanPricing().
 */

/**
 * Calcula el MRR mensual de UNA org. Devuelve 0 si no contribuye.
 *
 * Precedencia:
 *   1. Si status NOT IN (ACTIVE, PAST_DUE) → 0
 *   2. manual_mrr_override_ars > 0          → ese valor (real)
 *   3. custom_plan_id + customPlan          → custom plan effective price (real)
 *   4. agreed_plan_price_ars                 → precio congelado de la org (real)
 *   5. planPrices[plan]                      → plan default/editado (real)
 *   6. ENTERPRISE sin config                 → PRO price (estimado)
 *   7. fallback                              → 0
 */
export function computeMrrArs(
  org: MrrOrg,
  customPlan: MrrCustomPlan | null,
  planPrices: PlanPriceCatalog = defaultPlanPriceCatalog(),
): number {
  if (!PAYING_STATUSES.has(org.subscription_status)) return 0
  return computeBaseMrrArs(org, customPlan, { planPrices }).amount
}

/**
 * Variante que devuelve también si el monto es estimado (fallback) o real.
 * Útil para que la UI avise al admin que el MRR de esa org puede no ser exacto.
 */
export function computeMrrArsDetailed(
  org: MrrOrg,
  customPlan: MrrCustomPlan | null,
  planPrices: PlanPriceCatalog = defaultPlanPriceCatalog(),
): { amount: number; estimated: boolean } {
  if (!PAYING_STATUSES.has(org.subscription_status)) return { amount: 0, estimated: false }
  return computeBaseMrrArs(org, customPlan, { planPrices })
}

/**
 * MRR proyectado de orgs en TRIALING. Mismo cálculo que MRR pero ignorando
 * el filtro de "ya está pagando". Para orgs que NO están en TRIALING devuelve 0.
 */
export function computeTrialPipelineMrrArs(
  org: MrrOrg,
  customPlan: MrrCustomPlan | null,
  planPrices: PlanPriceCatalog = defaultPlanPriceCatalog(),
): number {
  if (org.subscription_status !== "TRIALING") return 0
  // Aplicamos fallback para alinear con MRR Real: si una org está en trialing
  // como ENTERPRISE sin config, asumimos PRO como estimación del pipeline.
  return computeBaseMrrArs(org, customPlan, { useEnterpriseFallback: true, planPrices }).amount
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
  planPrices: PlanPriceCatalog = defaultPlanPriceCatalog(),
): number {
  return computeBaseMrrArs(org, customPlan, { useEnterpriseFallback: false, planPrices }).amount
}

// Lógica compartida: override → custom → plan → (opcional) enterprise-fallback.
// NO chequea status. Devuelve `estimated: true` si tuvo que usar fallback.
function computeBaseMrrArs(
  org: MrrOrg,
  customPlan: MrrCustomPlan | null,
  opts: { useEnterpriseFallback?: boolean; planPrices?: PlanPriceCatalog } = {},
): { amount: number; estimated: boolean } {
  const useEnterpriseFallback = opts.useEnterpriseFallback !== false
  const planPrices = opts.planPrices ?? defaultPlanPriceCatalog()

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
  // Precio congelado de la org (grandfathering): va DESPUÉS del override manual
  // y del custom plan —esos son decisiones humanas explícitas de un platform
  // admin y le ganan a un snapshot automático— pero ANTES del precio de lista.
  // Sin esto, subir el precio de un plan infla el MRR de todas las orgs viejas
  // sin que entre un peso: MP les sigue cobrando el monto anterior.
  const agreed = agreedPriceFor(org, org.plan)
  if (agreed !== null && agreed > 0) {
    return { amount: Math.round(agreed), estimated: false }
  }

  const planPrice = org.plan ? planPrices[org.plan as PlanId] : null
  if (planPrice && planPrice > 0) {
    return { amount: Math.round(planPrice), estimated: false }
  }
  // ENTERPRISE sin precio definido: usar fallback PRO estimado solo si lo pidieron.
  if (org.plan === "ENTERPRISE" && useEnterpriseFallback) {
    const fallback = planPrices[ENTERPRISE_FALLBACK_PLAN] ?? 0
    return { amount: Math.round(fallback), estimated: true }
  }
  return { amount: 0, estimated: false }
}
