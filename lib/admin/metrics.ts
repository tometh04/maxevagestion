import {
  defaultPlanPriceCatalog,
  type PlanPriceCatalog,
} from "@/lib/billing/plan-pricing"
// La precedencia de precio (override → custom → agreed → plan → fallback) vive
// en `lib/billing/effective-price.ts`: es una regla de facturación y la comparten
// el MRR, el monto sugerido de pago manual y el motor de complementos.
import {
  computeBaseMrrArs,
  PAYING_STATUSES,
  type MrrCustomPlan,
  type MrrOrg,
} from "@/lib/billing/effective-price"

export type { MrrOrg, MrrCustomPlan }

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
  // Se devuelven solo `amount` y `estimated`: `computeBaseMrrArs` además expone
  // `source` para la UI de admin, pero el contrato de esta función es el par y
  // hay callers/tests que lo comparan con toEqual.
  const { amount, estimated } = computeBaseMrrArs(org, customPlan, { planPrices })
  return { amount, estimated }
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
