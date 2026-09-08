/**
 * @jest-environment node
 *
 * Smoke tests del PDF del Reporte de Comisiones (VIB-65).
 *
 * No validan diseño (eso se mira renderizando), sí que el generador produzca un
 * PDF válido en los casos donde suele romperse: período vacío, un solo vendedor
 * (torta de 360°), matriz que no entra, detalle largo y textos extremos.
 */

import { generateCommissionsReportPdf } from "@/lib/pdf/commissions-report-pdf"
import { buildCommissionsReport } from "@/lib/reports/commissions-report"
import type { CommissionRecordRow } from "@/lib/commissions/fetch-commission-records"
import type { CommissionsReportFilters } from "@/lib/reports/commissions-report-data"
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

const filters: CommissionsReportFilters = {
  dateFrom: "2026-07-01",
  dateTo: "2026-07-31",
  currency: "ARS",
  agencyId: null,
  agencyName: null,
  sellerId: null,
  sellerName: null,
  ownDataOnly: false,
  include: { sale: false, margin: false, referrals: false },
}

let seq = 0

function record(
  partial: Partial<Omit<CommissionRecordRow, "operations">> & {
    amount: number
    operations?: Partial<NonNullable<CommissionRecordRow["operations"]>>
  }
): CommissionRecordRow {
  const { operations, ...rest } = partial
  return {
    id: `cr-${++seq}`,
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
      sale_amount_total: 100000,
      margin_amount: 25000,
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

interface RenderOptions {
  dateFrom?: string
  dateTo?: string
  sellers?: Array<[string, string]>
  referralPartners?: Array<[string, string]>
  include?: { sale?: boolean; margin?: boolean; referrals?: boolean }
  currency?: string
}

function buildReport(records: CommissionRecordRow[], opts: RenderOptions = {}) {
  return buildCommissionsReport({
    records,
    include: opts.include,
    referralPartners: new Map(
      (opts.referralPartners ?? []).map(([operationId, partnerName], i) => [
        operationId,
        { partnerId: `p-${i % 3}`, partnerName, amount: 1500, status: "PENDING" },
      ])
    ),
    sellerNames: new Map(
      opts.sellers ?? [
        ["seller-a", "Ana Pérez"],
        ["seller-b", "Bruno Gómez"],
        ["seller-c", "Carla López"],
      ]
    ),
    agencyNames: new Map([
      ["ag-1", "Rosario"],
      ["ag-2", "Madero"],
    ]),
    currency: opts.currency ?? "ARS",
    dateFrom: opts.dateFrom ?? filters.dateFrom,
    dateTo: opts.dateTo ?? filters.dateTo,
  })
}

function renderReports(
  reports: ReturnType<typeof buildReport>[],
  currency = "ARS"
): Uint8Array {
  const buffer = generateCommissionsReportPdf({
    reports,
    filters: {
      ...filters,
      currency,
      dateFrom: reports[0].dateFrom,
      dateTo: reports[0].dateTo,
    },
    company,
    generatedAt: new Date("2026-07-27T12:00:00Z"),
  })
  return new Uint8Array(buffer)
}

function render(records: CommissionRecordRow[], opts: RenderOptions = {}): Uint8Array {
  return renderReports([buildReport(records, opts)], opts.currency ?? "ARS")
}

function isPdf(bytes: Uint8Array): boolean {
  return String.fromCharCode(...Array.from(bytes.slice(0, 5))) === "%PDF-"
}

describe("generateCommissionsReportPdf", () => {
  it("genera un PDF con datos normales", () => {
    const bytes = render([
      record({ amount: 12000, seller_id: "seller-a" }),
      record({ amount: 8000, seller_id: "seller-b", operations: { id: "op-2" } }),
      record({
        amount: 5000,
        seller_id: "seller-c",
        status: "PAID",
        date_paid: "2026-07-28",
        operations: { id: "op-3", agency_id: "ag-2" },
      }),
    ])
    expect(isPdf(bytes)).toBe(true)
    expect(bytes.length).toBeGreaterThan(1000)
  })

  it("entrega las dos monedas en un solo documento", () => {
    const records = [
      record({ amount: 12000, seller_id: "seller-a" }),
      record({
        amount: 500,
        seller_id: "seller-b",
        operations: { id: "op-usd", currency: "USD", sale_currency: "USD" },
      }),
    ]

    const ars = buildReport(records, { currency: "ARS" })
    const usd = buildReport(records, { currency: "USD" })
    expect(ars.summary.total).toBe(12000)
    expect(usd.summary.total).toBe(500)

    const both = renderReports([ars, usd], "ALL")
    expect(isPdf(both)).toBe(true)
    // El documento con las dos monedas tiene que traer más que el de una sola:
    // si el segundo bloque no se dibujara, pesarían casi igual.
    expect(both.length).toBeGreaterThan(renderReports([ars]).length)
  })

  it("genera un PDF para un período sin comisiones", () => {
    expect(isPdf(render([]))).toBe(true)
  })

  it("soporta un solo vendedor (sector de 360°)", () => {
    expect(isPdf(render([record({ amount: 9000 })]))).toBe(true)
  })

  it("dibuja la matriz vendedor × mes cuando entra", () => {
    const bytes = render(
      [
        record({ amount: 100, operations: { id: "a", operation_date: "2026-01-10" } }),
        record({
          amount: 200,
          seller_id: "seller-b",
          operations: { id: "b", operation_date: "2026-02-10" },
        }),
        record({ amount: 300, operations: { id: "c", operation_date: "2026-03-10" } }),
      ],
      { dateFrom: "2026-01-01", dateTo: "2026-03-31" }
    )
    expect(isPdf(bytes)).toBe(true)
  })

  it("omite la matriz sin romperse cuando el período es muy largo", () => {
    const records = Array.from({ length: 40 }, (_, i) =>
      record({
        amount: 1000 + i,
        seller_id: `seller-${i % 25}`,
        operations: {
          id: `op-${i}`,
          operation_date: `2026-${String((i % 12) + 1).padStart(2, "0")}-10`,
        },
      })
    )
    const bytes = render(records, { dateFrom: "2025-01-01", dateTo: "2026-12-31" })
    expect(isPdf(bytes)).toBe(true)
  })

  it("pagina un detalle largo sin romperse", () => {
    const many = Array.from({ length: 300 }, (_, i) =>
      record({
        amount: 1000 + i,
        seller_id: `seller-${i % 6}`,
        status: i % 3 === 0 ? "PAID" : "PENDING",
        operations: {
          id: `op-${i}`,
          file_code: `FILE-2026-${1000 + i}`,
          operation_date: `2026-07-${String((i % 28) + 1).padStart(2, "0")}`,
        },
      })
    )
    const bytes = render(many)
    expect(isPdf(bytes)).toBe(true)
    expect(bytes.length).toBeGreaterThan(10000)
  })

  it("dibuja la marca de referido sin romper la paginación del detalle", () => {
    const records = Array.from({ length: 60 }, (_, i) =>
      record({
        amount: 1000 + i,
        seller_id: `seller-${i % 3 === 0 ? "a" : "b"}`,
        operations: {
          id: `op-${i}`,
          operation_date: `2026-07-${String((i % 28) + 1).padStart(2, "0")}`,
        },
      })
    )
    const bytes = render(records, {
      // Referido en filas salteadas: obliga a alternar altos de fila al paginar.
      referralPartners: Array.from({ length: 30 }, (_, i) => [
        `op-${i * 2}`,
        "Estudio Contable Díaz y Asociados",
      ]),
    })
    expect(isPdf(bytes)).toBe(true)
    expect(bytes.length).toBeGreaterThan(10000)
  })

  it("dibuja la sección de referidos y la sublínea de venta/ganancia", () => {
    const bytes = render(
      [
        record({ amount: 12000, seller_id: "seller-a" }),
        record({ amount: 8000, seller_id: "seller-b", operations: { id: "op-2" } }),
      ],
      {
        referralPartners: [
          ["op-1", "Estudio Contable Díaz"],
          ["op-2", "Marcela Suárez"],
        ],
        include: { sale: true, margin: true, referrals: true },
      }
    )
    expect(isPdf(bytes)).toBe(true)
    expect(bytes.length).toBeGreaterThan(1000)
  })

  it("no rompe con nombres largos ni con operaciones compartidas", () => {
    const shared = {
      id: "op-shared",
      seller_id: "seller-a",
      seller_secondary_id: "seller-b",
      commission_split: 50,
      file_code: "FILE-CON-UN-CODIGO-LARGUISIMO-2026",
      destination: "Un destino con un nombre absurdamente largo para forzar truncado",
    }
    const bytes = render(
      [
        record({ amount: 123456.78, seller_id: "seller-a", operations: shared }),
        record({ amount: 0.01, seller_id: "seller-b", operations: shared }),
      ],
      {
        sellers: [
          ["seller-a", "Una vendedora con un nombre completo larguísimo que no entra"],
          ["seller-b", "Bruno"],
        ],
      }
    )
    expect(isPdf(bytes)).toBe(true)
  })
})
