import {
  normalizeAirline,
  resolveCheckinLeadHours,
  leadDaysFromHours,
  type CheckinConfig,
} from "@/lib/alerts/checkin-alerts"

function makeConfig(overrides: Record<string, number> = {}, defaultHours = 48): CheckinConfig {
  return {
    enabled: true,
    defaultHours,
    overrides: new Map(Object.entries(overrides)),
  }
}

describe("normalizeAirline", () => {
  it("lowercases, trims y colapsa espacios", () => {
    expect(normalizeAirline("  Aerolíneas   Argentinas ")).toBe("aerolineas argentinas")
  })

  it("elimina acentos para matchear texto libre", () => {
    expect(normalizeAirline("Aerolíneas Argentinas")).toBe(normalizeAirline("Aerolineas Argentinas"))
  })

  it("maneja null/undefined", () => {
    expect(normalizeAirline(null)).toBe("")
    expect(normalizeAirline(undefined)).toBe("")
  })
})

describe("leadDaysFromHours", () => {
  it("redondea hacia arriba a días (cron diario)", () => {
    expect(leadDaysFromHours(24)).toBe(1)
    expect(leadDaysFromHours(48)).toBe(2)
    expect(leadDaysFromHours(72)).toBe(3)
    expect(leadDaysFromHours(36)).toBe(2)
  })

  it("nunca devuelve menos de 1 día", () => {
    expect(leadDaysFromHours(1)).toBe(1)
    expect(leadDaysFromHours(0)).toBe(1)
  })
})

describe("resolveCheckinLeadHours", () => {
  it("usa el default cuando la aerolínea no tiene override", () => {
    const config = makeConfig({}, 48)
    expect(resolveCheckinLeadHours("LATAM", config)).toBe(48)
  })

  it("usa el override exacto de la aerolínea", () => {
    const config = makeConfig({ latam: 72 }, 48)
    expect(resolveCheckinLeadHours("LATAM", config)).toBe(72)
  })

  it("matchea ignorando mayúsculas y acentos", () => {
    const config = makeConfig({ "aerolineas argentinas": 24 }, 48)
    expect(resolveCheckinLeadHours("Aerolíneas Argentinas", config)).toBe(24)
  })

  it("cae al default si airline es null/vacío", () => {
    const config = makeConfig({ latam: 72 }, 36)
    expect(resolveCheckinLeadHours(null, config)).toBe(36)
    expect(resolveCheckinLeadHours("", config)).toBe(36)
  })
})
