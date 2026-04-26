import { computeMrrArs } from "@/lib/admin/metrics"

const FUTURE = new Date(Date.now() + 86400 * 30 * 1000).toISOString()
const PAST = new Date(Date.now() - 86400 * 1000).toISOString()

describe("computeMrrArs", () => {
  it("TRIAL org → 0", () => {
    expect(
      computeMrrArs(
        { plan: "PRO", subscription_status: "TRIAL", custom_plan_id: null },
        null,
      ),
    ).toBe(0)
  })

  it("ACTIVE STARTER → 29900", () => {
    expect(
      computeMrrArs(
        { plan: "STARTER", subscription_status: "ACTIVE", custom_plan_id: null },
        null,
      ),
    ).toBe(29900)
  })

  it("ACTIVE PRO → 119000", () => {
    expect(
      computeMrrArs(
        { plan: "PRO", subscription_status: "ACTIVE", custom_plan_id: null },
        null,
      ),
    ).toBe(119000)
  })

  it("ACTIVE ENTERPRISE without custom_plan → 0 (contact-sales, no price)", () => {
    expect(
      computeMrrArs(
        { plan: "ENTERPRISE", subscription_status: "ACTIVE", custom_plan_id: null },
        null,
      ),
    ).toBe(0)
  })

  it("ACTIVE with custom_plan, no discount → base_price", () => {
    expect(
      computeMrrArs(
        { plan: "ENTERPRISE", subscription_status: "ACTIVE", custom_plan_id: "cp-1" },
        { base_price_ars: 200000, discount_percent: 20, discount_ends_at: null },
      ),
    ).toBe(200000)
  })

  it("ACTIVE with custom_plan, discount active → discounted price", () => {
    expect(
      computeMrrArs(
        { plan: "ENTERPRISE", subscription_status: "ACTIVE", custom_plan_id: "cp-1" },
        { base_price_ars: 200000, discount_percent: 20, discount_ends_at: FUTURE },
      ),
    ).toBe(160000)
  })

  it("ACTIVE with custom_plan, discount expired → base_price", () => {
    expect(
      computeMrrArs(
        { plan: "ENTERPRISE", subscription_status: "ACTIVE", custom_plan_id: "cp-1" },
        { base_price_ars: 200000, discount_percent: 20, discount_ends_at: PAST },
      ),
    ).toBe(200000)
  })

  it("SUSPENDED org → 0", () => {
    expect(
      computeMrrArs(
        { plan: "PRO", subscription_status: "SUSPENDED", custom_plan_id: null },
        null,
      ),
    ).toBe(0)
  })
})
