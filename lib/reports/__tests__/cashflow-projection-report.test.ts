/**
 * Tests del agregador del Reporte de Caja y flujo proyectado (VIB-67).
 *
 * Foco en lo que hace confiable un reporte de caja:
 *  - Los tramos son exhaustivos y disjuntos; nada se pierde.
 *  - Un vencimiento de HOY no está vencido (el off-by-one clásico de comparar
 *    fechas en la zona horaria del servidor).
 *  - ARS y USD corren en paralelo y nunca se suman.
 */

import {
  BEYOND_KEY,
  NO_DATE_KEY,
  OVERDUE_KEY,
  bucketOf,
  buildBucketSpecs,
  buildCashflowProjectionReport,
  normalizeTramos,
} from "@/lib/reports/cashflow-projection-report"
import type { ReceivableRow } from "@/lib/cashflow/fetch-receivables"
import type { PayableRow } from "@/lib/cashflow/fetch-payables"

const TODAY = "2026-07-27"

let seq = 0

function receivable(partial: Partial<ReceivableRow> = {}): ReceivableRow {
  return {
    operationId: `op-${++seq}`,
    fileCode: "F-001",
    destination: "Madrid",
    customerName: "Cliente",
    sellerName: "Ana",
    saleAmount: 1000,
    paid: 400,
    debt: 600,
    currency: "ARS",
    dueDate: "2026-08-01",
    dueDateSource: "deadline",
    ...partial,
  }
}

function payable(partial: Partial<PayableRow> = {}): PayableRow {
  return {
    id: `pay-${++seq}`,
    operationId: "op-1",
    fileCode: "F-001",
    operatorName: "Operador",
    amount: 500,
    paidAmount: 0,
    pending: 500,
    currency: "ARS",
    dueDate: "2026-08-01",
    ...partial,
  }
}

function build(
  receivables: ReceivableRow[],
  payables: PayableRow[] = [],
  overrides: Partial<{
    balances: { accounts: any[]; totals: { ARS: number; USD: number } }
    tramos: number[]
    today: string
  }> = {}
) {
  return buildCashflowProjectionReport({
    receivables,
    payables,
    balances: overrides.balances ?? { accounts: [], totals: { ARS: 0, USD: 0 } },
    dueDateSource: { fromPaymentDeadline: 0, fromDepartureDate: 0, missing: 0 },
    today: overrides.today ?? TODAY,
    tramos: overrides.tramos,
  })
}

describe("buildBucketSpecs / bucketOf", () => {
  it("genera tramos exhaustivos y disjuntos", () => {
    const specs = buildBucketSpecs([7, 15, 30])
    expect(specs.map((s) => s.key)).toEqual([
      OVERDUE_KEY,
      "D0_7",
      "D7_15",
      "D15_30",
      BEYOND_KEY,
      NO_DATE_KEY,
    ])

    // Todo día de 0 a 120 cae en exactamente un tramo.
    for (let d = 0; d <= 120; d++) {
      const due = new Date(Date.parse(`${TODAY}T00:00:00Z`) + d * 86400000)
        .toISOString()
        .slice(0, 10)
      const matches = specs.filter((s) => bucketOf(due, TODAY, specs) === s.key)
      expect(matches).toHaveLength(1)
    }
  })

  it("un vencimiento de HOY no está vencido", () => {
    const specs = buildBucketSpecs([7, 15, 30])
    expect(bucketOf(TODAY, TODAY, specs)).toBe("D0_7")
    expect(bucketOf("2026-07-26", TODAY, specs)).toBe(OVERDUE_KEY)
    expect(bucketOf("2026-07-28", TODAY, specs)).toBe("D0_7")
  })

  it("sin fecha va a su propio tramo", () => {
    const specs = buildBucketSpecs([7])
    expect(bucketOf(null, TODAY, specs)).toBe(NO_DATE_KEY)
  })

  it("normaliza los tramos: ordena, deduplica y acota", () => {
    expect(normalizeTramos([30, 7, 15, 7])).toEqual([7, 15, 30])
    expect(normalizeTramos([])).toEqual([7, 15, 30])
    expect(normalizeTramos([0, -5])).toEqual([7, 15, 30])
    expect(normalizeTramos([1, 2, 3, 4, 5, 6, 7, 8])).toHaveLength(6)
  })

  it("acepta tramos elegidos por el usuario", () => {
    const specs = buildBucketSpecs([10, 20])
    expect(specs.map((s) => s.label)).toEqual([
      "Vencidas",
      "0 a 10 días",
      "11 a 20 días",
      "Más de 20 días",
      "Sin fecha",
    ])
  })
})

