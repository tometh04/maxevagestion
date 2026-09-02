/**
 * Total mensual de una suscripción = precio del plan base + complementos.
 *
 * Módulo puro (sin I/O). La precedencia del plan base NO se reimplementa acá:
 * sale de `computeBaseMrrArs` en `lib/billing/effective-price.ts`
 * (manual_mrr_override > custom_plans > agreed_price > plan_prices > PLANS).
 *
 * Los dos horizontes son lo que materializa la decisión comercial "el cambio
 * impacta desde el próximo ciclo, sin prorrateo":
 *   - "now"        → lo que se le cobra HOY.
 *   - "next_cycle" → lo que se le va a cobrar en el próximo débito.
 * La UI del cliente muestra los dos ("Hoy pagás $X · Desde el DD/MM: $Y").
 */
import type { AddonKey } from "@/lib/addons/catalog"
import type { AddonEntitlement, AddonEntitlementMap } from "@/lib/addons/entitlements"
import {
  computeBaseMrrArs,
  type BasePriceSource,
  type MrrCustomPlan,
  type MrrOrg,
} from "@/lib/billing/effective-price"
import { defaultPlanPriceCatalog, type PlanPriceCatalog } from "@/lib/billing/plan-pricing"

export type PricingHorizon = "now" | "next_cycle"

export interface AddonChargeLine {
  key: AddonKey
  label: string
  amountArs: number
  included: boolean
}

export interface SubscriptionTotal {
  baseArs: number
  baseSource: BasePriceSource
  baseEstimated: boolean
  addons: AddonChargeLine[]
  addonsArs: number
  totalArs: number
  /**
   * true cuando `manual_mrr_override_ars` manda. Ese override significa "esta
   * org factura exactamente esto, punto": es una decisión humana explícita de un
   * platform admin, así que los complementos NO se le suman encima. La UI de
   * admin lo avisa para que nadie crea que se está cobrando de menos por error.
   */
  addonsSuppressedByOverride: boolean
}

/** ¿Este complemento entra en la factura del horizonte pedido? */
function billsInHorizon(
  entitlement: AddonEntitlement,
  horizon: PricingHorizon,
  now: number
): boolean {
  // Incluido en el plan: nunca suma (vale 0), pero se lista para que el cliente
  // vea que lo tiene.
  if (entitlement.includedInPlan) return false

  if (horizon === "now") {
    // Solo lo ya facturable. Lo que se prendió hoy todavía no se cobró.
    if (entitlement.state === "ACTIVE" || entitlement.state === "SCHEDULED_CANCEL") {
      if (!entitlement.billableFrom) return false
      const t = Date.parse(entitlement.billableFrom)
      return Number.isFinite(t) && t <= now
    }
    return false
  }

  // next_cycle: lo recién prendido SÍ suma; lo dado de baja ya no.
  if (entitlement.state === "ACTIVE") return true
  return false
}

export interface ComputeSubscriptionTotalInput {
  org: MrrOrg
  customPlan: MrrCustomPlan | null
  planPrices?: PlanPriceCatalog
  entitlements: AddonEntitlementMap | null | undefined
  horizon?: PricingHorizon
  now?: number
  useEnterpriseFallback?: boolean
}

export function computeSubscriptionTotalArs(
  input: ComputeSubscriptionTotalInput
): SubscriptionTotal {
  const now = input.now ?? Date.now()
  const horizon = input.horizon ?? "now"
  const planPrices = input.planPrices ?? defaultPlanPriceCatalog()

  const base = computeBaseMrrArs(input.org, input.customPlan, {
    planPrices,
    useEnterpriseFallback: input.useEnterpriseFallback,
  })

  const lines: AddonChargeLine[] = []
  for (const entitlement of Object.values(input.entitlements ?? {})) {
    if (!entitlement) continue
    if (entitlement.includedInPlan) {
      lines.push({
        key: entitlement.key,
        label: entitlement.definition.name,
        amountArs: 0,
        included: true,
      })
      continue
    }
    if (!billsInHorizon(entitlement, horizon, now)) continue
    lines.push({
      key: entitlement.key,
      label: entitlement.definition.name,
      // Redondeo por línea ANTES de sumar: así el total coincide con la suma de
      // lo que ve el cliente en el desglose y no aparece un peso de diferencia.
      amountArs: Math.round(entitlement.priceArsMonthly),
      included: false,
    })
  }

  lines.sort((a, b) => a.label.localeCompare(b.label, "es"))

  const addonsArs = lines.reduce((acc, l) => acc + l.amountArs, 0)
  const suppressed = base.source === "MANUAL_OVERRIDE"

  return {
    baseArs: base.amount,
    baseSource: base.source,
    baseEstimated: base.estimated,
    addons: lines,
    addonsArs,
    totalArs: suppressed ? base.amount : base.amount + addonsArs,
    addonsSuppressedByOverride: suppressed,
  }
}

/** Suma de complementos sola, sin el plan. Útil para el desglose de admin. */
export function computeAddonsMonthlyArs(
  entitlements: AddonEntitlementMap | null | undefined,
  horizon: PricingHorizon = "now",
  now: number = Date.now()
): number {
  let total = 0
  for (const entitlement of Object.values(entitlements ?? {})) {
    if (!entitlement || entitlement.includedInPlan) continue
    if (!billsInHorizon(entitlement, horizon, now)) continue
    total += Math.round(entitlement.priceArsMonthly)
  }
  return total
}
