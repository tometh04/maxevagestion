import { operatorsSchema, operatorsNaturalKey } from "./operators"

describe("operatorsSchema", () => {
  it("accepts minimal row", () => {
    expect(operatorsSchema.safeParse({ name: "Despegar" }).success).toBe(true)
  })
  // 2026-05-18 (Tomi): name ya no es required a nivel schema. Si la fila tiene
  // sólo CUIT, contacto, email o teléfono, también pasa. El pipeline pone
  // "Sin nombre - fila N" como fallback.
  it("accepts row without name if has CUIT", () => {
    expect(operatorsSchema.safeParse({ cuit: "30-12345678-9" }).success).toBe(true)
  })
  it("accepts row without name if has contact_email", () => {
    expect(operatorsSchema.safeParse({ contact_email: "x@y.com" }).success).toBe(true)
  })
  it("rejects fully empty row", () => {
    expect(operatorsSchema.safeParse({}).success).toBe(false)
  })
  it("rejects row with only name=''", () => {
    expect(operatorsSchema.safeParse({ name: "" }).success).toBe(false)
  })
  it("naturalKey prefers CUIT", () => {
    expect(operatorsNaturalKey({ name: "X", cuit: "30-12345678-9" } as any)).toBe("cuit:30-12345678-9")
  })
  it("naturalKey fallback to name", () => {
    expect(operatorsNaturalKey({ name: "Despegar" } as any)).toBe("name:Despegar")
  })
})
