import { operationsSchema } from "./operations"

describe("operationsSchema", () => {
  it("accepts valid", () => {
    expect(operationsSchema.safeParse({
      file_code: "OP-001", customer_document: "12345678", operator_name: "Despegar",
      seller_email: "v@e.com", agency_name: "Rosario", destination: "Cancún",
      departure_date: "2026-05-15", sale_amount: "500000", operator_cost: "400000",
      currency: "ARS", status: "CONFIRMED",
    }).success).toBe(true)
  })
  it("rejects missing file_code", () => {
    expect(operationsSchema.safeParse({
      file_code: "", customer_document: "1", operator_name: "O", seller_email: "a@b.c",
      agency_name: "A", destination: "D", departure_date: "2026-01-01",
      sale_amount: "1", operator_cost: "1", currency: "ARS", status: "CONFIRMED",
    }).success).toBe(false)
  })
  it("rejects invalid status", () => {
    expect(operationsSchema.safeParse({
      file_code: "X", customer_document: "1", operator_name: "O", seller_email: "a@b.c",
      agency_name: "A", destination: "D", departure_date: "2026-01-01",
      sale_amount: "1", operator_cost: "1", currency: "ARS", status: "FOO",
    }).success).toBe(false)
  })
})
