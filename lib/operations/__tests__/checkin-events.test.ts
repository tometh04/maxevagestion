import { buildCheckinEvents, type CheckinOperation } from "../checkin-events"

const today = new Date("2026-07-22T00:00:00")

function op(overrides: Partial<CheckinOperation>): CheckinOperation {
  return {
    id: "op-1",
    file_code: "OP-1",
    destination: "Maceió",
    departure_date: "2026-07-23",
    return_date: "2026-08-02",
    adults: 2,
    children: 0,
    infants: 0,
    status: "CONFIRMED",
    sellers: { name: "Ana" },
    legs: null,
    ...overrides,
  }
}

describe("buildCheckinEvents", () => {
  it("emite salida y regreso de la operación", () => {
    const events = buildCheckinEvents([op({})], today)
    expect(events.map((e) => e.kind)).toEqual(["departure", "return"])
    expect(events[0].key).toBe("op-1-departure")
    expect(events[1].key).toBe("op-1-return")
  })

  it("emite un evento por tramo interno (vuelo del medio del viaje)", () => {
    // Caso VICO OP-...7B3A5F93: Maceió (23/07) → Santiago (30/07, tramo interno).
    const events = buildCheckinEvents(
      [
        op({
          legs: [
            {
              order_index: 1,
              destination: "Santiago de Chile",
              departure_date: "2026-07-30",
              airline_name: "LATAM",
              reservation_code_air: "LA4695920RKUG",
            },
          ],
        }),
      ],
      today,
    )
    const leg = events.find((e) => e.kind === "leg")
    expect(leg).toBeDefined()
    expect(leg!.destination).toBe("Santiago de Chile")
    expect(leg!.dateStr).toBe("2026-07-30")
    expect(leg!.airline).toBe("LATAM")
    expect(leg!.reservationCode).toBe("LA4695920RKUG")
    expect(leg!.key).toBe("op-1-leg-1")
  })

  it("no duplica un tramo que sale el mismo día que la salida principal", () => {
    const events = buildCheckinEvents(
      [
        op({
          legs: [
            {
              order_index: 0,
              destination: "Maceió",
              departure_date: "2026-07-23", // igual a departure_date
              airline_name: "LATAM",
            },
          ],
        }),
      ],
      today,
    )
    expect(events.filter((e) => e.kind === "leg")).toHaveLength(0)
    expect(events).toHaveLength(2) // solo salida + regreso
  })

  it("ignora tramos con fecha pasada", () => {
    const events = buildCheckinEvents(
      [
        op({
          departure_date: "2026-07-25",
          return_date: null,
          legs: [
            { order_index: 0, departure_date: "2026-07-10", airline_name: "GOL" }, // pasado
            { order_index: 1, departure_date: "2026-07-28", airline_name: "GOL" }, // futuro
          ],
        }),
      ],
      today,
    )
    const legDates = events.filter((e) => e.kind === "leg").map((e) => e.dateStr)
    expect(legDates).toEqual(["2026-07-28"])
  })

  it("ordena todos los eventos (salida, tramos, regreso) por fecha ascendente", () => {
    const events = buildCheckinEvents(
      [
        op({
          legs: [
            { order_index: 1, departure_date: "2026-07-30", airline_name: "LATAM" },
          ],
        }),
      ],
      today,
    )
    const dates = events.map((e) => e.dateStr)
    expect(dates).toEqual(["2026-07-23", "2026-07-30", "2026-08-02"])
  })

  it("genera keys únicas para múltiples tramos (no colisionan en React)", () => {
    const events = buildCheckinEvents(
      [
        op({
          legs: [
            { order_index: 1, departure_date: "2026-07-28", airline_name: "GOL" },
            { order_index: 2, departure_date: "2026-07-30", airline_name: "LATAM" },
          ],
        }),
      ],
      today,
    )
    const keys = events.map((e) => e.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
