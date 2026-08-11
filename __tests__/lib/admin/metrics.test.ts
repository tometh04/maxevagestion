import {
  computeMrrArs,
  computeMrrArsDetailed,
  computeTrialPipelineMrrArs,
  computePotentialMrrArs,
} from "@/lib/admin/metrics"
import { PLANS } from "@/lib/billing/plans"

const FUTURE = new Date(Date.now() + 86400 * 30 * 1000).toISOString()
const PAST = new Date(Date.now() - 86400 * 1000).toISOString()

// Los precios de lista se editan desde platform-admin y la constante cambia con
// ellos: leerlos de PLANS evita que estos tests se pudran en cada ajuste.
const PRO_PRICE = PLANS.PRO.priceArsMonthly!
const STARTER_PRICE = PLANS.STARTER.priceArsMonthly!

describe("computeMrrArs", () => {
  it("TRIAL org → 0", () => {
    expect(
      computeMrrArs(
        { plan: "PRO", subscription_status: "TRIAL", custom_plan_id: null, manual_mrr_override_ars: null },
        null,
      ),
    ).toBe(0)
  })

  it("ACTIVE STARTER → STARTER_PRICE", () => {
    expect(
      computeMrrArs(
        { plan: "STARTER", subscription_status: "ACTIVE", custom_plan_id: null, manual_mrr_override_ars: null },
        null,
      ),
    ).toBe(STARTER_PRICE)
  })

  it("ACTIVE PRO → PRO_PRICE", () => {
    expect(
      computeMrrArs(
        { plan: "PRO", subscription_status: "ACTIVE", custom_plan_id: null, manual_mrr_override_ars: null },
        null,
      ),
    ).toBe(PRO_PRICE)
  })

  it("ACTIVE ENTERPRISE without custom_plan and without override → fallback PRO price (Bug #4)", () => {
    // Cambiado por Bug #4: orgs ACTIVE sin precio configurado se estiman con PRO,
    // en vez de tirar 0 (falsamente sugería que no contribuían al MRR).
    expect(
      computeMrrArs(
        { plan: "ENTERPRISE", subscription_status: "ACTIVE", custom_plan_id: null, manual_mrr_override_ars: null },
        null,
      ),
    ).toBe(PRO_PRICE)
  })

  it("ACTIVE custom_plan no discount → base_price", () => {
    expect(
      computeMrrArs(
        { plan: "ENTERPRISE", subscription_status: "ACTIVE", custom_plan_id: "cp1", manual_mrr_override_ars: null },
        { base_price_ars: 500000, discount_percent: 0, discount_ends_at: null },
      ),
    ).toBe(500000)
  })

  it("ACTIVE custom_plan discount active → discounted", () => {
    expect(
      computeMrrArs(
        { plan: "ENTERPRISE", subscription_status: "ACTIVE", custom_plan_id: "cp1", manual_mrr_override_ars: null },
        { base_price_ars: 500000, discount_percent: 20, discount_ends_at: FUTURE },
      ),
    ).toBe(400000)
  })

  it("ACTIVE custom_plan discount expired → base_price", () => {
    expect(
      computeMrrArs(
        { plan: "ENTERPRISE", subscription_status: "ACTIVE", custom_plan_id: "cp1", manual_mrr_override_ars: null },
        { base_price_ars: 500000, discount_percent: 20, discount_ends_at: PAST },
      ),
    ).toBe(500000)
  })

  it("SUSPENDED → 0", () => {
    expect(
      computeMrrArs(
        { plan: "PRO", subscription_status: "SUSPENDED", custom_plan_id: null, manual_mrr_override_ars: null },
        null,
      ),
    ).toBe(0)
  })

  it("override > 0 wins over PLANS price", () => {
    expect(
      computeMrrArs(
        { plan: "PRO", subscription_status: "ACTIVE", custom_plan_id: null, manual_mrr_override_ars: 250000 },
        null,
      ),
    ).toBe(250000)
  })

  it("override > 0 wins over custom_plan price", () => {
    expect(
      computeMrrArs(
        { plan: "ENTERPRISE", subscription_status: "ACTIVE", custom_plan_id: "cp1", manual_mrr_override_ars: 719000 },
        { base_price_ars: 500000, discount_percent: 0, discount_ends_at: null },
      ),
    ).toBe(719000)
  })

  it("override = 0 falls through to PLANS price", () => {
    expect(
      computeMrrArs(
        { plan: "PRO", subscription_status: "ACTIVE", custom_plan_id: null, manual_mrr_override_ars: 0 },
        null,
      ),
    ).toBe(PRO_PRICE)
  })

  it("override + non-paying status → 0 (status filter sigue primero)", () => {
    expect(
      computeMrrArs(
        { plan: "ENTERPRISE", subscription_status: "TRIALING", custom_plan_id: null, manual_mrr_override_ars: 719000 },
        null,
      ),
    ).toBe(0)
  })
})

