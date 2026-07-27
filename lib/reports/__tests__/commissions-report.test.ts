/**
 * Tests del agregador del Reporte de Comisiones (VIB-65).
 *
 * Foco en los invariantes que hacen confiable el número que se presenta:
 *  - ARS y USD nunca se suman.
 *  - Una operación compartida no infla la venta base del período, pero sí cuenta
 *    entera para cada uno de los dos vendedores.
 *  - El mes lo define la fecha de venta, no la de cálculo.
 */

import { buildCommissionsReport } from "@/lib/reports/commissions-report"
import type { CommissionRecordRow } from "@/lib/commissions/fetch-commission-records"

let seq = 0

function record(
  partial: Partial<Omit<CommissionRecordRow, "operations">> & {
    amount: number
    operations?: Partial<NonNullable<CommissionRecordRow["operations"]>>
  }
): CommissionRecordRow {
  const { operations, ...rest } = partial
  const id = `cr-${++seq}`
  return {
    id,
    operation_id: operations?.id ?? "op-1",
    seller_id: "seller-a",
    agency_id: "ag-1",
    amount_paid: null,
    percentage: 10,
    status: "PENDING",
    date_calculated: "2026-07-20",
    date_paid: null,
    ...rest,
    operations: {
      id: "op-1",
      file_code: "F-001",
      destination: "Madrid",
      operation_date: "2026-07-10",
      departure_date: "2026-09-01",
      sale_amount_total: 10000,
      sale_currency: "ARS",
      currency: "ARS",
      status: "CONFIRMED",
      seller_id: "seller-a",
      seller_secondary_id: null,
      commission_split: null,
      agency_id: "ag-1",
      ...operations,
    },
  }
}

const sellerNames = new Map([
  ["seller-a", "Ana"],
  ["seller-b", "Bruno"],
  ["seller-c", "Carla"],
])
const agencyNames = new Map([
  ["ag-1", "Rosario"],
  ["ag-2", "Madero"],
])

function build(records: CommissionRecordRow[], overrides: Partial<{ currency: string; dateFrom: string; dateTo: string }> = {}) {
  return buildCommissionsReport({
    records,
    sellerNames,
    agencyNames,
    currency: overrides.currency ?? "ARS",
    dateFrom: overrides.dateFrom ?? "2026-07-01",
    dateTo: overrides.dateTo ?? "2026-07-31",
  })
}

