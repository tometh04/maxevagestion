import {
  buildCheckinTargets,
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

describe("buildCheckinTargets", () => {
  const op = {
    destination: "Sídney",
    departure_date: "2026-10-11",
    return_date: "2026-11-11",
    airline_name: "LATAM",
  }

  it("cubre ida y regreso cuando no hay tramos", () => {
    const targets = buildCheckinTargets(op, [])
    expect(targets).toHaveLength(2)
    expect(targets[0]).toMatchObject({ date: "2026-10-11", segmentLabel: "Salida" })
    expect(targets[1]).toMatchObject({ date: "2026-11-11", segmentLabel: "Regreso" })
  })

  it("agrega un target por cada tramo con fecha", () => {
    const targets = buildCheckinTargets(op, [
      { order_index: 0, destination: "Santiago", departure_date: "2026-10-15", reservation_code_air: "LA123" },
      { order_index: 1, destination: "Auckland", departure_date: "2026-10-20", reservation_code_air: null },
    ])

    expect(targets.map((t) => t.date)).toEqual([
      "2026-10-11",
      "2026-11-11",
      "2026-10-15",
      "2026-10-20",
    ])
    expect(targets[2].segmentLabel).toBe("Tramo 1 (LA123) — Salida")
    expect(targets[2].destination).toBe("Santiago")
    // Sin código de reserva no se ensucia la descripción con paréntesis vacíos.
    expect(targets[3].segmentLabel).toBe("Tramo 2 — Salida")
  })

  it("cada tramo usa su propia aerolínea y cae a la de la operación si falta", () => {
    const targets = buildCheckinTargets(op, [
      { order_index: 0, departure_date: "2026-10-15", airline_name: "JETSMART" },
      { order_index: 1, departure_date: "2026-10-20", airline_name: null },
    ])

    expect(targets[2].airlineName).toBe("JETSMART")
    expect(targets[3].airlineName).toBe("LATAM")
  })

  it("no duplica cuando el tramo sale el mismo día que la salida principal", () => {
    const targets = buildCheckinTargets(op, [
      { order_index: 0, departure_date: "2026-10-11", airline_name: "JETSMART" },
    ])

    expect(targets).toHaveLength(2)
    // Gana la alerta general: preserva el comportamiento previo al cambio.
    expect(targets[0].segmentLabel).toBe("Salida")
  })

  it("ignora tramos sin fecha de salida", () => {
    const targets = buildCheckinTargets(op, [
      { order_index: 0, destination: "Hotel sin vuelo", departure_date: null },
    ])
    expect(targets).toHaveLength(2)
  })

  it("ordena los tramos por order_index aunque vengan desordenados", () => {
    const targets = buildCheckinTargets({ ...op, return_date: null }, [
      { order_index: 1, departure_date: "2026-10-20", reservation_code_air: "B" },
      { order_index: 0, departure_date: "2026-10-15", reservation_code_air: "A" },
    ])

    expect(targets[1].segmentLabel).toBe("Tramo 1 (A) — Salida")
    expect(targets[2].segmentLabel).toBe("Tramo 2 (B) — Salida")
  })

  it("tolera una operación sin fechas", () => {
    expect(buildCheckinTargets({ destination: "X" }, [])).toEqual([])
  })
})