/**
 * Grandfathering: cuando sube el precio de lista, las orgs viejas siguen
 * pagando el monto anterior. El MRR tiene que reflejar eso — si no, subir un
 * precio infla el dashboard sin que entre un peso.
 */
describe("computeMrrArs — precio pactado (grandfathering)", () => {
  const grandfathered = {
    plan: "PRO",
    subscription_status: "ACTIVE",
    custom_plan_id: null,
    manual_mrr_override_ars: null,
    agreed_plan_price_ars: 119000,
    agreed_plan_id: "PRO",
  }
  // Precio de lista nuevo, más alto que el congelado.
  const listCatalog = { STARTER: STARTER_PRICE, PRO: 139000, ENTERPRISE: null }

  it("el precio pactado le gana al precio de lista", () => {
    expect(computeMrrArs(grandfathered, null, listCatalog)).toBe(119000)
  })

  it("acepta NUMERIC como string", () => {
    expect(
      computeMrrArs({ ...grandfathered, agreed_plan_price_ars: "119000.00" }, null, listCatalog),
    ).toBe(119000)
  })

  it("se ignora si corresponde a OTRO plan (la org cambió de plan)", () => {
    expect(
      computeMrrArs({ ...grandfathered, agreed_plan_id: "ENTERPRISE" }, null, listCatalog),
    ).toBe(139000)
  })

  it("pierde contra el override manual", () => {
    expect(
      computeMrrArs({ ...grandfathered, manual_mrr_override_ars: 200000 }, null, listCatalog),
    ).toBe(200000)
  })

  it("pierde contra el custom plan", () => {
    expect(
      computeMrrArs(
        { ...grandfathered, plan: "ENTERPRISE", agreed_plan_id: "ENTERPRISE", custom_plan_id: "cp1" },
        { base_price_ars: 500000, discount_percent: 0, discount_ends_at: null },
        listCatalog,
      ),
    ).toBe(500000)
  })

  it("no es estimado: es plata real", () => {
    expect(computeMrrArsDetailed(grandfathered, null, listCatalog)).toEqual({
      amount: 119000,
      estimated: false,
    })
  })

  it("el pipeline de trials también usa el precio pactado", () => {
    expect(
      computeTrialPipelineMrrArs(
        { ...grandfathered, subscription_status: "TRIALING" },
        null,
        listCatalog,
      ),
    ).toBe(119000)
  })

  it("el churn mide lo que realmente se perdió, no el precio de lista nuevo", () => {
    expect(
      computePotentialMrrArs(
        { ...grandfathered, subscription_status: "CANCELLED" },
        null,
        listCatalog,
      ),
    ).toBe(119000)
  })

  it("sin precio pactado → precio de lista (comportamiento histórico intacto)", () => {
    expect(
      computeMrrArs(
        { plan: "PRO", subscription_status: "ACTIVE", custom_plan_id: null, manual_mrr_override_ars: null },
        null,
        listCatalog,
      ),
    ).toBe(139000)
  })
})

