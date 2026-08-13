/**
 * Tests del agregador del Reporte de Referidores (VIB-122).
 *
 * Foco en los invariantes que hacen confiable el número que se presenta:
 *  - ARS y USD nunca se suman.
 *  - El mes lo define la fecha de venta, no la de cálculo.
 *  - Pagadas y por pagar se separan; el total de la agencia sale de byPartner.
 *  - Hay una comisión por operación: operationsCount == count.
 */

import { buildReferralsReport } from "@/lib/reports/referrals-report"
import type { ReferralCommissionRecordRow } from "@/lib/referrals/fetch-referral-commission-records"

let seq = 0

function record(
  partial: Partial<Omit<ReferralCommissionRecordRow, "operations">> & {
    amount: number
    operations?: Partial<NonNullable<ReferralCommissionRecordRow["operations"]>>
  }
): ReferralCommissionRecordRow {
  const { operations, ...rest } = partial
  const id = `rc-${++seq}`
  return {
    id,
    operation_id: operations?.id ?? `op-${id}`,
    referral_partner_id: "partner-a",
    customer_id: "cust-1",
    agency_id: "ag-1",
    currency: "ARS",
    amount_paid: null,
    base_amount: 2000,
    basis: "MARGIN",
    percentage: 10,
    status: "PENDING",
    date_calculated: "2026-07-20",
    date_paid: null,
    settlement_id: null,
    referral_partners: { name: "Socio A" },
    customers: { first_name: "Juan", last_name: "Pérez" },
    ...rest,
    operations: {
      id: operations?.id ?? `op-${id}`,
      file_code: "F-001",
      destination: "Madrid",
      operation_date: "2026-07-10",
      departure_date: "2026-09-01",
      sale_amount_total: 10000,
      margin_amount: 2000,
      sale_currency: "ARS",
      currency: "ARS",
      status: "CONFIRMED",
      agency_id: "ag-1",
      ...operations,
    },
  }
}

const partnerNames = new Map([
  ["partner-a", "Socio A"],
  ["partner-b", "Socio B"],
])
const agencyNames = new Map([
  ["ag-1", "Rosario"],
  ["ag-2", "Madero"],
])

function build(
  records: ReferralCommissionRecordRow[],
  overrides: Partial<{ currency: string; dateFrom: string; dateTo: string }> = {}
) {
  return buildReferralsReport({
    records,
    partnerNames,
    agencyNames,
    currency: overrides.currency ?? "ARS",
    dateFrom: overrides.dateFrom ?? "2026-07-01",
    dateTo: overrides.dateTo ?? "2026-07-31",
  })
}

describe("buildReferralsReport", () => {
  it("no mezcla monedas: agrega la pedida e informa la otra", () => {
    const report = build([
      record({ amount: 1000 }),
      record({ amount: 500 }),
      record({ amount: 300, currency: "USD", operations: { sale_currency: "USD", currency: "USD" } }),
    ])

    expect(report.summary.total).toBe(1500)
    expect(report.summary.count).toBe(2)
    expect(report.summary.otherCurrency).toEqual({ currency: "USD", total: 300, count: 1 })
  })

  it("separa pagadas de por pagar y arma byStatus", () => {
    const report = build([
      record({ amount: 1000, status: "PENDING" }),
      record({ amount: 400, status: "PAID", date_paid: "2026-07-25" }),
    ])

    expect(report.summary.pending).toBe(1000)
    expect(report.summary.paid).toBe(400)
    expect(report.byStatus.find((s) => s.status === "PENDING")?.total).toBe(1000)
    expect(report.byStatus.find((s) => s.status === "PAID")?.total).toBe(400)
  })

  it("agrupa por referidor y calcula la participación", () => {
    const report = build([
      record({ amount: 800, referral_partner_id: "partner-a" }),
      record({ amount: 200, referral_partner_id: "partner-b" }),
    ])

    expect(report.byPartner).toHaveLength(2)
    const a = report.byPartner.find((p) => p.partnerId === "partner-a")!
    expect(a.total).toBe(800)
    expect(a.share).toBe(80)
    expect(a.partnerName).toBe("Socio A")
  })

  it("imputa el mes por la fecha de venta, no por date_calculated", () => {
    const report = build(
      [
        record({
          amount: 500,
          date_calculated: "2026-08-01",
          operations: { operation_date: "2026-07-05" },
        }),
      ],
      { dateFrom: "2026-07-01", dateTo: "2026-07-31" }
    )

    const jul = report.byMonth.find((m) => m.key === "2026-07")
    expect(jul?.total).toBe(500)
  })

  it("una comisión por operación: operationsCount == count", () => {
    const report = build([
      record({ amount: 100, operations: { id: "op-1" } }),
      record({ amount: 200, operations: { id: "op-2" } }),
    ])
    expect(report.summary.count).toBe(2)
    expect(report.summary.operationsCount).toBe(2)
  })

  it("marca las pagadas sin liquidación (settlement_id null)", () => {
    const report = build([
      record({ amount: 100, status: "PAID", settlement_id: null }),
      record({ amount: 200, status: "PAID", settlement_id: "settle-1" }),
    ])
    const withoutSettlement = report.detail.filter((d) => d.paidWithoutSettlement)
    expect(withoutSettlement).toHaveLength(1)
    expect(withoutSettlement[0].amount).toBe(100)
  })

  it("desglosa por agencia usando la agencia de la operación", () => {
    const report = build([
      record({ amount: 600, operations: { agency_id: "ag-1" } }),
      record({ amount: 400, operations: { agency_id: "ag-2" } }),
    ])
    expect(report.byAgency.find((a) => a.agencyId === "ag-1")?.total).toBe(600)
    expect(report.byAgency.find((a) => a.agencyId === "ag-2")?.total).toBe(400)
  })
})
