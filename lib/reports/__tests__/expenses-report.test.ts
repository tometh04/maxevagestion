/**
 * Tests del agregador del Reporte de Gastos (VIB-64).
 *
 * Foco en los invariantes que hacen presentable el PDF:
 *  - Todos los gastos entran al total, convertidos a la moneda del reporte.
 *  - Un gasto sin tipo de cambio se reporta, no se descarta en silencio.
 *  - Los porcentajes se calculan sobre el total completo del período.
 *  - Las fechas se bucketean en hora Argentina, no en UTC.
 *  - Los períodos sin gasto aparecen en la evolución (no se saltean).
 */

import { buildExpensesReport, toArgentinaDateKey } from "@/lib/reports/expenses-report"
import type { ExpenseRow } from "@/lib/expenses/fetch-expenses"

let seq = 0

// Ojo: los defaults se aplican con spread, no con `??`, para que un `null`
// explícito (categoría vacía, gasto sin cuenta) llegue tal cual al agregador.
function expense(partial: Partial<ExpenseRow> & { amount: number }): ExpenseRow {
  return {
    id: `exp-${++seq}`,
    expense_type: "variable",
    description: "Gasto",
    provider_name: null,
    category: "Oficina",
    category_color: null,
    currency: "ARS",
    movement_date: "2026-07-10T15:00:00Z",
    notes: null,
    financial_accounts: { id: "acc-1", name: "Caja Rosario", currency: "ARS" },
    users: { id: "u1", name: "Ana" },
    is_paid: true,
    ...partial,
  }
}

