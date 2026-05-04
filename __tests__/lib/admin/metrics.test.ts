import {
  computeMrrArs,
  computeMrrArsDetailed,
  computeTrialPipelineMrrArs,
  computePotentialMrrArs,
} from "@/lib/admin/metrics"

const FUTURE = new Date(Date.now() + 86400 * 30 * 1000).toISOString()
const PAST = new Date(Date.now() - 86400 * 1000).toISOString()

describe("computeMrrArs", () => {
  it("TRIAL org → 0", () => {
    expect(
      computeMrrArs(
        { plan: "PRO", subscription_status: "TRIAL", custom_plan_id: null, manual_mrr_override_ars: null },
        null,
      ),
    ).toBe(0)
  })

  it("ACTIVE STARTER → 29900", () => {
    expect(
      computeMrrArs(
        { plan: "STARTER", subscription_status: "ACTIVE", custom_plan_id: null, manual_mrr_override_ars: null },
        null,
      ),
    ).toBe(29900)
  })

  it("ACTIVE PRO → 119000", () => {
    expect(
      computeMrrArs(
        { plan: "PRO", subscription_status: "ACTIVE", custom_plan_id: null, manual_mrr_override_ars: null },
        null,
      ),
    ).toBe(119000)
  })

  it("ACTIVE ENTERPRISE without custom_plan and without override → fallback PRO price (Bug #4)", () => {
    // Cambiado por Bug #4: orgs ACTIVE sin precio configurado se estiman con PRO,
    // en vez de tirar 0 (falsamente sugería que no contribuían al MRR).
    expect(
      computeMrrArs(
        { plan: "ENTERPRISE", subscription_status: "ACTIVE", custom_plan_id: null, manual_mrr_override_ars: null },
        null,
      ),
    ).toBe(119000)
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
    ).toBe(119000)
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

describe("computeMrrArsDetailed (Bug #4)", () => {
  it("ENTERPRISE Active sin config → estimated:true con monto PRO", () => {
    expect(
      computeMrrArsDetailed(
        { plan: "ENTERPRISE", subscription_status: "ACTIVE", custom_plan_id: null, manual_mrr_override_ars: null },
        null,
      ),
    ).toEqual({ amount: 119000, estimated: true })
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
    ).toEqual({ amount: 119000, estimated: false })
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

  it("TRIALING with PRO plan returns 119000", () => {
    expect(
      computeTrialPipelineMrrArs(
        { plan: "PRO", subscription_status: "TRIALING", custom_plan_id: null, manual_mrr_override_ars: null },
        null,
      ),
    ).toBe(119000)
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
  it("ignores status — CANCELLED PRO still returns 119000", () => {
    expect(
      computePotentialMrrArs(
        { plan: "PRO", subscription_status: "CANCELLED", custom_plan_id: null, manual_mrr_override_ars: null },
        null,
      ),
    ).toBe(119000)
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
