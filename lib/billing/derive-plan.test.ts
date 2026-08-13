import { derivePlanFromAmount } from "./derive-plan"
import { defaultPlanPriceCatalog } from "./plan-pricing"
import { PLANS } from "./plans"

describe("derivePlanFromAmount", () => {
  const catalog = defaultPlanPriceCatalog()

  it("matchea el plan por el monto del catálogo efectivo", () => {
    expect(derivePlanFromAmount(PLANS.PRO.priceArsMonthly, catalog)).toBe("PRO")
    expect(derivePlanFromAmount(PLANS.STARTER.priceArsMonthly, catalog)).toBe("STARTER")
  })

  // Precio de lista editado desde /admin/billing, distinto del de la constante.
  const edited = { ...catalog, PRO: PLANS.PRO.priceArsMonthly! + 20000 }

  it("usa el precio editado desde admin, no la constante", () => {
    expect(derivePlanFromAmount(edited.PRO, edited)).toBe("PRO")
    // El precio de la constante ya no matchea nada.
    expect(derivePlanFromAmount(PLANS.PRO.priceArsMonthly, edited)).toBeNull()
  })

  it("un monto grandfathered no matchea → null (el caller deja el plan como está)", () => {
    expect(derivePlanFromAmount(edited.PRO - 20000, edited)).toBeNull()
  })

  it("montos ausentes o no usables → null", () => {
    expect(derivePlanFromAmount(undefined, catalog)).toBeNull()
    expect(derivePlanFromAmount(null, catalog)).toBeNull()
    expect(derivePlanFromAmount(0, catalog)).toBeNull()
    expect(derivePlanFromAmount(NaN, catalog)).toBeNull()
  })

  it("ENTERPRISE tiene precio null: nunca se infiere por monto", () => {
    expect(catalog.ENTERPRISE).toBeNull()
    expect(derivePlanFromAmount(450000, catalog)).toBeNull()
  })
})
