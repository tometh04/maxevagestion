import {
  getQuotationCustomerTotal,
  getQuotationItemEffectiveUnitCost,
  getQuotationOptionCostTotal,
} from "@/lib/quotations/totals"

describe("quotation customer totals", () => {
  it("uses the effective option price and both global add-ons", () => {
    expect(getQuotationCustomerTotal(
      { total_amount: 1_800, manual_total_amount: 1_850 },
      { insuranceAmount: 100, transferAmount: 50 }
    )).toBe(2_000)
  })

  it("does not subtract malformed negative add-ons", () => {
    expect(getQuotationCustomerTotal(
      { total_amount: 1_800 },
      { insuranceAmount: -100, transferAmount: null }
    )).toBe(1_800)
  })
})

describe("quotation effective operator costs", () => {
  it("adds the administrative fee to a SIMPLE net cost", () => {
    expect(getQuotationItemEffectiveUnitCost({
      cost_calculation_mode: "SIMPLE",
      cost_amount: 1_000,
      admin_fee_percentage: 10,
    })).toBe(1_100)
  })

  it("uses gross minus commission plus fee for COMMISSIONABLE costs", () => {
    expect(getQuotationItemEffectiveUnitCost({
      cost_calculation_mode: "COMMISSIONABLE",
      gross_price: 1_000,
      commission_percentage: 20,
      admin_fee_percentage: 5,
      cost_amount: 800,
    })).toBe(850)
  })

  it("multiplies the effective unit cost by quantity", () => {
    expect(getQuotationOptionCostTotal([{
      quantity: 2,
      cost_calculation_mode: "SIMPLE",
      cost_amount: 1_000,
      admin_fee_percentage: 10,
    }])).toBe(2_200)
  })
})
