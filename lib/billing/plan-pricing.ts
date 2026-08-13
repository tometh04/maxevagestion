/**
 * Resolver de precios de planes estándar.
 *
 * Superpone la tabla DB `plan_prices` (editable desde platform-admin) sobre la
 * constante `PLANS` de `lib/billing/plans.ts`. La constante es el DEFAULT/fallback:
 * si la tabla no tiene fila para un plan, o el valor es null, o la query falla,
 * se usa el precio hardcodeado. Así nada se rompe si la tabla está vacía o si el
 * código corre antes de que la migración se aplique.
 *
 * Enterprise mantiene precio null (precio per-cuenta vía custom_plans).
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { PLANS, type PlanId } from "./plans"

export type PlanPriceCatalog = Record<PlanId, number | null>

/** Catálogo default desde la constante de código (fallback). */
export function defaultPlanPriceCatalog(): PlanPriceCatalog {
  return {
    STARTER: PLANS.STARTER.priceArsMonthly,
    PRO: PLANS.PRO.priceArsMonthly,
    ENTERPRISE: PLANS.ENTERPRISE.priceArsMonthly,
  }
}

export interface PlanPriceRow {
  plan_id: string
  price_ars_monthly: number | string | null
}

/**
 * Overlay puro (sin I/O, testeable): aplica filas de `plan_prices` sobre el
 * catálogo default. Una fila con `price_ars_monthly` null/undefined NO pisa el
 * default — la constante queda como fallback. Filas de planes desconocidos se
 * ignoran.
 */
export function overlayPlanPrices(rows: PlanPriceRow[] | null | undefined): PlanPriceCatalog {
  const catalog = defaultPlanPriceCatalog()
  for (const r of rows ?? []) {
    if (!(r.plan_id in catalog)) continue
    if (r.price_ars_monthly === null || r.price_ars_monthly === undefined) continue
    const value = Number(r.price_ars_monthly)
    if (!Number.isFinite(value) || value <= 0) continue
    catalog[r.plan_id as PlanId] = value
  }
  return catalog
}

/**
 * Lee el catálogo de precios efectivo (DB overlay sobre constante). Requiere un
 * client con acceso de lectura a `plan_prices` (admin o server client). Ante
 * cualquier error devuelve el catálogo default para no romper el flujo.
 */
export async function getPlanPricing(admin: SupabaseClient): Promise<PlanPriceCatalog> {
  try {
    const { data, error } = await (admin as any)
      .from("plan_prices")
      .select("plan_id, price_ars_monthly")
    if (error || !data) return defaultPlanPriceCatalog()
    return overlayPlanPrices(data as PlanPriceRow[])
  } catch {
    return defaultPlanPriceCatalog()
  }
}

/** Precio efectivo de UN plan (DB overlay sobre constante). null = sin precio. */
export async function resolvePlanPrice(
  admin: SupabaseClient,
  planId: PlanId | string | null | undefined
): Promise<number | null> {
  if (!planId || !(planId in PLANS)) return null
  const catalog = await getPlanPricing(admin)
  return catalog[planId as PlanId]
}
