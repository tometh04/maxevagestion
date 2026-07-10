import {
  EUROVIPS_DESCRIPTION_MAX_LENGTH,
  EUROVIPS_POLICY_MAX_LENGTH,
  truncateEurovipsDescription,
  truncateEurovipsPolicy,
} from "../display-text"

describe("Emilia display text helpers", () => {
  it("recorta descripciones de habitaciones a 120 caracteres", () => {
    const text = "SUITE KING O QUEEN ESTANDAR DE 1 DORMITORIO CON CAMA SUPLETORIA / ALOJAMIENTO Y DESAYUNO " +
      "Cargo de Cancelacion desde: 09-07-2026, hasta: 20-08-2026"

    const result = truncateEurovipsDescription(text)

    expect(result.length).toBeLessThanOrEqual(EUROVIPS_DESCRIPTION_MAX_LENGTH)
    expect(result.endsWith("...")).toBe(true)
  })

  it("recorta politicas hoteleras largas a 180 caracteres", () => {
    const policy = "Si selecciona dos o mas habitaciones deben ser de la misma categoria y regimen; " +
      "verifique que las mismas tengan el mismo numero indicado entre parentesis. " +
      "https://d2poxrheyfxwbo.cloudfront.net/hotel/demo ".repeat(20)

    const result = truncateEurovipsPolicy(policy)

    expect(result.length).toBeLessThanOrEqual(EUROVIPS_POLICY_MAX_LENGTH)
    expect(result).toContain("misma categoria y regimen")
    expect(result.endsWith("...")).toBe(true)
  })

  it("normaliza espacios antes de medir", () => {
    expect(truncateEurovipsPolicy("  Politica   con\nsaltos\tde linea  ")).toBe("Politica con saltos de linea")
  })
})
