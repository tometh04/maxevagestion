import { paymentsSchema } from "./payments"

describe("paymentsSchema", () => {
  it("accepts INCOME payment", () => {
    expect(paymentsSchema.safeParse({
      operation_file_code: "OP-001", direction: "INCOME", amount: "100000",
      currency: "ARS", date_due: "2026-01-15",
    }).success).toBe(true)
  })
  it("rejects negative amount", () => {
    expect(paymentsSchema.safeParse({
      operation_file_code: "OP-001", direction: "INCOME", amount: "-1",
      currency: "ARS", date_due: "2026-01-15",
    }).success).toBe(false)
  })
  it("rejects invalid direction", () => {
    expect(paymentsSchema.safeParse({
      operation_file_code: "OP-001", direction: "FOO", amount: "1",
      currency: "ARS", date_due: "2026-01-15",
    }).success).toBe(false)
  })
})
