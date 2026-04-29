import { operatorsSchema, operatorsNaturalKey } from "./operators"

describe("operatorsSchema", () => {
  it("accepts minimal row", () => {
    expect(operatorsSchema.safeParse({ name: "Despegar" }).success).toBe(true)
  })
  it("rejects empty name", () => {
    expect(operatorsSchema.safeParse({ name: "" }).success).toBe(false)
  })
  it("naturalKey prefers CUIT", () => {
    expect(operatorsNaturalKey({ name: "X", cuit: "30-12345678-9" } as any)).toBe("cuit:30-12345678-9")
  })
  it("naturalKey fallback to name", () => {
    expect(operatorsNaturalKey({ name: "Despegar" } as any)).toBe("name:Despegar")
  })
})