describe("buildCommissionsReport", () => {
  it("no mezcla monedas: agrega la pedida e informa la otra", () => {
    const report = build([
      record({ amount: 1000 }),
      record({ amount: 500 }),
      record({
        amount: 80,
        operations: { id: "op-usd", sale_currency: "USD", currency: "USD" },
      }),
    ])

    expect(report.summary.total).toBe(1500)
    expect(report.summary.count).toBe(2)
    expect(report.summary.otherCurrency).toEqual({ currency: "USD", total: 80, count: 1 })
  })

  it("operación compartida: la venta base cuenta una vez en el total y entera por vendedor", () => {
    const shared = {
      id: "op-shared",
      sale_amount_total: 20000,
      seller_id: "seller-a",
      seller_secondary_id: "seller-b",
      commission_split: 50,
    }
    const report = build([
      record({ amount: 1000, seller_id: "seller-a", operations: shared }),
      record({ amount: 1000, seller_id: "seller-b", operations: shared }),
    ])

    // El período vendió 20.000 una sola vez, no 40.000.
    expect(report.summary.baseSale).toBe(20000)
    expect(report.summary.operationsCount).toBe(1)
    expect(report.summary.sharedOperations).toBe(1)
    expect(report.summary.total).toBe(2000)
    // 2000 sobre 20000 = 10% efectivo del período.
    expect(report.summary.effectiveRate).toBe(10)

    // Cada vendedor comisionó sobre la venta entera.
    const ana = report.bySeller.find((s) => s.sellerId === "seller-a")!
    const bruno = report.bySeller.find((s) => s.sellerId === "seller-b")!
    expect(ana.baseSale).toBe(20000)
    expect(bruno.baseSale).toBe(20000)
    expect(ana.effectiveRate).toBe(5)
  })

  it("distingue vendedor primario de secundario", () => {
    const shared = {
      id: "op-shared",
      seller_id: "seller-a",
      seller_secondary_id: "seller-b",
    }
    const report = build([
      record({ amount: 700, seller_id: "seller-a", operations: shared }),
      record({ amount: 300, seller_id: "seller-b", operations: shared }),
    ])

    const ana = report.bySeller.find((s) => s.sellerId === "seller-a")!
    const bruno = report.bySeller.find((s) => s.sellerId === "seller-b")!
    expect(ana.primaryTotal).toBe(700)
    expect(ana.secondaryTotal).toBe(0)
    expect(bruno.secondaryTotal).toBe(300)
    expect(bruno.primaryTotal).toBe(0)

    expect(report.detail.find((d) => d.sellerId === "seller-a")!.role).toBe("primary")
    expect(report.detail.find((d) => d.sellerId === "seller-b")!.role).toBe("secondary")
    expect(report.detail.every((d) => d.shared)).toBe(true)
  })

  it("marca como 'unknown' la comisión de un vendedor que ya no figura en la operación", () => {
    const report = build([
      record({
        amount: 400,
        seller_id: "seller-c",
        operations: { seller_id: "seller-a", seller_secondary_id: null },
      }),
    ])

    expect(report.detail[0].role).toBe("unknown")
    // No se pierde: sigue sumando al total.
    expect(report.summary.total).toBe(400)
  })

  it("el mes lo define la fecha de venta, no la de cálculo", () => {
    const report = build(
      [
        record({
          amount: 100,
          date_calculated: "2026-09-30", // recálculo posterior
          operations: { id: "op-jul", operation_date: "2026-07-15" },
        }),
      ],
      { dateFrom: "2026-07-01", dateTo: "2026-09-30" }
    )

    expect(report.byMonth.find((m) => m.key === "2026-07")!.total).toBe(100)
    expect(report.byMonth.find((m) => m.key === "2026-09")!.total).toBe(0)
    expect(report.detail[0].month).toBe("2026-07")
  })

  it("rellena los meses sin comisiones en cero", () => {
    const report = build(
      [
        record({ amount: 100, operations: { id: "a", operation_date: "2026-01-10" } }),
        record({ amount: 300, operations: { id: "b", operation_date: "2026-03-10" } }),
      ],
      { dateFrom: "2026-01-01", dateTo: "2026-03-31" }
    )

    expect(report.byMonth.map((m) => m.key)).toEqual(["2026-01", "2026-02", "2026-03"])
    expect(report.byMonth.map((m) => m.total)).toEqual([100, 0, 300])
  })

  it("pendiente + pagado === total, y los pagos parciales no cambian el estado", () => {
    const report = build([
      record({ amount: 1000, status: "PAID", amount_paid: 1000, date_paid: "2026-07-25" }),
      record({ amount: 600, status: "PENDING", amount_paid: 200, operations: { id: "op-2" } }),
    ])

    expect(report.summary.paid).toBe(1000)
    expect(report.summary.pending).toBe(600)
    expect(report.summary.paid + report.summary.pending).toBe(report.summary.total)
    expect(report.summary.amountPaid).toBe(1200)
    expect(report.byStatus.find((s) => s.status === "PAID")!.share).toBe(62.5)
  })

  it("agrupa por agencia de la operación", () => {
    const report = build([
      record({ amount: 100, operations: { id: "a", agency_id: "ag-1" } }),
      record({ amount: 900, operations: { id: "b", agency_id: "ag-2" } }),
    ])

    expect(report.byAgency.map((a) => [a.agencyName, a.total])).toEqual([
      ["Madero", 900],
      ["Rosario", 100],
    ])
    expect(report.byAgency[0].share).toBe(90)
  })

  it("arma la matriz vendedor × mes con todos los meses del rango", () => {
    const report = build(
      [
        record({
          amount: 100,
          seller_id: "seller-a",
          operations: { id: "a", operation_date: "2026-01-10" },
        }),
        record({
          amount: 250,
          seller_id: "seller-a",
          operations: { id: "b", operation_date: "2026-02-10" },
        }),
        record({
          amount: 400,
          seller_id: "seller-b",
          operations: { id: "c", operation_date: "2026-02-20" },
        }),
      ],
      { dateFrom: "2026-01-01", dateTo: "2026-02-28" }
    )

    const ana = report.bySellerMonth.find((s) => s.sellerId === "seller-a")!
    expect(ana.cells).toEqual({ "2026-01": 100, "2026-02": 250 })
    expect(ana.total).toBe(350)

    const bruno = report.bySellerMonth.find((s) => s.sellerId === "seller-b")!
    expect(bruno.cells).toEqual({ "2026-01": 0, "2026-02": 400 })
  })

  it("período sin comisiones: cero en todo, sin división por cero", () => {
    const report = build([
      record({ amount: 90, operations: { sale_currency: "USD", currency: "USD" } }),
    ])

    expect(report.summary.total).toBe(0)
    expect(report.summary.effectiveRate).toBe(0)
    expect(report.summary.averagePerSeller).toBe(0)
    expect(report.bySeller).toEqual([])
    expect(report.byStatus.every((s) => s.share === 0)).toBe(true)
  })

  it("el % de participación se calcula sobre el total completo, no sobre el top", () => {
    const report = build([
      record({ amount: 500, seller_id: "seller-a" }),
      record({ amount: 300, seller_id: "seller-b", operations: { id: "op-2" } }),
      record({ amount: 200, seller_id: "seller-c", operations: { id: "op-3" } }),
    ])

    expect(report.bySeller.map((s) => s.share)).toEqual([50, 30, 20])
    expect(report.bySeller.reduce((acc, s) => acc + s.share, 0)).toBe(100)
  })

  it("propaga el conteo de comisiones descartadas por operación cancelada", () => {
    const report = buildCommissionsReport({
      records: [record({ amount: 100 })],
      sellerNames,
      agencyNames,
      currency: "ARS",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      cancelledRecords: 4,
      truncated: true,
    })

    expect(report.summary.cancelledRecords).toBe(4)
    expect(report.summary.truncated).toBe(true)
  })
})
