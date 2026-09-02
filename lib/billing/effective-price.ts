/**
 * Precio efectivo de una organización — la precedencia canónica.
 *
 * Vivía privada en `lib/admin/metrics.ts`, pero es una regla de facturación, no
 * de reporting: la usan el MRR de platform admin, el monto sugerido al registrar
 * un pago manual y el motor de complementos (`lib/addons/pricing.ts`). Que
 * `lib/billing` importara de `lib/admin` invertía los bounded contexts, así que
 * la regla vive acá y `lib/admin/metrics.ts` la consume.
 *
 * Módulo puro a propósito (sin I/O), igual que `agreedPriceFor`,
 * `isAccessAllowed` o `transitionFromMP`: la precedencia se testea sin mockear
 * Supabase.
 *
 * IMPORTANTE: esto resuelve el precio del PLAN BASE. Los complementos se suman
 * aparte en `computeSubscriptionTotalArs` — no los agregues acá, porque este
 * número es el que alimenta el snapshot `organizations.agreed_plan_price_ars`.
 */
import { agreedPriceFor } from "@/lib/billing/agreed-price"
import {
  defaultPlanPriceCatalog,
  type PlanPriceCatalog,
} from "@/lib/billing/plan-pricing"
import type { PlanId } from "@/lib/billing/plans"

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

export const PAYING_STATUSES = new Set(["ACTIVE", "PAST_DUE"])

// Bug #4: ENTERPRISE tiene precio null porque el precio real depende del deal.
// Cuando una org ACTIVE/PAST_DUE quedó como ENTERPRISE sin custom_plan y sin
// override, el cálculo daba 0 → MRR/ARR aparentaban ser $0 aunque la org sí está
// pagando. Usamos PRO como fallback conservador (asumimos que un Enterprise paga
// al menos lo de un Pro) y exponemos el flag para que la página avise al admin.
export const ENTERPRISE_FALLBACK_PLAN: PlanId = "PRO"

/** De dónde salió el monto base. Lo usa la UI de admin para explicar el número. */
export type BasePriceSource =
  | "MANUAL_OVERRIDE"
  | "CUSTOM_PLAN"
  | "AGREED_PRICE"
  | "PLAN_PRICES"
  | "ENTERPRISE_FALLBACK"
  | "NONE"

export interface BasePriceResult {
  amount: number
  estimated: boolean
  source: BasePriceSource
}

/**
 * Lógica compartida: override → custom → agreed → plan → (opcional)
 * enterprise-fallback. NO chequea status. Devuelve `estimated: true` si tuvo que
 * usar el fallback.
 */
export function computeBaseMrrArs(
  org: MrrOrg,
  customPlan: MrrCustomPlan | null,
  opts: { useEnterpriseFallback?: boolean; planPrices?: PlanPriceCatalog } = {},
): BasePriceResult {
  const useEnterpriseFallback = opts.useEnterpriseFallback !== false
  const planPrices = opts.planPrices ?? defaultPlanPriceCatalog()

  if (org.manual_mrr_override_ars && org.manual_mrr_override_ars > 0) {
    return {
      amount: Math.round(Number(org.manual_mrr_override_ars)),
      estimated: false,
      source: "MANUAL_OVERRIDE",
    }
  }
  if (org.custom_plan_id && customPlan) {
    const discountActive =
      customPlan.discount_ends_at != null &&
      new Date(customPlan.discount_ends_at).getTime() > Date.now()
    const factor = discountActive ? 1 - customPlan.discount_percent / 100 : 1
    return {
      amount: Math.round(customPlan.base_price_ars * factor),
      estimated: false,
      source: "CUSTOM_PLAN",
    }
  }
  // Precio congelado de la org (grandfathering): va DESPUÉS del override manual
  // y del custom plan —esos son decisiones humanas explícitas de un platform
  // admin y le ganan a un snapshot automático— pero ANTES del precio de lista.
  // Sin esto, subir el precio de un plan infla el MRR de todas las orgs viejas
  // sin que entre un peso: MP les sigue cobrando el monto anterior.
  const agreed = agreedPriceFor(org, org.plan)
  if (agreed !== null && agreed > 0) {
    return { amount: Math.round(agreed), estimated: false, source: "AGREED_PRICE" }
  }

  const planPrice = org.plan ? planPrices[org.plan as PlanId] : null
  if (planPrice && planPrice > 0) {
    return { amount: Math.round(planPrice), estimated: false, source: "PLAN_PRICES" }
  }
  // ENTERPRISE sin precio definido: usar fallback PRO estimado solo si lo pidieron.
  if (org.plan === "ENTERPRISE" && useEnterpriseFallback) {
    const fallback = planPrices[ENTERPRISE_FALLBACK_PLAN] ?? 0
    return { amount: Math.round(fallback), estimated: true, source: "ENTERPRISE_FALLBACK" }
  }
  return { amount: 0, estimated: false, source: "NONE" }
}
