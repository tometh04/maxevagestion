/**
 * @jest-environment node
 */
import {
  addMonthsClampedUtc,
  computePeriodExtension,
  daysOverdue,
  MAX_EXTENSION_MONTHS,
} from "./period-extension"

describe("addMonthsClampedUtc", () => {
  it("suma meses preservando la hora", () => {
    const out = addMonthsClampedUtc(new Date("2026-08-01T12:00:00.000Z"), 1)
    expect(out.toISOString()).toBe("2026-09-01T12:00:00.000Z")
  })

  it("clampea al último día del mes destino (31/01 + 1 = 28/02)", () => {
    const out = addMonthsClampedUtc(new Date("2026-01-31T09:30:00.000Z"), 1)
    expect(out.toISOString()).toBe("2026-02-28T09:30:00.000Z")
  })

  it("respeta febrero bisiesto (31/01/2028 + 1 = 29/02/2028)", () => {
    const out = addMonthsClampedUtc(new Date("2028-01-31T00:00:00.000Z"), 1)
    expect(out.toISOString()).toBe("2028-02-29T00:00:00.000Z")
  })

  it("cruza el año", () => {
    const out = addMonthsClampedUtc(new Date("2026-12-15T00:00:00.000Z"), 2)
    expect(out.toISOString()).toBe("2027-02-15T00:00:00.000Z")
  })
})

describe("computePeriodExtension", () => {
  const now = new Date("2026-08-06T15:00:00.000Z")

  it("ancla el período nuevo en el vencimiento anterior, no en hoy (caso VICO)", () => {
    const out = computePeriodExtension({
      currentPeriodEndsAt: "2026-08-01T12:00:00+00:00",
      months: 1,
      now,
    })
    expect(out.basedOn).toBe("current_period")
    expect(out.coversFrom).toBe("2026-08-01")
    expect(out.coversTo).toBe("2026-09-01")
    expect(out.periodEndsAt).toBe("2026-09-01T12:00:00.000Z")
    expect(out.stillOverdue).toBe(false)
  })

  it("no regala los días de atraso: dos pagos seguidos son contiguos", () => {
    const first = computePeriodExtension({
      currentPeriodEndsAt: "2026-08-01T12:00:00Z",
      months: 1,
      now,
    })
    const second = computePeriodExtension({
      currentPeriodEndsAt: first.periodEndsAt,
      months: 1,
      now,
    })
    expect(second.coversFrom).toBe(first.coversTo)
    expect(second.periodEndsAt).toBe("2026-10-01T12:00:00.000Z")
  })

  it("se ancla en now cuando la org no tiene período", () => {
    const out = computePeriodExtension({ currentPeriodEndsAt: null, months: 1, now })
    expect(out.basedOn).toBe("now")
    expect(out.coversFrom).toBe("2026-08-06")
    expect(out.periodEndsAt).toBe("2026-09-06T15:00:00.000Z")
  })

  it("se ancla en now si la fecha guardada es inválida", () => {
    const out = computePeriodExtension({ currentPeriodEndsAt: "no-es-fecha", months: 1, now })
    expect(out.basedOn).toBe("now")
  })

  it("marca stillOverdue cuando un mes no alcanza para ponerse al día", () => {
    const out = computePeriodExtension({
      currentPeriodEndsAt: "2026-02-01T12:00:00Z",
      months: 1,
      now,
    })
    expect(out.periodEndsAt).toBe("2026-03-01T12:00:00.000Z")
    expect(out.stillOverdue).toBe(true)
  })

  it("soporta varios meses de una", () => {
    const out = computePeriodExtension({
      currentPeriodEndsAt: "2026-08-01T12:00:00Z",
      months: 3,
      now,
    })
    expect(out.coversTo).toBe("2026-11-01")
  })

  it("rechaza months inválidos", () => {
    for (const months of [0, -1, 1.5, MAX_EXTENSION_MONTHS + 1, NaN]) {
      expect(() =>
        computePeriodExtension({ currentPeriodEndsAt: null, months, now })
      ).toThrow(RangeError)
    }
  })
})

describe("daysOverdue", () => {
  const now = new Date("2026-08-06T15:00:00.000Z")

  it("cuenta días enteros de atraso", () => {
    expect(daysOverdue("2026-08-01T12:00:00Z", now)).toBe(5)
  })

  it("es 0 si está al día o no hay período", () => {
    expect(daysOverdue("2026-09-01T12:00:00Z", now)).toBe(0)
    expect(daysOverdue(null, now)).toBe(0)
    expect(daysOverdue("basura", now)).toBe(0)
  })
})
