/**
 * Tests del cálculo de período para objetivos de vendedores.
 *
 * `getObjectivePeriod` define el rango de fechas sobre el que se mide
 * el progreso del seller. Si está mal, todo el sistema de objetivos
 * mide contra el rango equivocado.
 */

import { getObjectivePeriod } from "../objectives-progress"

describe("getObjectivePeriod", () => {
  describe("MONTHLY", () => {
    it("devuelve primer y último día del mes actual (febrero 2026)", () => {
      const now = new Date(2026, 1, 15) // 15 feb 2026
      const { start, end } = getObjectivePeriod("MONTHLY", now)
      expect(start).toBe("2026-02-01")
      expect(end).toBe("2026-02-28")
    })

    it("maneja diciembre correctamente (último día del año)", () => {
      const now = new Date(2026, 11, 20) // 20 dic 2026
      const { start, end } = getObjectivePeriod("MONTHLY", now)
      expect(start).toBe("2026-12-01")
      expect(end).toBe("2026-12-31")
    })

    it("año bisiesto: febrero tiene 29 días", () => {
      const now = new Date(2024, 1, 10) // 10 feb 2024 (bisiesto)
      const { start, end } = getObjectivePeriod("MONTHLY", now)
      expect(start).toBe("2024-02-01")
      expect(end).toBe("2024-02-29")
    })

    it("año NO bisiesto: febrero tiene 28 días", () => {
      const now = new Date(2025, 1, 10)
      const { start, end } = getObjectivePeriod("MONTHLY", now)
      expect(start).toBe("2025-02-01")
      expect(end).toBe("2025-02-28")
    })
  })

  describe("QUARTERLY", () => {
    it("enero cae en Q1 (ene-mar)", () => {
      const now = new Date(2026, 0, 5)
      const { start, end } = getObjectivePeriod("QUARTERLY", now)
      expect(start).toBe("2026-01-01")
      expect(end).toBe("2026-03-31")
    })

    it("abril cae en Q2 (abr-jun)", () => {
      const now = new Date(2026, 3, 15)
      const { start, end } = getObjectivePeriod("QUARTERLY", now)
      expect(start).toBe("2026-04-01")
      expect(end).toBe("2026-06-30")
    })

    it("julio cae en Q3 (jul-sep)", () => {
      const now = new Date(2026, 6, 20)
      const { start, end } = getObjectivePeriod("QUARTERLY", now)
      expect(start).toBe("2026-07-01")
      expect(end).toBe("2026-09-30")
    })

    it("diciembre cae en Q4 (oct-dic)", () => {
      const now = new Date(2026, 11, 31)
      const { start, end } = getObjectivePeriod("QUARTERLY", now)
      expect(start).toBe("2026-10-01")
      expect(end).toBe("2026-12-31")
    })
  })

  describe("ANNUAL", () => {
    it("devuelve 1/1 al 31/12 del año actual", () => {
      const now = new Date(2026, 5, 15)
      const { start, end } = getObjectivePeriod("ANNUAL", now)
      expect(start).toBe("2026-01-01")
      expect(end).toBe("2026-12-31")
    })
  })

  describe("defaults", () => {
    it("tipo desconocido cae a MONTHLY (período del mes actual)", () => {
      const now = new Date(2026, 2, 10)
      const { start, end } = getObjectivePeriod("UNKNOWN_TYPE", now)
      expect(start).toBe("2026-03-01")
      expect(end).toBe("2026-03-31")
    })
  })
})
