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
  // 2026-05-18 (Tomi reportó VICO): phone ya no es required. Antes este test
  // rechazaba phone "123" (menos de 8). Ahora el schema permite TODOS los
  // campos opcionales — la única defensa es "fila no vacía".
  it("accepts row without phone", () => {
    expect(customersSchema.safeParse({
      first_name: "A", last_name: "B",
    }).success).toBe(true)
  })
  it("accepts row with only email", () => {
    expect(customersSchema.safeParse({
      email: "x@y.com",
    }).success).toBe(true)
  })
  it("accepts row with only document_number", () => {
    expect(customersSchema.safeParse({
      document_number: "12345678",
    }).success).toBe(true)
  })
  it("rejects fully empty row (sin nombre/email/phone/doc)", () => {
    expect(customersSchema.safeParse({}).success).toBe(false)
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
