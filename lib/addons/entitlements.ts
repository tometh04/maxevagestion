/**
 * Resolución de complementos: qué tiene habilitado una org y a qué precio.
 *
 * Módulo puro a propósito (sin I/O), igual que `agreedPriceFor`,
 * `isAccessAllowed` o `transitionFromMP`: las reglas se testean sin mockear
 * Supabase. El I/O vive en `lib/addons/server.ts`.
 *
 * ADVERTENCIA: esto es la capa de FACTURACIÓN, no de autorización. Decide si la
 * agencia contrató algo, no si el usuario puede usarlo. La autorización sigue
 * siendo permisos + `org_id` + RLS, y el gate de complemento se ANDea con esos,
 * nunca los reemplaza ni los amplía.
 */
import {
  ADDON_KEYS,
  ADDONS,
  isAddonKey,
  type AddonDefinition,
  type AddonKey,
} from "@/lib/addons/catalog"

/** Fila de `subscription_addons`. */
export interface AddonCatalogRow {
  addon_key: string
  price_ars_monthly?: number | string | null
  active?: boolean | null
  enforcement?: string | null
  sort_order?: number | null
}

/** Fila de `subscription_addon_plan_inclusions`. */
export interface AddonInclusionRow {
  addon_key: string
  plan_id: string
  included_until?: string | null
}

/** Fila de `organization_addons`. */
export interface OrganizationAddonRow {
  addon_key: string
  status: string
  price_ars_monthly_snapshot?: number | string | null
  price_source?: string | null
  billable_from?: string | null
  cancel_effective_at?: string | null
  requested_at?: string | null
  activated_at?: string | null
}

export type AddonEnforcement = "OFF" | "SHADOW" | "ON"

export type AddonState =
  | "OFF"
  | "REQUESTED"
  | "PENDING_SETUP"
  | "ACTIVE"
  | "SCHEDULED_CANCEL"
  | "CANCELLED"
  | "DENIED"
  | "INCLUDED"

export type AddonPriceSource = "SNAPSHOT" | "CATALOG" | "INCLUDED_IN_PLAN" | "NONE"

export interface AddonEntitlement {
  key: AddonKey
  definition: AddonDefinition
  /** ¿Puede usarlo AHORA? Es lo único que mira el gate. */
  enabled: boolean
  /** Estado comercial real, independiente del enforcement. */
  state: AddonState
  /**
   * true cuando `enabled` es true SOLO porque el enforcement todavía no gatea.
   * Es lo que loguea el modo SHADOW para ver a quién cortaría al encenderlo.
   */
  enabledOnlyByEnforcement: boolean
  includedInPlan: boolean
  includedUntil: string | null
  /** ARS/mes que se le cobra hoy. 0 si está incluido en el plan. */
  priceArsMonthly: number
  priceSource: AddonPriceSource
  billableFrom: string | null
  cancelEffectiveAt: string | null
  enforcement: AddonEnforcement
  /** Del catálogo en DB: si no está `active`, no se ofrece al cliente. */
  availableInCatalog: boolean
  selfServe: boolean
  sortOrder: number
}

export type AddonEntitlementMap = Record<AddonKey, AddonEntitlement>

function toEnforcement(value: string | null | undefined): AddonEnforcement {
  return value === "ON" || value === "SHADOW" ? value : "OFF"
}