describe("buildExpensesReport", () => {
  it("junta las dos monedas en el total, convirtiendo a la moneda pedida", () => {
    // El bug que motivó el cambio: elegías una moneda y los gastos de la otra
    // desaparecían del reporte. El cliente lo vivía como "los pagos de la
    // tarjeta no impactaron", cuando estaban en la otra vista.
    const report = buildExpensesReport({
      expenses: [
        expense({ amount: 100000, currency: "ARS" }),
        expense({ amount: 50000, currency: "ARS" }),
        expense({ amount: 300, currency: "USD" }),
      ],
      currency: "ARS",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      getRate: () => 1500,
    })

    expect(report.summary.total).toBe(600000) // 150.000 + 300 × 1500
    expect(report.summary.count).toBe(3)
    expect(report.summary.converted).toEqual({ count: 1, total: 450000 })
    expect(report.summary.missingRate).toEqual([])
    expect(report.detail).toHaveLength(3)
  })

  it("convierte en el otro sentido cuando el reporte se pide en dólares", () => {
    const report = buildExpensesReport({
      expenses: [
        expense({ amount: 150000, currency: "ARS" }),
        expense({ amount: 200, currency: "USD" }),
      ],
      currency: "USD",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      getRate: () => 1500,
    })

    expect(report.summary.total).toBe(300) // 100 + 200
    expect(report.summary.count).toBe(2)
  })

  it("usa el tipo de cambio de la fecha de CADA gasto, no uno solo del período", () => {
    // El cliente lo dijo explícitamente: "el TC va cambiando". Convertir todo
    // con una sola tasa daría un total que no es el costo real.
    const rates: Record<string, number> = {
      "2026-07-05": 1000,
      "2026-07-25": 2000,
    }
    const report = buildExpensesReport({
      expenses: [
        expense({ amount: 100, currency: "USD", movement_date: "2026-07-05T15:00:00Z" }),
        expense({ amount: 100, currency: "USD", movement_date: "2026-07-25T15:00:00Z" }),
      ],
      currency: "ARS",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      getRate: (d) => rates[String(d).slice(0, 10)] ?? null,
    })

    expect(report.summary.total).toBe(300000) // 100.000 + 200.000
  })

  it("un gasto sin tipo de cambio queda fuera del total pero se reporta", () => {
    // Este es el invariante que importa: el arreglo nació de gastos que
    // desaparecían sin avisar. Excluirlos en silencio sería el mismo error.
    const report = buildExpensesReport({
      expenses: [
        expense({ amount: 100000, currency: "ARS" }),
        expense({ amount: 300, currency: "USD" }),
      ],
      currency: "ARS",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      getRate: () => null,
    })

    expect(report.summary.total).toBe(100000)
    expect(report.summary.count).toBe(1)
    expect(report.summary.missingRate).toEqual([{ currency: "USD", count: 1, total: 300 }])
  })

  it("sin función de tipo de cambio no inventa números", () => {
    const report = buildExpensesReport({
      expenses: [expense({ amount: 300, currency: "USD" })],
      currency: "ARS",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
    })

    expect(report.summary.total).toBe(0)
    expect(report.summary.missingRate).toEqual([{ currency: "USD", count: 1, total: 300 }])
  })

  it("el detalle conserva el importe original para poder rastrear el comprobante", () => {
    const report = buildExpensesReport({
      expenses: [expense({ amount: 300, currency: "USD" })],
      currency: "ARS",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      getRate: () => 1500,
    })

    expect(report.detail[0]).toMatchObject({
      amount: 450000,
      originalAmount: 300,
      originalCurrency: "USD",
      exchangeRate: 1500,
    })
  })

  it("un gasto en la misma moneda no lleva tipo de cambio", () => {
    const report = buildExpensesReport({
      expenses: [expense({ amount: 5000, currency: "ARS" })],
      currency: "ARS",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      getRate: () => 1500,
    })

    expect(report.detail[0].exchangeRate).toBeNull()
    expect(report.summary.converted).toBeNull()
  })

  it("una tasa inválida se trata como faltante, no como cero", () => {
    const report = buildExpensesReport({
      expenses: [expense({ amount: 300, currency: "USD" })],
      currency: "ARS",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      getRate: () => 0,
    })

    expect(report.summary.total).toBe(0)
    expect(report.summary.missingRate[0].count).toBe(1)
  })

  it("calcula % por categoría sobre el total del período y ordena de mayor a menor", () => {
    const report = buildExpensesReport({
      expenses: [
        expense({ amount: 750, category: "Sueldos" }),
        expense({ amount: 150, category: "Alquiler" }),
        expense({ amount: 100, category: "Servicios" }),
      ],
      currency: "ARS",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
    })

    expect(report.byCategory.map((c) => c.category)).toEqual([
      "Sueldos",
      "Alquiler",
      "Servicios",
    ])
    expect(report.byCategory.map((c) => c.share)).toEqual([75, 15, 10])
    expect(report.byCategory.reduce((acc, c) => acc + c.total, 0)).toBe(report.summary.total)
  })

  it("desglosa fijos vs variables con su participación", () => {
    const report = buildExpensesReport({
      expenses: [
        expense({ amount: 800, expense_type: "recurring" }),
        expense({ amount: 200, expense_type: "variable" }),
      ],
      currency: "ARS",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
    })

    const recurring = report.byType.find((t) => t.type === "recurring")!
    const variable = report.byType.find((t) => t.type === "variable")!
    expect(recurring.total).toBe(800)
    expect(recurring.share).toBe(80)
    expect(variable.total).toBe(200)
    expect(variable.share).toBe(20)
  })

  it("usa el color propio de la categoría cuando es HEX y la paleta cuando no", () => {
    const report = buildExpensesReport({
      expenses: [
        expense({ amount: 500, category: "Sueldos", category_color: "#123456" }),
        expense({ amount: 100, category: "Varios", category_color: "rgb(1,2,3)" }),
      ],
      currency: "ARS",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
    })

    expect(report.byCategory[0].color).toBe("#123456")
    expect(report.byCategory[1].color).toMatch(/^#[0-9A-F]{6}$/i)
  })

  it("bucketea por día en rangos cortos e incluye los días sin gasto", () => {
    const report = buildExpensesReport({
      expenses: [
        expense({ amount: 100, movement_date: "2026-07-01T14:00:00Z" }),
        expense({ amount: 200, movement_date: "2026-07-03T14:00:00Z" }),
      ],
      currency: "ARS",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-03",
    })

    expect(report.bucketMode).toBe("day")
    expect(report.byBucket.map((b) => b.key)).toEqual(["2026-07-01", "2026-07-02", "2026-07-03"])
    expect(report.byBucket.map((b) => b.total)).toEqual([100, 0, 200])
  })

  it("bucketea por mes cuando el rango es largo, sin saltear meses vacíos", () => {
    const report = buildExpensesReport({
      expenses: [
        expense({ amount: 100, movement_date: "2026-01-15T14:00:00Z" }),
        expense({ amount: 300, movement_date: "2026-03-15T14:00:00Z" }),
      ],
      currency: "ARS",
      dateFrom: "2026-01-01",
      dateTo: "2026-03-31",
    })

    expect(report.bucketMode).toBe("month")
    expect(report.byBucket.map((b) => b.key)).toEqual(["2026-01", "2026-02", "2026-03"])
    expect(report.byBucket.map((b) => b.total)).toEqual([100, 0, 300])
  })

  it("atribuye a la fecha local AR un gasto cargado de noche (no al día siguiente UTC)", () => {
    // 2026-07-10 23:30 AR == 2026-07-11 02:30 UTC
    expect(toArgentinaDateKey("2026-07-11T02:30:00Z")).toBe("2026-07-10")

    const report = buildExpensesReport({
      expenses: [expense({ amount: 500, movement_date: "2026-07-11T02:30:00Z" })],
      currency: "ARS",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-15",
    })

    expect(report.detail[0].date).toBe("2026-07-10")
    expect(report.byBucket.find((b) => b.key === "2026-07-10")?.total).toBe(500)
  })

  it("agrupa por cuenta pagadora ordenando por monto", () => {
    const report = buildExpensesReport({
      expenses: [
        expense({
          amount: 100,
          financial_accounts: { id: "a", name: "Caja Rosario", currency: "ARS" },
        }),
        expense({
          amount: 400,
          financial_accounts: { id: "b", name: "Banco Galicia", currency: "ARS" },
        }),
        expense({ amount: 50, financial_accounts: null }),
      ],
      currency: "ARS",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
    })

    expect(report.byAccount).toEqual([
      { account: "Banco Galicia", total: 400, count: 1 },
      { account: "Caja Rosario", total: 100, count: 1 },
      { account: "Sin cuenta", total: 50, count: 1 },
    ])
  })

  it("período sin gastos: totales en cero y sin división por cero", () => {
    const report = buildExpensesReport({
      expenses: [expense({ amount: 300, currency: "USD" })],
      currency: "ARS",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
    })

    expect(report.summary.total).toBe(0)
    expect(report.summary.count).toBe(0)
    expect(report.summary.average).toBe(0)
    expect(report.summary.dailyAverage).toBe(0)
    expect(report.summary.topCategory).toBeNull()
    expect(report.byCategory).toEqual([])
  })

  it("agrupa los gastos sin categoría bajo una etiqueta explícita", () => {
    const report = buildExpensesReport({
      expenses: [
        expense({ amount: 100, category: null }),
        expense({ amount: 200, category: "   " }),
      ],
      currency: "ARS",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
    })

    expect(report.byCategory).toHaveLength(1)
    expect(report.byCategory[0].category).toBe("Sin categoría")
    expect(report.byCategory[0].total).toBe(300)
  })

  it("promedia por día del período y por gasto", () => {
    const report = buildExpensesReport({
      expenses: [
        expense({ amount: 100, movement_date: "2026-07-01T14:00:00Z" }),
        expense({ amount: 200, movement_date: "2026-07-02T14:00:00Z" }),
      ],
      currency: "ARS",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-10",
    })

    expect(report.summary.days).toBe(10)
    expect(report.summary.dailyAverage).toBe(30)
    expect(report.summary.average).toBe(150)
  })
})
