import {
  parseAmount,
  parseDate,
  normalizeCurrency,
  normalizeStatus,
} from "../normalizer"

describe("parseAmount", () => {
  it("parsea montos simples", () => {
    expect(parseAmount("1000")).toBe(1000)
    expect(parseAmount("1500.50")).toBe(1500.5)
  })

  it("remueve $ y comas formato US", () => {
    expect(parseAmount("$13,680")).toBe(13680)
    expect(parseAmount("$1,234,567.89")).toBe(1234567.89)
  })

  it("retorna null para vacío o no numérico", () => {
    expect(parseAmount("")).toBeNull()
    expect(parseAmount("abc")).toBeNull()
    expect(parseAmount("$")).toBeNull()
  })

  it("retorna 0 para '$0' o '0'", () => {
    expect(parseAmount("$0")).toBe(0)
    expect(parseAmount("0")).toBe(0)
  })
})

describe("parseDate", () => {
  it("parsea formato YYYY-MM-DD", () => {
    const d = parseDate("2026-03-15")
    expect(d).not.toBeNull()
    expect(d!.toISOString().slice(0, 10)).toBe("2026-03-15")
  })

  it("parsea formato DD/MM/YYYY", () => {
    const d = parseDate("15/03/2026")
    expect(d).not.toBeNull()
    expect(d!.toISOString().slice(0, 10)).toBe("2026-03-15")
  })

  it("parsea formato D/M/YYYY (sin padding)", () => {
    const d = parseDate("5/3/2026")
    expect(d).not.toBeNull()
    expect(d!.toISOString().slice(0, 10)).toBe("2026-03-05")
  })

  it("retorna null para formato inválido", () => {
    expect(parseDate("")).toBeNull()
    expect(parseDate("not-a-date")).toBeNull()
    expect(parseDate("2026-13-45")).toBeNull()
  })
})

describe("normalizeCurrency", () => {
  it("acepta ARS y USD case-insensitive", () => {
    expect(normalizeCurrency("ARS")).toBe("ARS")
    expect(normalizeCurrency("ars")).toBe("ARS")
    expect(normalizeCurrency("USD")).toBe("USD")
    expect(normalizeCurrency("usd")).toBe("USD")
  })

  it("retorna null para currency no soportada", () => {
    expect(normalizeCurrency("EUR")).toBeNull()
    expect(normalizeCurrency("")).toBeNull()
  })
})

describe("normalizeStatus", () => {
  it("acepta status válidos case-insensitive", () => {
    expect(normalizeStatus("CONFIRMED")).toBe("CONFIRMED")
    expect(normalizeStatus("confirmed")).toBe("CONFIRMED")
    expect(normalizeStatus("RESERVED")).toBe("RESERVED")
    expect(normalizeStatus("CANCELLED")).toBe("CANCELLED")
    expect(normalizeStatus("TRAVELLING")).toBe("TRAVELLING")
    expect(normalizeStatus("TRAVELLED")).toBe("TRAVELLED")
  })

  it("migra estados antiguos", () => {
    expect(normalizeStatus("PRE_RESERVATION")).toBe("RESERVED")
    expect(normalizeStatus("CLOSED")).toBe("TRAVELLED")
  })

  it("retorna null para status inválido", () => {
    expect(normalizeStatus("UNKNOWN")).toBeNull()
    expect(normalizeStatus("")).toBeNull()
  })
})