function toAmount(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const n = Number(value)
  // PostgREST devuelve NUMERIC como string — de ahí el Number().
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

function isFutureIso(value: string | null | undefined, now: number): boolean {
  if (!value) return false
  const t = Date.parse(value)
  return Number.isFinite(t) && t > now
}

/**
 * Plan contra el que se evalúan las inclusiones. Un custom plan matchea
 * 'CUSTOM' y no su plan nominal: el precio lo manda el contrato, no el catálogo.
 */
export function effectivePlanId(
  plan: string | null | undefined,
  hasCustomPlan: boolean
): string | null {
  if (hasCustomPlan) return "CUSTOM"
  return plan ?? null
}

export interface ResolveAddonEntitlementsInput {
  now?: number
  plan: string | null | undefined
  hasCustomPlan: boolean
  catalog: AddonCatalogRow[] | null | undefined
  inclusions: AddonInclusionRow[] | null | undefined
  orgRows: OrganizationAddonRow[] | null | undefined
}

/**
 * Resuelve los 8 complementos de una vez. Siempre devuelve el mapa completo:
 * un complemento sin fila en ninguna tabla queda OFF con enforcement OFF, que
 * es "habilitado pero sin cobrar" — el estado inerte.
 *
 * Claves desconocidas en DB se ignoran, igual que hace `overlayPlanPrices`:
 * una fila de más nunca rompe el flujo.
 */
export function resolveAddonEntitlements(
  input: ResolveAddonEntitlementsInput
): AddonEntitlementMap {
  const now = input.now ?? Date.now()
  const planId = effectivePlanId(input.plan, input.hasCustomPlan)

  const catalogByKey = new Map<AddonKey, AddonCatalogRow>()
  for (const row of input.catalog ?? []) {
    if (isAddonKey(row.addon_key)) catalogByKey.set(row.addon_key, row)
  }

  // Inclusión vigente para el plan efectivo de esta org.
  const inclusionByKey = new Map<AddonKey, AddonInclusionRow>()
  for (const row of input.inclusions ?? []) {
    if (!isAddonKey(row.addon_key)) continue
    if (!planId || row.plan_id !== planId) continue
    // included_until null = incluido mientras esté en el plan.
    const vigente = row.included_until == null || isFutureIso(row.included_until, now)
    if (vigente) inclusionByKey.set(row.addon_key, row)
  }

  const orgByKey = new Map<AddonKey, OrganizationAddonRow>()
  for (const row of input.orgRows ?? []) {
    if (isAddonKey(row.addon_key)) orgByKey.set(row.addon_key, row)
  }

  const result = {} as AddonEntitlementMap

  for (const key of ADDON_KEYS) {
    const definition = ADDONS[key]
    const catalogRow = catalogByKey.get(key)
    const inclusion = inclusionByKey.get(key)
    const orgRow = orgByKey.get(key)

    const enforcement = toEnforcement(catalogRow?.enforcement)
    const includedInPlan = inclusion !== undefined

    // Estado comercial, sin mirar enforcement.
    let state: AddonState = "OFF"
    let ownedNow = false
    if (orgRow) {
      switch (orgRow.status) {
        case "ACTIVE":
          state = "ACTIVE"
          ownedNow = true
          break
        case "SCHEDULED_CANCEL":
          state = "SCHEDULED_CANCEL"
          // Lo sigue teniendo hasta el fin del ciclo que ya pagó.
          ownedNow = isFutureIso(orgRow.cancel_effective_at, now)
          break
        case "REQUESTED":
        case "PENDING_SETUP":
        case "CANCELLED":
        case "DENIED":
          state = orgRow.status as AddonState
          break
        default:
          state = "OFF"
      }
    }
    // La inclusión por plan solo "gana" el estado visible si no lo compró.
    if (includedInPlan && !ownedNow) state = "INCLUDED"

    const ownedOrIncluded = ownedNow || includedInPlan
    // Con enforcement OFF o SHADOW el gate deja pasar: es lo que permite
    // desplegar el cableado sin cambiar nada para nadie, y ensayar antes de
    // encender.
    const enabled = enforcement === "ON" ? ownedOrIncluded : true

    // Precio: incluido en el plan gana siempre y vale 0. Si no, el snapshot
    // congelado al contratar, y si no hay, el catálogo vigente.
    let priceArsMonthly = 0
    let priceSource: AddonPriceSource = "NONE"
    if (includedInPlan) {
      priceSource = "INCLUDED_IN_PLAN"
    } else if (ownedNow) {
      const snapshot = toAmount(orgRow?.price_ars_monthly_snapshot)
      if (snapshot !== null) {
        priceArsMonthly = snapshot
        priceSource = "SNAPSHOT"
      } else {
        const catalogPrice = toAmount(catalogRow?.price_ars_monthly)
        if (catalogPrice !== null) {
          priceArsMonthly = catalogPrice
          priceSource = "CATALOG"
        }
      }
    }

    result[key] = {
      key,
      definition,
      enabled,
      state,
      enabledOnlyByEnforcement: enabled && !ownedOrIncluded,
      includedInPlan,
      includedUntil: inclusion?.included_until ?? null,
      priceArsMonthly,
      priceSource,
      billableFrom: orgRow?.billable_from ?? null,
      cancelEffectiveAt: orgRow?.cancel_effective_at ?? null,
      enforcement,
      availableInCatalog: catalogRow?.active === true,
      selfServe: definition.selfServe,
      sortOrder: catalogRow?.sort_order ?? 0,
    }
  }

  return result
}

/** Predicado único que usan los gates. */
export function hasAddon(
  map: AddonEntitlementMap | null | undefined,
  key: AddonKey
): boolean {
  // Sin mapa (error de lectura) se deja pasar: ver la advertencia del encabezado
  // — esto es facturación, no autorización, y cortar la app por un hipo de DB
  // sería peor que no cobrar un mes.
  if (!map) return true
  return map[key]?.enabled !== false
}

/** Proyección mínima para el cliente: no lleva precios al bundle. */
export function enabledAddonKeys(map: AddonEntitlementMap | null | undefined): AddonKey[] {
  if (!map) return [...ADDON_KEYS]
  return ADDON_KEYS.filter((k) => map[k]?.enabled)
}

/** Mapa "todo habilitado", para el fail-open y para tests de no regresión. */
export function allAddonsEnabled(): AddonEntitlementMap {
  return resolveAddonEntitlements({
    plan: null,
    hasCustomPlan: false,
    catalog: null,
    inclusions: null,
    orgRows: null,
  })
}
