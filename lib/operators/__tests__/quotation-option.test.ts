import { QUOTATION_OPERATOR_SELECT } from "@/lib/operators/quotation-option"

describe("quotation operator projection", () => {
  it("incluye todos los defaults que cambian el cálculo del costo", () => {
    expect(QUOTATION_OPERATOR_SELECT.split(/,\s*/)).toEqual([
      "id",
      "name",
      "agency_id",
      "admin_fee_percentage",
      "cost_calculation_mode",
      "commission_percentage",
    ])
  })
})
