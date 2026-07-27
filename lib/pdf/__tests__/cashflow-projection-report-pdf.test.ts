/**
 * @jest-environment node
 *
 * Smoke tests del PDF del Reporte de Caja (VIB-67).
 */

import { generateCashflowProjectionReportPdf } from "@/lib/pdf/cashflow-projection-report-pdf"
import { buildCashflowProjectionReport } from "@/lib/reports/cashflow-projection-report"
import type { ReceivableRow } from "@/lib/cashflow/fetch-receivables"
import type { PayableRow } from "@/lib/cashflow/fetch-payables"
import type { AccountBalanceRow } from "@/lib/cashflow/fetch-account-balances"
import type { ReportCompany } from "@/lib/reports/report-company"

const TODAY = "2026-07-27"

const company: ReportCompany = {
  name: "Lozada Viajes",
  address: "Córdoba 1234, Rosario",
  phone: "+54 341 555-5555",
  email: "administracion@lozada.com",
  website: "lozada.com",
  taxId: "30-71234567-9",
  logo: "",
}

let seq = 0

function receivable(partial: Partial<ReceivableRow> = {}): ReceivableRow {
  return {
    operationId: `op-${++seq}`,
    fileCode: "LZ-2026-001",
    destination: "Madrid",
    customerName: "Juan Pérez",
    sellerName: "Ana",
    saleAmount: 1_000_000,
    paid: 400_000,
    debt: 600_000,
    currency: "ARS",
    dueDate: "2026-08-05",
    dueDateSource: "deadline",
    ...partial,
  }
}

function payable(partial: Partial<PayableRow> = {}): PayableRow {
  return {
    id: `pay-${++seq}`,
    operationId: "op-1",
    fileCode: "LZ-2026-001",
    operatorName: "Operador Mayorista",
    amount: 500_000,
    paidAmount: 0,
    pending: 500_000,
    currency: "ARS",
    dueDate: "2026-08-05",
    ...partial,
  }
}

const accounts: AccountBalanceRow[] = [
  { id: "a1", name: "Caja Rosario", currency: "ARS", agencyName: "Rosario", balance: 2_500_000 },
  { id: "a2", name: "Banco Galicia", currency: "ARS", agencyName: "Rosario", balance: 8_000_000 },
  { id: "a3", name: "Caja USD", currency: "USD", agencyName: "Madero", balance: 12_000 },
]

function render(
  receivables: ReceivableRow[],
  payables: PayableRow[] = [],
  opts: { totals?: { ARS: number; USD: number }; tramos?: number[] } = {}
): Uint8Array {
  const report = buildCashflowProjectionReport({
    receivables,
    payables,
    balances: {
      accounts,
      totals: opts.totals ?? { ARS: 10_500_000, USD: 12_000 },
    },
    dueDateSource: { fromPaymentDeadline: 12, fromDepartureDate: 30, missing: 3 },
    today: TODAY,
    tramos: opts.tramos,
  })

  const buffer = generateCashflowProjectionReportPdf({
    report,
    filters: {
      agencyId: null,
      agencyName: null,
      tramos: report.tramos,
      ownDataOnly: false,
    },
    company,
    generatedAt: new Date("2026-07-27T12:00:00Z"),
  })
  return new Uint8Array(buffer)
}

function isPdf(bytes: Uint8Array): boolean {
  return String.fromCharCode(...Array.from(bytes.slice(0, 5))) === "%PDF-"
}

describe("generateCashflowProjectionReportPdf", () => {
  it("genera un PDF con datos normales en las dos monedas", () => {
    const bytes = render(
      [
        receivable({ debt: 600_000, dueDate: "2026-07-10" }),
        receivable({ debt: 1_200_000, dueDate: "2026-08-02" }),
        receivable({ debt: 4_500, currency: "USD", dueDate: "2026-08-20" }),
        receivable({ debt: 900_000, dueDate: null }),
      ],
      [
        payable({ pending: 350_000, dueDate: "2026-07-15" }),
        payable({ pending: 2_000, currency: "USD", dueDate: "2026-08-12" }),
      ]
    )
    expect(isPdf(bytes)).toBe(true)
    expect(bytes.length).toBeGreaterThan(1000)
  })

  it("genera un PDF cuando no hay nada por cobrar ni por pagar", () => {
    const bytes = render([], [], { totals: { ARS: 0, USD: 0 } })
    expect(isPdf(bytes)).toBe(true)
  })

  it("resalta el tramo con saldo negativo", () => {
    const bytes = render([], [payable({ pending: 50_000_000, dueDate: "2026-07-30" })], {
      totals: { ARS: 100_000, USD: 0 },
    })
    expect(isPdf(bytes)).toBe(true)
  })

  it("soporta tramos personalizados", () => {
    const bytes = render([receivable({ debt: 100_000, dueDate: "2026-09-01" })], [], {
      tramos: [3, 10, 60, 120],
    })
    expect(isPdf(bytes)).toBe(true)
  })

  it("pagina muchas vencidas sin romperse", () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      receivable({
        operationId: `op-${i}`,
        fileCode: `LZ-2026-${4000 + i}`,
        customerName: `Cliente con nombre largo número ${i}`,
        debt: 100_000 + i * 37,
        dueDate: `2026-0${(i % 6) + 1}-1${i % 9}`,
      })
    )
    const bytes = render(many)
    expect(isPdf(bytes)).toBe(true)
    expect(bytes.length).toBeGreaterThan(5000)
  })

  it("solo en USD: no dibuja el bloque de pesos", () => {
    const bytes = render(
      [receivable({ debt: 5_000, currency: "USD", dueDate: "2026-08-01" })],
      [],
      { totals: { ARS: 0, USD: 9_000 } }
    )
    expect(isPdf(bytes)).toBe(true)
  })
})
