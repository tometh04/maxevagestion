/**
 * Tests del helper de timezone AR para filtros de fecha.
 *
 * Si esto se rompe, los filtros de fecha en Cajas, Libro Mayor, reportes
 * mensuales, IVA, IIBB, ganancias, audit logs, payments y gastos pierden
 * movimientos cargados al final del día local (el bug real reportado por
 * el equipo: "egresos no aparecen al filtrar por fechas").
 */

import { startOfDayAR, endOfDayAR } from "../date-range"

describe("startOfDayAR", () => {
  it("formatea YYYY-MM-DD como inicio de día con offset -03:00", () => {
    expect(startOfDayAR("2026-02-13")).toBe("2026-02-13T00:00:00-03:00")
  })

  it("mantiene el día completo sin cambios de zona", () => {
    expect(startOfDayAR("2026-12-31")).toBe("2026-12-31T00:00:00-03:00")
  })

  it("funciona con fechas de año bisiesto", () => {
    expect(startOfDayAR("2024-02-29")).toBe("2024-02-29T00:00:00-03:00")
  })
})

describe("endOfDayAR", () => {
  it("formatea YYYY-MM-DD como fin de día con offset -03:00", () => {
    expect(endOfDayAR("2026-02-13")).toBe("2026-02-13T23:59:59-03:00")
  })

  it("último día del año", () => {
    expect(endOfDayAR("2026-12-31")).toBe("2026-12-31T23:59:59-03:00")
  })
})

describe("comparación como timestamps reales (no strings)", () => {
  // Estos tests verifican que el output SIRVE para comparar con movement_date
  // en Postgres. No hace falta mockear Postgres; basta comprobar que Date(X)
  // devuelve el timestamp UTC correcto.

  it("startOfDayAR del 13/02 equivale a 03:00 UTC del 13/02", () => {
    const d = new Date(startOfDayAR("2026-02-13"))
    expect(d.toISOString()).toBe("2026-02-13T03:00:00.000Z")
  })

  it("endOfDayAR del 13/02 equivale a 02:59:59 UTC del 14/02", () => {
    // 13/02 23:59:59 -03:00 = 14/02 02:59:59 UTC
    const d = new Date(endOfDayAR("2026-02-13"))
    expect(d.toISOString()).toBe("2026-02-14T02:59:59.000Z")
  })

  it("caso del bug real: movimiento creado 23:30 hora AR del 13/02 cae dentro del rango", () => {
    // El equipo reportó: "cargué un egreso a las 23:30 del 13/02 y no aparece
    // cuando filtro hasta el 13/02". En UTC, ese movimiento se guarda como
    // 2026-02-14T02:30:00Z. Debe caer dentro del rango [startOfDay(13), endOfDay(13)].
    const movementUtc = new Date("2026-02-14T02:30:00Z").getTime()
    const rangeStart = new Date(startOfDayAR("2026-02-13")).getTime()
    const rangeEnd = new Date(endOfDayAR("2026-02-13")).getTime()
    expect(movementUtc >= rangeStart).toBe(true)
    expect(movementUtc <= rangeEnd).toBe(true)
  })

  it("movimiento del día siguiente (14/02 01:00 AR) NO cae en rango del 13/02", () => {
    // 14/02 01:00 hora AR = 14/02 04:00 UTC. No debe estar dentro del rango del 13.
    const movementUtc = new Date("2026-02-14T04:00:00Z").getTime()
    const rangeEnd = new Date(endOfDayAR("2026-02-13")).getTime()
    expect(movementUtc > rangeEnd).toBe(true)
  })

  it("movimiento temprano del día (00:30 AR del 13/02) cae en rango del 13/02", () => {
    // 13/02 00:30 hora AR = 13/02 03:30 UTC. Debe caer dentro del rango.
    const movementUtc = new Date("2026-02-13T03:30:00Z").getTime()
    const rangeStart = new Date(startOfDayAR("2026-02-13")).getTime()
    expect(movementUtc >= rangeStart).toBe(true)
  })
})