describe("buildCashflowProjectionReport", () => {
  it("clasifica cobranzas y pagos por tramo sin perder ninguno", () => {
    const report = build(
      [
        receivable({ debt: 100, dueDate: "2026-07-20" }), // vencida
        receivable({ debt: 200, dueDate: "2026-07-30" }), // 0-7
        receivable({ debt: 300, dueDate: "2026-08-20" }), // 15-30
        receivable({ debt: 400, dueDate: null }), // sin fecha
      ],
      [payable({ pending: 50, dueDate: "2026-07-25" })]
    )

    const byKey = Object.fromEntries(report.buckets.map((b) => [b.key, b]))
    expect(byKey[OVERDUE_KEY].receivable.ARS).toBe(100)
    expect(byKey["D0_7"].receivable.ARS).toBe(200)
    expect(byKey["D15_30"].receivable.ARS).toBe(300)
    expect(byKey[NO_DATE_KEY].receivable.ARS).toBe(400)
    expect(byKey[OVERDUE_KEY].payable.ARS).toBe(50)

    // Nada se pierde: el total incluye lo que no tiene fecha.
    expect(report.summary.totalReceivable.ARS).toBe(1000)
    expect(report.summary.noDateReceivable.ARS).toBe(400)
  })

  it("una vencida sigue siendo vencida aunque el status de la base diga otra cosa", () => {
    // El agregador nunca mira `status`: decide por fecha y saldo.
    const report = build([], [payable({ pending: 900, dueDate: "2026-01-15" })])
    expect(report.summary.overduePayable.ARS).toBe(900)
    expect(report.summary.overduePayableCount).toEqual({ ARS: 1, USD: 0 })
  })

  it("los conteos también van por moneda", () => {
    const report = build(
      [
        receivable({ debt: 100, currency: "ARS", dueDate: "2026-07-20" }),
        receivable({ debt: 200, currency: "ARS", dueDate: "2026-07-20" }),
        receivable({ debt: 50, currency: "USD", dueDate: "2026-07-20" }),
      ],
      []
    )

    // El bloque de dólares tiene que decir 1, no 3.
    expect(report.summary.overdueReceivableCount).toEqual({ ARS: 2, USD: 1 })
    const overdue = report.buckets.find((b) => b.key === OVERDUE_KEY)!
    expect(overdue.receivableCount).toEqual({ ARS: 2, USD: 1 })
  })

  it("ARS y USD corren en paralelo y nunca se suman", () => {
    const report = build(
      [
        receivable({ debt: 1000, currency: "ARS", dueDate: "2026-07-30" }),
        receivable({ debt: 50, currency: "USD", dueDate: "2026-07-30" }),
      ],
      [payable({ pending: 200, currency: "USD", dueDate: "2026-07-30" })],
      { balances: { accounts: [], totals: { ARS: 5000, USD: 100 } } }
    )

    const point = report.projection.find((p) => p.bucketKey === "D0_7")!
    expect(point.inflow).toEqual({ ARS: 1000, USD: 50 })
    expect(point.outflow).toEqual({ ARS: 0, USD: 200 })
    expect(point.closing).toEqual({ ARS: 6000, USD: -50 })

    // El neto del horizonte también es un par, no un número.
    expect(report.summary.horizonNet).toEqual({ ARS: 1000, USD: -150 })
  })

  it("la proyección arranca del saldo real y encadena tramo a tramo", () => {
    const report = build(
      [
        receivable({ debt: 300, dueDate: "2026-07-20" }), // vencida
        receivable({ debt: 200, dueDate: "2026-07-30" }), // 0-7
      ],
      [payable({ pending: 100, dueDate: "2026-08-10" })], // a 14 días → tramo 7-15
      { balances: { accounts: [], totals: { ARS: 1000, USD: 0 } } }
    )

    const ars = report.projection.map((p) => [p.bucketKey, p.opening.ARS, p.closing.ARS])
    expect(ars).toEqual([
      [OVERDUE_KEY, 1000, 1300],
      ["D0_7", 1300, 1500],
      ["D7_15", 1500, 1400],
      ["D15_30", 1400, 1400],
      [BEYOND_KEY, 1400, 1400],
    ])
  })

  it("lo que no tiene fecha queda fuera de la proyección", () => {
    const report = build([receivable({ debt: 999, dueDate: null })], [], {
      balances: { accounts: [], totals: { ARS: 100, USD: 0 } },
    })

    expect(report.projection.some((p) => p.bucketKey === NO_DATE_KEY)).toBe(false)
    expect(report.projection.every((p) => p.closing.ARS === 100)).toBe(true)
    expect(report.summary.noDateReceivable.ARS).toBe(999)
  })

  it("detecta el primer tramo con saldo negativo, por moneda", () => {
    const report = build(
      [],
      [
        payable({ pending: 500, dueDate: "2026-07-30" }),
        payable({ pending: 900, dueDate: "2026-08-20", currency: "USD" }),
      ],
      { balances: { accounts: [], totals: { ARS: 100, USD: 1000 } } }
    )

    expect(report.summary.firstShortfall.ARS).toBe("D0_7")
    expect(report.summary.firstShortfall.USD).toBe(null)
  })

  it("firstShortfall es null cuando nunca falta plata", () => {
    const report = build([receivable({ debt: 500, dueDate: "2026-07-30" })], [], {
      balances: { accounts: [], totals: { ARS: 1000, USD: 0 } },
    })
    expect(report.summary.firstShortfall).toEqual({ ARS: null, USD: null })
  })

  it("calcula los días de atraso de cada fila", () => {
    const report = build(
      [receivable({ debt: 100, dueDate: "2026-07-20" })],
      [payable({ pending: 100, dueDate: "2026-08-06" })]
    )

    expect(report.receivables[0].daysOverdue).toBe(7)
    expect(report.payables[0].daysOverdue).toBe(-10)
  })

  it("respeta tramos personalizados", () => {
    const report = build([receivable({ debt: 100, dueDate: "2026-08-15" })], [], {
      tramos: [10, 45],
    })

    expect(report.tramos).toEqual([10, 45])
    expect(report.buckets.map((b) => b.key)).toEqual([
      OVERDUE_KEY,
      "D0_10",
      "D10_45",
      BEYOND_KEY,
      NO_DATE_KEY,
    ])
    expect(report.buckets.find((b) => b.key === "D10_45")!.receivable.ARS).toBe(100)
  })

  it("sin cobranzas ni pagos: todo en cero y la proyección plana", () => {
    const report = build([], [], {
      balances: { accounts: [], totals: { ARS: 2500, USD: 40 } },
    })

    expect(report.summary.totalReceivable).toEqual({ ARS: 0, USD: 0 })
    expect(report.summary.totalPayable).toEqual({ ARS: 0, USD: 0 })
    expect(report.projection.every((p) => p.closing.ARS === 2500 && p.closing.USD === 40)).toBe(
      true
    )
  })
})
