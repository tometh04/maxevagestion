import { normalizeARNumber } from "@/lib/ai/statement-parser"

describe("normalizeARNumber", () => {
  it("parsea formato AR con coma decimal y puntos de miles", () => {
    expect(normalizeARNumber("2.951,19")).toBe(2951.19)
    expect(normalizeARNumber("1.234.567,89")).toBe(1234567.89)
    expect(normalizeARNumber("$ 45.200,00")).toBe(45200)
  })

  it("parsea solo coma como decimal", () => {
    expect(normalizeARNumber("20,50")).toBe(20.5)
    expect(normalizeARNumber("0,99")).toBe(0.99)
  })

  it("trata varios puntos como separadores de miles", () => {
    expect(normalizeARNumber("1.234.567")).toBe(1234567)
  })

  it("deja un solo punto como decimal (evita inflar x1000)", () => {
    expect(normalizeARNumber("2.95")).toBe(2.95)
    expect(normalizeARNumber("20.00")).toBe(20)
  })

  it("acepta números ya normalizados", () => {
    expect(normalizeARNumber(45200)).toBe(45200)
    expect(normalizeARNumber(20.5)).toBe(20.5)
  })

  it("devuelve valor absoluto (montos positivos)", () => {
    expect(normalizeARNumber("-1.500,00")).toBe(1500)
    expect(normalizeARNumber(-320)).toBe(320)
  })

  it("ignora símbolos de moneda y espacios", () => {
    expect(normalizeARNumber("U$S 320,00")).toBe(320)
    expect(normalizeARNumber("  1.000,00 ARS ")).toBe(1000)
  })

  it("devuelve null para entradas no parseables", () => {
    expect(normalizeARNumber("")).toBeNull()
    expect(normalizeARNumber(null)).toBeNull()
    expect(normalizeARNumber(undefined)).toBeNull()
    expect(normalizeARNumber("abc")).toBeNull()
    expect(normalizeARNumber(NaN)).toBeNull()
  })
})
