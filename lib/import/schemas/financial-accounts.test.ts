import { financialAccountsSchema, financialAccountsCsvHeaders } from "./financial-accounts"

describe("financialAccountsSchema", () => {
  it("accepts CAJA ARS", () => {
    const r = financialAccountsSchema.safeParse({
      name: "Caja ARS Rosario", type: "CAJA", currency: "ARS", initial_balance: "100",
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.initial_balance).toBe(100)
  })
  it("rejects invalid type", () => {
    expect(financialAccountsSchema.safeParse({
      name: "X", type: "FOO", currency: "ARS", initial_balance: "0",
    }).success).toBe(false)
  })
  it("rejects invalid currency", () => {
    expect(financialAccountsSchema.safeParse({
      name: "X", type: "CAJA", currency: "EUR", initial_balance: "0",
    }).success).toBe(false)
  })
  it("headers constant", () => {
    expect(financialAccountsCsvHeaders).toContain("name")
    expect(financialAccountsCsvHeaders).toContain("type")
    expect(financialAccountsCsvHeaders).toContain("currency")
    expect(financialAccountsCsvHeaders).toContain("initial_balance")
  })
})