describe("computeMrrArsDetailed (Bug #4)", () => {
  it("ENTERPRISE Active sin config → estimated:true con monto PRO", () => {
    expect(
      computeMrrArsDetailed(
        { plan: "ENTERPRISE", subscription_status: "ACTIVE", custom_plan_id: null, manual_mrr_override_ars: null },
        null,
      ),
    ).toEqual({ amount: PRO_PRICE, estimated: true })
  })

  it("ENTERPRISE Active con override → estimated:false con valor real", () => {
    expect(
      computeMrrArsDetailed(
        { plan: "ENTERPRISE", subscription_status: "ACTIVE", custom_plan_id: null, manual_mrr_override_ars: 719000 },
        null,
      ),
    ).toEqual({ amount: 719000, estimated: false })
  })

  it("ENTERPRISE Active con custom_plan → estimated:false con valor real", () => {
    expect(
      computeMrrArsDetailed(
        { plan: "ENTERPRISE", subscription_status: "ACTIVE", custom_plan_id: "cp1", manual_mrr_override_ars: null },
        { base_price_ars: 500000, discount_percent: 0, discount_ends_at: null },
      ),
    ).toEqual({ amount: 500000, estimated: false })
  })

  it("PRO Active → estimated:false (no fallback)", () => {
    expect(
      computeMrrArsDetailed(
        { plan: "PRO", subscription_status: "ACTIVE", custom_plan_id: null, manual_mrr_override_ars: null },
        null,
      ),
    ).toEqual({ amount: PRO_PRICE, estimated: false })
  })

  it("ENTERPRISE en TRIALING → 0 (no aplica fallback porque no está pagando)", () => {
    expect(
      computeMrrArsDetailed(
        { plan: "ENTERPRISE", subscription_status: "TRIALING", custom_plan_id: null, manual_mrr_override_ars: null },
        null,
      ),
    ).toEqual({ amount: 0, estimated: false })
  })
})

describe("computeTrialPipelineMrrArs", () => {
  it("returns 0 if status is not TRIALING", () => {
    expect(
      computeTrialPipelineMrrArs(
        { plan: "PRO", subscription_status: "ACTIVE", custom_plan_id: null, manual_mrr_override_ars: null },
        null,
      ),
    ).toBe(0)
  })

  it("TRIALING with PRO plan returns PRO_PRICE", () => {
    expect(
      computeTrialPipelineMrrArs(
        { plan: "PRO", subscription_status: "TRIALING", custom_plan_id: null, manual_mrr_override_ars: null },
        null,
      ),
    ).toBe(PRO_PRICE)
  })

  it("TRIALING with override returns override", () => {
    expect(
      computeTrialPipelineMrrArs(
        { plan: "ENTERPRISE", subscription_status: "TRIALING", custom_plan_id: null, manual_mrr_override_ars: 500000 },
        null,
      ),
    ).toBe(500000)
  })

  it("TRIALING with custom_plan returns custom price", () => {
    expect(
      computeTrialPipelineMrrArs(
        { plan: "ENTERPRISE", subscription_status: "TRIALING", custom_plan_id: "cp1", manual_mrr_override_ars: null },
        { base_price_ars: 300000, discount_percent: 0, discount_ends_at: null },
      ),
    ).toBe(300000)
  })
})

describe("computePotentialMrrArs", () => {
  it("ignores status — CANCELLED PRO still returns PRO_PRICE", () => {
    expect(
      computePotentialMrrArs(
        { plan: "PRO", subscription_status: "CANCELLED", custom_plan_id: null, manual_mrr_override_ars: null },
        null,
      ),
    ).toBe(PRO_PRICE)
  })

  it("SUSPENDED with override returns override", () => {
    expect(
      computePotentialMrrArs(
        { plan: "ENTERPRISE", subscription_status: "SUSPENDED", custom_plan_id: null, manual_mrr_override_ars: 719000 },
        null,
      ),
    ).toBe(719000)
  })

  it("CANCELLED ENTERPRISE without anything → 0", () => {
    expect(
      computePotentialMrrArs(
        { plan: "ENTERPRISE", subscription_status: "CANCELLED", custom_plan_id: null, manual_mrr_override_ars: null },
        null,
      ),
    ).toBe(0)
  })
})
