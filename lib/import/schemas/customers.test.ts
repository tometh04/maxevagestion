import { customersSchema, customersNaturalKey } from "./customers"

describe("customersSchema", () => {
  it("accepts valid row with doc", () => {
    const r = customersSchema.safeParse({
      first_name: "Juan", last_name: "Pérez", phone: "11 1234-5678",
      email: "j@p.com", document_type: "DNI", document_number: "12345678",
      date_of_birth: "1990-01-15", nationality: "Argentina",
    })
    expect(r.success).toBe(true)
  })
  it("rejects short phone", () => {
    expect(customersSchema.safeParse({
      first_name: "A", last_name: "B", phone: "123",
    }).success).toBe(false)
  })
  it("naturalKey prefers document_number", () => {
    expect(customersNaturalKey({
      first_name: "A", last_name: "B", phone: "11111111",
      document_number: "123", email: "x@y.com",
    } as any)).toBe("doc:123")
  })
  it("naturalKey fallback to email", () => {
    expect(customersNaturalKey({
      first_name: "A", last_name: "B", phone: "11111111",
      document_number: "", email: "x@y.com",
    } as any)).toBe("email:x@y.com")
  })
})
