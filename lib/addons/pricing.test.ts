import {
  resolveAddonEntitlements,
  type AddonCatalogRow,
  type AddonEntitlementMap,
  type AddonInclusionRow,
  type OrganizationAddonRow,
} from "@/lib/addons/entitlements"
import { computeAddonsMonthlyArs, computeSubscriptionTotalArs } from "@/lib/addons/pricing"
import type { MrrCustomPlan, MrrOrg } from "@/lib/billing/effective-price"
import type { PlanPriceCatalog } from "@/lib/billing/plan-pricing"

const NOW = Date.parse("2026-09-02T12:00:00.000Z")
const FUTURO = "2026-10-01T00:00:00.000Z"
const PASADO = "2026-08-01T00:00:00.000Z"

const PRECIOS: PlanPriceCatalog = { STARTER: 29900, PRO: 139000, ENTERPRISE: null }

function org(overrides: Partial<MrrOrg> = {}): MrrOrg {
  return {
    plan: "PRO",
    subscription_status: "ACTIVE",
    custom_plan_id: null,
    manual_mrr_override_ars: null,
    ...overrides,
  }
}

function entitlements(opts: {
  plan?: string | null
  hasCustomPlan?: boolean
  catalog?: AddonCatalogRow[] | null
  inclusions?: AddonInclusionRow[] | null
  orgRows?: OrganizationAddonRow[] | null
}): AddonEntitlementMap {
  return resolveAddonEntitlements({
    now: NOW,
    plan: opts.plan ?? "PRO",
    hasCustomPlan: opts.hasCustomPlan ?? false,
    catalog: opts.catalog ?? null,
    inclusions: opts.inclusions ?? null,
    orgRows: opts.orgRows ?? null,
  })
}

/** Complemento contratado y ya facturable. */
function contratado(key: string, price: number): {
  catalog: AddonCatalogRow[]
  orgRows: OrganizationAddonRow[]
} {
  return {
    catalog: [{ addon_key: key, price_ars_monthly: price, active: true, enforcement: "ON" }],
    orgRows: [
      {
        addon_key: key,
        status: "ACTIVE",
        price_ars_monthly_snapshot: price,
        billable_from: PASADO,
      },
    ],
  }
}

describe("computeSubscriptionTotalArs — la precedencia del plan base no cambia", () => {
  const sinAddons = entitlements({})

  it("usa plan_prices cuando no hay nada más", () => {
    const t = computeSubscriptionTotalArs({
      org: org(),
      customPlan: null,
      planPrices: PRECIOS,
      entitlements: sinAddons,
      now: NOW,
    })
    expect(t.baseArs).toBe(139000)
    expect(t.baseSource).toBe("PLAN_PRICES")
    expect(t.totalArs).toBe(139000)
  })

  it("el precio congelado le gana al de lista", () => {
    const t = computeSubscriptionTotalArs({
      org: org({ agreed_plan_price_ars: 119000, agreed_plan_id: "PRO" }),
      customPlan: null,
      planPrices: PRECIOS,
      entitlements: sinAddons,
      now: NOW,
    })
    expect(t.baseArs).toBe(119000)
    expect(t.baseSource).toBe("AGREED_PRICE")
  })

  it("el custom plan le gana al precio congelado", () => {
    const custom: MrrCustomPlan = {
      base_price_ars: 100000,
      discount_percent: 0,
      discount_ends_at: null,
    }
    const t = computeSubscriptionTotalArs({
      org: org({
        plan: "ENTERPRISE",
        custom_plan_id: "cp-1",
        agreed_plan_price_ars: 119000,
        agreed_plan_id: "ENTERPRISE",
      }),
      customPlan: custom,
      planPrices: PRECIOS,
      entitlements: sinAddons,
      now: NOW,
    })
    expect(t.baseArs).toBe(100000)
    expect(t.baseSource).toBe("CUSTOM_PLAN")
  })

  it("el override manual le gana a todo", () => {
    const t = computeSubscriptionTotalArs({
      org: org({ manual_mrr_override_ars: 200000, agreed_plan_price_ars: 119000, agreed_plan_id: "PRO" }),
      customPlan: null,
      planPrices: PRECIOS,
      entitlements: sinAddons,
      now: NOW,
    })
    expect(t.baseArs).toBe(200000)
    expect(t.baseSource).toBe("MANUAL_OVERRIDE")
  })
})

