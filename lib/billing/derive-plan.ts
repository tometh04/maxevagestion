/**
 * Inferir el plan a partir del monto que cobra un preapproval de MP.
 *
 * Es un FALLBACK: `/api/billing/sync` prefiere siempre el `plan` del payload del
 * CHECKOUT_INITIATED. Solo se usa cuando ese evento no está.
 *
 * Debe compararse contra el catálogo EFECTIVO (`getPlanPricing`, overlay de
 * `plan_prices` sobre la constante), no contra `PLANS`: desde que los precios se
 * editan desde platform-admin, la constante deja de matchear apenas alguien
 * cambia un precio.
 *
 * Los montos grandfathered (una org que sigue pagando el precio viejo) tampoco
 * matchean, y eso está bien: devuelve null y el caller deja el plan como estaba.
 * Adivinar mal el plan es peor que no adivinar.
 */
import type { PlanPriceCatalog } from "./plan-pricing"
import type { PlanId } from "./plans"

export function derivePlanFromAmount(
  amount: number | null | undefined,
  planPrices: PlanPriceCatalog
): PlanId | null {
  if (!amount || !Number.isFinite(amount)) return null
  for (const planId of Object.keys(planPrices) as PlanId[]) {
    const price = planPrices[planId]
    if (price !== null && price === amount) return planId
  }
  return null
}
