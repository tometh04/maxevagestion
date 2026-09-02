/**
 * Tests del helper de timezone AR para filtros de fecha.
 *
 * Si esto se rompe, los filtros de fecha en Cajas, Libro Mayor, reportes
 * mensuales, IVA, IIBB, ganancias, audit logs, payments y gastos pierden
 * movimientos cargados al final del día local (el bug real reportado por
 * el equipo: "egresos no aparecen al filtrar por fechas").
 */

import { startOfDayAR, endOfDayAR, businessDayOf } from "../date-range"

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

  /**
   * Por qué la ventana NO sirve para una fecha sin hora (VIB-178).
   *
   * Yamil filtró 27/08 → 27/08 y le trajo del 28. Estos dos tests fijan el
   * mecanismo, para que nadie "arregle" el helper y reintroduzca el problema.
   */
  it("una fecha del 28 guardada a medianoche UTC cae DENTRO de la ventana del 27", () => {
    const fila28 = new Date("2026-08-28T00:00:00Z").getTime()
    expect(fila28 >= new Date(startOfDayAR("2026-08-27")).getTime()).toBe(true)
    expect(fila28 <= new Date(endOfDayAR("2026-08-27")).getTime()).toBe(true)
  })

  it("y una del 27 guardada igual queda AFUERA de su propia ventana", () => {
    const fila27 = new Date("2026-08-27T00:00:00Z").getTime()
    expect(fila27 < new Date(startOfDayAR("2026-08-27")).getTime()).toBe(true)
  })
})

describe("businessDayOf — día contra día, sin ventanas (VIB-178)", () => {
  it("una fecha pura es su propio día", () => {
    expect(businessDayOf("2026-08-27")).toBe("2026-08-27")
  })

  it("un timestamp a medianoche UTC es la fecha que alguien eligió, no la de AR", () => {
    // Es el caso del 86% de los movimientos de caja. Convertirlo a hora
    // argentina lo correría al 26, que es exactamente el bug.
    expect(businessDayOf("2026-08-27T00:00:00Z")).toBe("2026-08-27")
    expect(businessDayOf("2026-08-27T00:00:00.000Z")).toBe("2026-08-27")
    expect(businessDayOf("2026-08-27T00:00:00+00:00")).toBe("2026-08-27")
  })

  it("un instante real se lleva al día que era en Argentina", () => {
    // 28/08 01:00 UTC = 27/08 22:00 AR → es del 27.
    expect(businessDayOf("2026-08-28T01:00:00Z")).toBe("2026-08-27")
    // 27/08 15:00 UTC = 27/08 12:00 AR → es del 27.
    expect(businessDayOf("2026-08-27T15:00:00Z")).toBe("2026-08-27")
  })

  it("resuelve el caso que rompía: el 27 entra y el 28 no", () => {
    const del27 = businessDayOf("2026-08-27T00:00:00Z")!
    const del28 = businessDayOf("2026-08-28T00:00:00Z")!
    expect(del27 >= "2026-08-27" && del27 <= "2026-08-27").toBe(true)
    expect(del28 >= "2026-08-27" && del28 <= "2026-08-27").toBe(false)
  })

  it("acepta Date y devuelve null para lo que no es fecha", () => {
    expect(businessDayOf(new Date("2026-08-27T15:00:00Z"))).toBe("2026-08-27")
    expect(businessDayOf(null)).toBeNull()
    expect(businessDayOf("")).toBeNull()
    expect(businessDayOf("cualquier cosa")).toBeNull()
  })
})
