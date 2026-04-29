import { cashMovementsSchema } from "./cash-movements"

describe("cashMovementsSchema", () => {
  it("accepts valid INCOME", () => {
    expect(cashMovementsSchema.safeParse({
      account_name: "Caja ARS", date: "2026-01-15", type: "INCOME",
      amount: "1000", currency: "ARS", category: "VENTA",
    }).success).toBe(true)
  })
  it("rejects invalid type", () => {
    expect(cashMovementsSchema.safeParse({
      account_name: "X", date: "2026-01-15", type: "FOO",
      amount: "1", currency: "ARS", category: "VENTA",
    }).success).toBe(false)
  })
})
