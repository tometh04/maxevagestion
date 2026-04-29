import { validateRequiredFields, validateEmailFormat, validatePositiveAmount } from "../validator"

describe("validateRequiredFields", () => {
  it("retorna error si falta un required", () => {
    const errors = validateRequiredFields({ name: "Juan" }, ["name", "phone"])
    expect(errors).toHaveLength(1)
    expect(errors[0].field).toBe("phone")
    expect(errors[0].message).toMatch(/requerido/i)
  })

  it("retorna [] si todos están", () => {
    const errors = validateRequiredFields({ name: "Juan", phone: "123" }, ["name", "phone"])
    expect(errors).toEqual([])
  })

  it("trata strings con solo whitespace como faltantes", () => {
    const errors = validateRequiredFields({ name: "   " }, ["name"])
    expect(errors).toHaveLength(1)
  })
})

describe("validateEmailFormat", () => {
  it("acepta emails válidos", () => {
    expect(validateEmailFormat("juan@test.com")).toBeNull()
    expect(validateEmailFormat("a.b@sub.domain.org")).toBeNull()
  })
  it("rechaza emails inválidos", () => {
    expect(validateEmailFormat("not-an-email")).toMatch(/inválido/i)
    expect(validateEmailFormat("@test.com")).toMatch(/inválido/i)
    expect(validateEmailFormat("user@")).toMatch(/inválido/i)
  })
  it("acepta vacío (es opcional)", () => {
    expect(validateEmailFormat("")).toBeNull()
    expect(validateEmailFormat("   ")).toBeNull()
  })
})

describe("validatePositiveAmount", () => {
  it("acepta positivos y cero", () => {
    expect(validatePositiveAmount(100)).toBeNull()
    expect(validatePositiveAmount(0)).toBeNull()
  })
  it("rechaza negativos", () => {
    expect(validatePositiveAmount(-50)).toMatch(/no puede ser negativo/i)
  })
})
