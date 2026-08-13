/**
 * El bug que cubre este test: filtrar "julio" en Comisiones devolvía las ventas
 * de otros meses porque el filtro corría sobre `date_calculated`, que se
 * reescribe en cada recálculo. Ver `lib/commissions/date-filter.ts`.
 */
import {
  commissionDateColumn,
  lastDayOfMonth,
  normalizeDateBasis,
  resolveCommissionDateFilter,
} from "@/lib/commissions/date-filter"

describe("normalizeDateBasis", () => {
  it("por defecto filtra por la fecha de venta", () => {
    expect(normalizeDateBasis(null)).toBe("sale")
    expect(normalizeDateBasis(undefined)).toBe("sale")
    expect(normalizeDateBasis("")).toBe("sale")
    // Un valor desconocido no debe cambiar el criterio en silencio.
    expect(normalizeDateBasis("calculated")).toBe("sale")
  })

  it("acepta el historial de pagos", () => {
    expect(normalizeDateBasis("paid")).toBe("paid")
  })
})

describe("commissionDateColumn", () => {
  it("nunca filtra por date_calculated: la reescribe cada recálculo", () => {
    expect(commissionDateColumn("sale")).toBe("operations.operation_date")
    expect(commissionDateColumn("paid")).toBe("date_paid")
  })
})

describe("lastDayOfMonth", () => {
  it("incluye el último día de meses de 30 y 31", () => {
    expect(lastDayOfMonth("2026-07")).toBe("2026-07-31")
    expect(lastDayOfMonth("2026-06")).toBe("2026-06-30")
  })

  it("resuelve febrero, con y sin año bisiesto", () => {
    expect(lastDayOfMonth("2026-02")).toBe("2026-02-28")
    expect(lastDayOfMonth("2028-02")).toBe("2028-02-29")
  })

  it("no se corre un día por la zona horaria del servidor", () => {
    const tz = process.env.TZ
    // Offset positivo: es donde `new Date(y, m, 0).toISOString()` devolvía el 30.
    process.env.TZ = "Europe/Madrid"
    try {
      expect(lastDayOfMonth("2026-07")).toBe("2026-07-31")
    } finally {
      process.env.TZ = tz
    }
  })
})

describe("resolveCommissionDateFilter", () => {
  it("arma el mes completo sobre la fecha de venta", () => {
    expect(resolveCommissionDateFilter({ month: "2026-07" })).toEqual({
      column: "operations.operation_date",
      from: "2026-07-01",
      to: "2026-07-31",
    })
  })

  it("el historial de pagos filtra por date_paid", () => {
    expect(resolveCommissionDateFilter({ month: "2026-07", basis: "paid" })).toEqual({
      column: "date_paid",
      from: "2026-07-01",
      to: "2026-07-31",
    })
  })

  it("sin filtros no acota nada", () => {
    expect(resolveCommissionDateFilter({})).toEqual({
      column: "operations.operation_date",
      from: null,
      to: null,
    })
  })

  it("acepta el rango suelto, sin mes", () => {
    expect(
      resolveCommissionDateFilter({ periodStart: "2026-07-10", periodEnd: "2026-08-05" })
    ).toEqual({
      column: "operations.operation_date",
      from: "2026-07-10",
      to: "2026-08-05",
    })
  })

  it("el rango recorta dentro del mes, no lo amplía", () => {
    expect(
      resolveCommissionDateFilter({
        month: "2026-07",
        periodStart: "2026-07-15",
        periodEnd: "2026-07-20",
      })
    ).toEqual({
      column: "operations.operation_date",
      from: "2026-07-15",
      to: "2026-07-20",
    })
  })

  it("un rango más ancho que el mes no saca comisiones de otros meses", () => {
    expect(
      resolveCommissionDateFilter({
        month: "2026-07",
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
      })
    ).toEqual({
      column: "operations.operation_date",
      from: "2026-07-01",
      to: "2026-07-31",
    })
  })

  it("ignora un mes con formato inválido en vez de romper el listado", () => {
    for (const month of ["julio", "2026-13", "2026-7", "2026", ""]) {
      expect(resolveCommissionDateFilter({ month })).toEqual({
        column: "operations.operation_date",
        from: null,
        to: null,
      })
    }
  })
})
