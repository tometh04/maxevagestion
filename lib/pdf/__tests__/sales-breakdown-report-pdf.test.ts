/**
 * @jest-environment node
 *
 * Smoke tests del PDF del Reporte de Ventas por producto (VIB-66).
 */

import { generateSalesBreakdownReportPdf } from "@/lib/pdf/sales-breakdown-report-pdf"
import { buildSalesBreakdownReport } from "@/lib/reports/sales-breakdown-report"
import type {
  SalesOperationItemRow,
  SalesOperationRow,
} from "@/lib/operations/fetch-sales-operations"
import type { SalesBreakdownReportFilters } from "@/lib/reports/sales-breakdown-report-data"
import type { ReportCompany } from "@/lib/reports/report-company"

const company: ReportCompany = {
  name: "Lozada Viajes",
  address: "Córdoba 1234, Rosario",
  phone: "+54 341 555-5555",
  email: "administracion@lozada.com",
  website: "lozada.com",
  taxId: "30-71234567-9",
  logo: "",
}

const filters: SalesBreakdownReportFilters = {
  dateFrom: "2026-07-01",
  dateTo: "2026-07-31",
  currency: "ARS",
  agencyId: null,
  agencyName: null,
  sellerId: null,
  sellerName: null,
  ownDataOnly: false,
}

let seq = 0

function operation(partial: Partial<SalesOperationRow> = {}): SalesOperationRow {
  return {
    id: `op-${++seq}`,
    file_code: "LZ-001",
    destination: "Madrid",
    operation_date: "2026-07-10",
    departure_date: "2026-09-01",
    sale_amount_total: 1_000_000,
    operator_cost: 700_000,
    margin_amount: 300_000,
    sale_currency: "ARS",
    currency: "ARS",
    status: "CONFIRMED",
    type: "PACKAGE",
    product_type: "PAQUETE",
    seller_id: "seller-a",
    seller_secondary_id: null,
    agency_id: "ag-1",
    ...partial,
  }
}

function item(partial: Partial<SalesOperationItemRow> = {}): SalesOperationItemRow {
  return {
    id: `it-${++seq}`,
    operation_id: "op-1",
    product_type: "FLIGHT",
    cost: 100,
    cost_currency: "ARS",
    sale_amount: null,
    ...partial,
  }
}

function render(
  operations: SalesOperationRow[],
  items: SalesOperationItemRow[] = [],
  opts: { dateFrom?: string; dateTo?: string } = {}
): Uint8Array {
  const itemsByOperation = new Map<string, SalesOperationItemRow[]>()
  for (const it of items) {
    const list = itemsByOperation.get(it.operation_id) ?? []
    list.push(it)
    itemsByOperation.set(it.operation_id, list)
  }

  const report = buildSalesBreakdownReport({
    operations,
    itemsByOperation,
    serviceExtras: {},
    includeServices: false,
    sellerNames: new Map([
      ["seller-a", "Ana Pérez"],
      ["seller-b", "Bruno Gómez"],
    ]),
    agencyNames: new Map([
      ["ag-1", "Rosario"],
      ["ag-2", "Puerto Madero"],
    ]),
    currency: "ARS",
    dateFrom: opts.dateFrom ?? filters.dateFrom,
    dateTo: opts.dateTo ?? filters.dateTo,
  })

  const buffer = generateSalesBreakdownReportPdf({
    report,
    filters: { ...filters, dateFrom: report.dateFrom, dateTo: report.dateTo },
    company,
    generatedAt: new Date("2026-07-27T12:00:00Z"),
  })
  return new Uint8Array(buffer)
}

function isPdf(bytes: Uint8Array): boolean {
  return String.fromCharCode(...Array.from(bytes.slice(0, 5))) === "%PDF-"
}

describe("generateSalesBreakdownReportPdf", () => {
  it("genera un PDF con datos normales", () => {
    const bytes = render(
      [
        operation({ id: "o1" }),
        operation({ id: "o2", seller_id: "seller-b", agency_id: "ag-2" }),
      ],
      [
        item({ operation_id: "o1", product_type: "FLIGHT", sale_amount: 600_000 }),
        item({ operation_id: "o1", product_type: "HOTEL", sale_amount: 400_000 }),
        item({ operation_id: "o2", product_type: "CRUISE", sale_amount: 1_000_000 }),
      ]
    )
    expect(isPdf(bytes)).toBe(true)
    expect(bytes.length).toBeGreaterThan(1000)
  })

  it("genera un PDF para un período sin ventas", () => {
    expect(isPdf(render([]))).toBe(true)
  })

  it("soporta un solo producto (sector de 360°)", () => {
    expect(isPdf(render([operation({ id: "o1" })]))).toBe(true)
  })

  it("no rompe cuando hay productos sin margen por costo en otra moneda", () => {
    const bytes = render(
      [operation({ id: "o1" })],
      [
        item({
          operation_id: "o1",
          product_type: "FLIGHT",
          sale_amount: 1,
          cost: 5000,
          cost_currency: "USD",
        }),
      ]
    )
    expect(isPdf(bytes)).toBe(true)
  })

  it("pagina un detalle largo sin romperse", () => {
    const ops = Array.from({ length: 260 }, (_, i) =>
      operation({
        id: `op-${i}`,
        file_code: `LZ-2026-${2000 + i}`,
        sale_amount_total: 500_000 + i * 137,
        seller_id: i % 2 === 0 ? "seller-a" : "seller-b",
        operation_date: `2026-07-${String((i % 28) + 1).padStart(2, "0")}`,
      })
    )
    const items = ops.flatMap((op, i) => [
      item({ operation_id: op.id, id: `a-${i}`, product_type: "FLIGHT", sale_amount: 3 }),
      item({ operation_id: op.id, id: `b-${i}`, product_type: "HOTEL", sale_amount: 2 }),
    ])
    const bytes = render(ops, items)
    expect(isPdf(bytes)).toBe(true)
    expect(bytes.length).toBeGreaterThan(10000)
  })

  it("no rompe con muchos tipos de producto y nombres largos", () => {
    const ops = Array.from({ length: 15 }, (_, i) => operation({ id: `op-${i}` }))
    const items = ops.map((op, i) =>
      item({
        operation_id: op.id,
        id: `x-${i}`,
        product_type: `Producto personalizado numero ${i} con nombre larguisimo`,
        sale_amount: 1,
      })
    )
    expect(isPdf(render(ops, items))).toBe(true)
  })
})
