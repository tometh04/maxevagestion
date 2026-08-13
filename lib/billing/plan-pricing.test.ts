import {
  overlayPlanPrices,
  defaultPlanPriceCatalog,
  getPlanPricing,
} from "./plan-pricing"
import { PLANS } from "./plans"

describe("overlayPlanPrices", () => {
  it("sin filas → catálogo default de la constante PLANS", () => {
    expect(overlayPlanPrices([])).toEqual(defaultPlanPriceCatalog())
    expect(overlayPlanPrices(null)).toEqual({
      STARTER: PLANS.STARTER.priceArsMonthly,
      PRO: PLANS.PRO.priceArsMonthly,
      ENTERPRISE: PLANS.ENTERPRISE.priceArsMonthly,
    })
  })

  it("una fila pisa el default de ese plan", () => {
    const cat = overlayPlanPrices([{ plan_id: "PRO", price_ars_monthly: 149000 }])
    expect(cat.PRO).toBe(149000)
    expect(cat.STARTER).toBe(PLANS.STARTER.priceArsMonthly) // intacto
  })

  it("acepta numeric como string (viene NUMERIC de Postgres)", () => {
    const cat = overlayPlanPrices([{ plan_id: "PRO", price_ars_monthly: "150000.00" }])
    expect(cat.PRO).toBe(150000)
  })

  it("null en DB no pisa el default (constante como fallback)", () => {
    const cat = overlayPlanPrices([{ plan_id: "PRO", price_ars_monthly: null }])
    expect(cat.PRO).toBe(PLANS.PRO.priceArsMonthly)
  })

  it("valor inválido (<=0 o NaN) se ignora", () => {
    const cat = overlayPlanPrices([
      { plan_id: "PRO", price_ars_monthly: 0 },
      { plan_id: "STARTER", price_ars_monthly: "no-num" },
    ])
    expect(cat.PRO).toBe(PLANS.PRO.priceArsMonthly)
    expect(cat.STARTER).toBe(PLANS.STARTER.priceArsMonthly)
  })

  it("plan desconocido se ignora", () => {
    const cat = overlayPlanPrices([{ plan_id: "PLATINUM", price_ars_monthly: 999 }])
    expect(cat).toEqual(defaultPlanPriceCatalog())
  })

  it("Enterprise puede seguir null", () => {
    expect(overlayPlanPrices([]).ENTERPRISE).toBeNull()
  })
})

describe("getPlanPricing", () => {
  function fakeAdmin(result: { data: any; error: any }) {
    return {
      from: () => ({
        select: async () => result,
      }),
    } as any
  }

  it("query OK → overlay de DB", async () => {
    const cat = await getPlanPricing(
      fakeAdmin({ data: [{ plan_id: "PRO", price_ars_monthly: 200000 }], error: null })
    )
    expect(cat.PRO).toBe(200000)
  })

  it("query con error → default (no rompe)", async () => {
    const cat = await getPlanPricing(fakeAdmin({ data: null, error: { message: "no table" } }))
    expect(cat).toEqual(defaultPlanPriceCatalog())
  })

  it("throw en la query → default (no rompe)", async () => {
    const admin = {
      from: () => ({
        select: async () => {
          throw new Error("boom")
        },
      }),
    } as any
    const cat = await getPlanPricing(admin)
    expect(cat).toEqual(defaultPlanPriceCatalog())
  })
})