describe("computeSubscriptionTotalArs — suma de complementos", () => {
  it("suma el complemento contratado al plan base", () => {
    const t = computeSubscriptionTotalArs({
      org: org(),
      customPlan: null,
      planPrices: PRECIOS,
      entitlements: entitlements(contratado("library", 15000)),
      now: NOW,
    })
    expect(t.addonsArs).toBe(15000)
    expect(t.totalArs).toBe(154000)
    expect(t.addons).toHaveLength(1)
  })

  it("el override manual SUPRIME los complementos: es el número final", () => {
    const t = computeSubscriptionTotalArs({
      org: org({ manual_mrr_override_ars: 200000 }),
      customPlan: null,
      planPrices: PRECIOS,
      entitlements: entitlements(contratado("library", 15000)),
      now: NOW,
    })
    expect(t.addonsSuppressedByOverride).toBe(true)
    expect(t.totalArs).toBe(200000)
    // El desglose igual se expone para que el admin vea qué se está ignorando.
    expect(t.addonsArs).toBe(15000)
  })

  it("un custom plan SÍ suma complementos (fixture Lozada Rosario)", () => {
    const custom: MrrCustomPlan = {
      base_price_ars: 100000,
      discount_percent: 0,
      discount_ends_at: null,
    }
    const t = computeSubscriptionTotalArs({
      org: org({ plan: "ENTERPRISE", custom_plan_id: "cp-lozada" }),
      customPlan: custom,
      planPrices: PRECIOS,
      entitlements: entitlements({
        plan: "ENTERPRISE",
        hasCustomPlan: true,
        ...contratado("growth_studio", 25000),
      }),
      now: NOW,
    })
    expect(t.baseArs).toBe(100000)
    expect(t.addonsArs).toBe(25000)
    expect(t.totalArs).toBe(125000)
  })

  it("lo incluido en el plan se lista con importe 0 y no suma", () => {
    const t = computeSubscriptionTotalArs({
      org: org(),
      customPlan: null,
      planPrices: PRECIOS,
      entitlements: entitlements({
        catalog: [
          { addon_key: "emilia", price_ars_monthly: 30000, active: true, enforcement: "ON" },
        ],
        inclusions: [{ addon_key: "emilia", plan_id: "PRO", included_until: FUTURO }],
      }),
      now: NOW,
    })
    expect(t.addonsArs).toBe(0)
    expect(t.totalArs).toBe(139000)
    expect(t.addons.find((l) => l.key === "emilia")?.included).toBe(true)
  })

  it("sin entitlements (fail-open) el total es solo el plan base", () => {
    const t = computeSubscriptionTotalArs({
      org: org(),
      customPlan: null,
      planPrices: PRECIOS,
      entitlements: null,
      now: NOW,
    })
    expect(t.totalArs).toBe(139000)
    expect(t.addons).toHaveLength(0)
  })
})

describe("computeSubscriptionTotalArs — horizontes (sin prorrateo)", () => {
  it("lo recién prendido no se cobra hoy, pero sí el próximo ciclo", () => {
    const recienPrendido = {
      catalog: [
        { addon_key: "library", price_ars_monthly: 15000, active: true, enforcement: "ON" },
      ] as AddonCatalogRow[],
      orgRows: [
        // billable_from en el futuro: entra recién en el próximo débito.
        { addon_key: "library", status: "ACTIVE", price_ars_monthly_snapshot: 15000, billable_from: FUTURO },
      ] as OrganizationAddonRow[],
    }
    const ahora = computeSubscriptionTotalArs({
      org: org(), customPlan: null, planPrices: PRECIOS,
      entitlements: entitlements(recienPrendido), horizon: "now", now: NOW,
    })
    const proximo = computeSubscriptionTotalArs({
      org: org(), customPlan: null, planPrices: PRECIOS,
      entitlements: entitlements(recienPrendido), horizon: "next_cycle", now: NOW,
    })
    expect(ahora.totalArs).toBe(139000)
    expect(proximo.totalArs).toBe(154000)
  })

  it("lo dado de baja se cobra hoy y ya no el próximo ciclo", () => {
    const enBaja = {
      catalog: [
        { addon_key: "library", price_ars_monthly: 15000, active: true, enforcement: "ON" },
      ] as AddonCatalogRow[],
      orgRows: [
        {
          addon_key: "library",
          status: "SCHEDULED_CANCEL",
          price_ars_monthly_snapshot: 15000,
          billable_from: PASADO,
          cancel_effective_at: FUTURO,
        },
      ] as OrganizationAddonRow[],
    }
    const ahora = computeSubscriptionTotalArs({
      org: org(), customPlan: null, planPrices: PRECIOS,
      entitlements: entitlements(enBaja), horizon: "now", now: NOW,
    })
    const proximo = computeSubscriptionTotalArs({
      org: org(), customPlan: null, planPrices: PRECIOS,
      entitlements: entitlements(enBaja), horizon: "next_cycle", now: NOW,
    })
    expect(ahora.totalArs).toBe(154000)
    expect(proximo.totalArs).toBe(139000)
  })

  it("un ACTIVE sin billable_from no se cobra hoy (no se asume nada)", () => {
    const t = computeSubscriptionTotalArs({
      org: org(), customPlan: null, planPrices: PRECIOS,
      entitlements: entitlements({
        catalog: [{ addon_key: "library", price_ars_monthly: 15000, active: true, enforcement: "ON" }],
        orgRows: [{ addon_key: "library", status: "ACTIVE" }],
      }),
      horizon: "now",
      now: NOW,
    })
    expect(t.addonsArs).toBe(0)
  })
})

describe("computeAddonsMonthlyArs — redondeo", () => {
  it("redondea por línea antes de sumar, sin drift contra el desglose", () => {
    const map = entitlements({
      catalog: [
        { addon_key: "library", price_ars_monthly: "1000.4", active: true, enforcement: "ON" },
        { addon_key: "cerebro", price_ars_monthly: "1000.4", active: true, enforcement: "ON" },
        { addon_key: "growth_studio", price_ars_monthly: "1000.4", active: true, enforcement: "ON" },
      ],
      orgRows: [
        { addon_key: "library", status: "ACTIVE", billable_from: PASADO },
        { addon_key: "cerebro", status: "ACTIVE", billable_from: PASADO },
        { addon_key: "growth_studio", status: "ACTIVE", billable_from: PASADO },
      ],
    })
    const total = computeAddonsMonthlyArs(map, "now", NOW)
    const detalle = computeSubscriptionTotalArs({
      org: org(), customPlan: null, planPrices: PRECIOS,
      entitlements: map, horizon: "now", now: NOW,
    })
    // 3 × round(1000.4) = 3000, y el total coincide con la suma del desglose.
    expect(total).toBe(3000)
    expect(detalle.addons.reduce((a, l) => a + l.amountArs, 0)).toBe(total)
  })
})
