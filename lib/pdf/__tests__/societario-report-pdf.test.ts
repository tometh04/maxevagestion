/**
 * @jest-environment node
 *
 * Smoke tests del PDF del Reporte Societario (VIB-101).
 *
 * Este documento se lleva a una reunión de socios: además de generarse bien,
 * tiene que llevar sus supuestos escritos (alícuota, base de las comisiones) y
 * no romperse en los casos feos —pérdida, sin socios, porcentajes mal cargados,
 * dataset truncado—, que son justo los que alguien va a querer imprimir.
 */

import { generateSocietarioReportPdf } from "@/lib/pdf/societario-report-pdf"
import { buildSocietarioReport, type BuildSocietarioReportParams } from "@/lib/reports/societario-report"
import type { ReportCompany } from "@/lib/reports/report-company"
import type { SocietarioReportFilters } from "@/lib/reports/societario-report-data"

const company: ReportCompany = {
  name: "Lozada Viajes",
  address: "Córdoba 1234, Rosario",
  phone: "+54 341 555-5555",
  email: "administracion@lozada.com",
  website: "lozada.com",
  taxId: "30-71234567-9",
  logo: "",
}

const filters: SocietarioReportFilters = {
  dateFrom: "2026-07-01",
  dateTo: "2026-07-31",
  currency: "USD",
  agencyId: null,
  agencyName: null,
  exchangeRate: null,
  ivaRatePct: 10.5,
  netoIvaCriterio: "MARGEN",
}

function venta(over: Record<string, any> = {}) {
  return {
    id: "op-1",
    file_code: "LZ-001",
    destination: "Cancún",
    operation_date: "2026-07-10",
    departure_date: "2026-09-01",
    sale_amount_total: 10000,
    operator_cost: 8000,
    margin_amount: 2000,
    sale_currency: "USD",
    currency: "USD",
    status: "CONFIRMED",
    type: null,
    product_type: null,
    seller_id: "u-1",
    seller_secondary_id: null,
    agency_id: "ag-1",
    ...over,
  } as any
}

function gasto(over: Record<string, any> = {}) {
  return {
    id: "e-1",
    expense_type: "variable",
    description: "Facebook Ads",
    provider_name: null,
    category: "Marketing",
    category_color: null,
    amount: 300,
    currency: "USD",
    movement_date: "2026-07-15",
    notes: null,
    financial_accounts: null,
    users: null,
    is_paid: true,
    ...over,
  } as any
}

const SOCIOS = [
  { id: "p-1", name: "Yamil", percentage: 60, isActive: true },
  { id: "p-2", name: "Santi", percentage: 40, isActive: true },
]

function render(
  over: Partial<BuildSocietarioReportParams> = {},
  filterOver: Partial<SocietarioReportFilters> = {}
): Uint8Array {
  const report = buildSocietarioReport({
    operations: [venta()],
    expenses: [gasto()],
    commissionRecords: [],
    referralCommissions: [],
    partners: SOCIOS,
    currency: "USD",
    ivaRate: 0.105,
    dateFrom: "2026-07-01",
    dateTo: "2026-07-31",
    ...over,
  } as BuildSocietarioReportParams)

  const buffer = generateSocietarioReportPdf({
    report,
    filters: { ...filters, ...filterOver },
    company,
    generatedAt: new Date("2026-08-05T12:00:00Z"),
  })
  return new Uint8Array(buffer)
}

function isPdf(bytes: Uint8Array): boolean {
  return String.fromCharCode(...Array.from(bytes.slice(0, 5))) === "%PDF-"
}

/** Texto plano del PDF, para verificar las aclaraciones obligatorias. */
function textOf(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("latin1")
}

describe("generateSocietarioReportPdf", () => {
  it("genera un PDF con datos normales", () => {
    const bytes = render()
    expect(isPdf(bytes)).toBe(true)
    expect(bytes.length).toBeGreaterThan(1000)
  })

  it("aclara que las comisiones salen de la ganancia bruta", () => {
    // Sin esta nota, quien lee asume que salieron del margen neto de IVA y el
    // reparto no le cierra.
    const bytes = render({
      commissionRecords: [
        {
          id: "c-1",
          operation_id: "op-1",
          seller_id: "u-1",
          agency_id: "ag-1",
          amount: 200,
          amount_paid: 0,
          percentage: 10,
          status: "PENDING",
          date_calculated: "2026-07-11",
          date_paid: null,
          operations: {
            id: "op-1",
            operation_date: "2026-07-10",
            sale_currency: "USD",
            currency: "USD",
          },
        } as any,
      ],
    })
    expect(textOf(bytes)).toContain("ganancia bruta")
  })

  it("deja escrita la alícuota usada", () => {
    // El PDF va a terceros: el mismo período con otra alícuota da otra neta.
    expect(textOf(render({}, { ivaRatePct: 21 }))).toContain("21")
  })

  it("genera un PDF para un período sin movimientos", () => {
    expect(isPdf(render({ operations: [], expenses: [] }))).toBe(true)
  })

  it("soporta un período con pérdida", () => {
    const bytes = render({ expenses: [gasto({ amount: 99999 })] })
    expect(isPdf(bytes)).toBe(true)
  })

  it("soporta una org sin socios cargados", () => {
    expect(isPdf(render({ partners: [] }))).toBe(true)
  })

  it("soporta participaciones que no suman 100", () => {
    const bytes = render({
      partners: [
        { id: "p-1", name: "Yamil", percentage: 60, isActive: true },
        { id: "p-2", name: "Santi", percentage: 32, isActive: true },
      ],
    })
    expect(isPdf(bytes)).toBe(true)
  })

  it("muestra el aviso de truncado", () => {
    const bytes = render({ salesTruncated: true })
    expect(isPdf(bytes)).toBe(true)
    expect(textOf(bytes)).toContain("incompletos")
  })

  it("soporta el bloque de distribuciones registradas", () => {
    const bytes = render({
      allocations: [
        {
          partnerId: "p-1",
          year: 2026,
          month: 7,
          monthKey: "2026-07",
          amount: 500,
          currency: "USD",
          exchangeRate: null,
          status: "ALLOCATED",
        },
      ],
    })
    expect(isPdf(bytes)).toBe(true)
  })

  it("dibuja la línea de resultado financiero con su aclaración", () => {
    // La nota importa tanto como el número: sin ella, quien lee el PDF asume
    // que la comisión de la financiera está dentro de los gastos operativos.
    const bytes = render({
      financialMovements: [
        {
          id: "f-1",
          kind: "INCOME",
          concept: "Ganancia financiera por depósito - REC-1",
          amount: 300,
          currency: "USD",
          movement_date: "2026-07-20",
          accountId: "acc-1",
          receiptNumber: "REC-1",
        },
        {
          id: "f-2",
          kind: "COST",
          concept: "Costo financiero por depósito - REC-1",
          amount: 100,
          currency: "USD",
          movement_date: "2026-07-20",
          accountId: "acc-2",
          receiptNumber: "REC-1",
        },
      ] as any,
    })
    const text = textOf(bytes)
    expect(isPdf(bytes)).toBe(true)
    expect(text).toContain("financiero")
    expect(text).toContain("financiera")
  })

  it("un período con sólo movimientos financieros no cae en el vacío", () => {
    const bytes = render({
      operations: [],
      expenses: [],
      financialMovements: [
        {
          id: "f-1",
          kind: "COST",
          concept: "Costo financiero por depósito - REC-1",
          amount: 100,
          currency: "USD",
          movement_date: "2026-07-20",
          accountId: "acc-2",
          receiptNumber: "REC-1",
        },
      ] as any,
    })
    expect(isPdf(bytes)).toBe(true)
    expect(textOf(bytes)).not.toContain("Sin movimientos en el per")
  })

  it("imprime el desglose de cada concepto", () => {
    const bytes = render({
      operations: [venta({ agency_id: "ag-1" })],
      commissionRecords: [
        {
          id: "c-1",
          operation_id: "op-1",
          seller_id: "u-1",
          agency_id: "ag-1",
          amount: 200,
          amount_paid: 0,
          percentage: 10,
          status: "PENDING",
          date_calculated: "2026-07-11",
          date_paid: null,
          operations: {
            id: "op-1",
            operation_date: "2026-07-10",
            sale_currency: "USD",
            currency: "USD",
          },
        } as any,
      ],
      agencyNames: new Map([["ag-1", "Rosario"]]),
      sellerNames: new Map([["u-1", "Ana Perez"]]),
    })
    const text = textOf(bytes)
    expect(isPdf(bytes)).toBe(true)
    // La oficina y el vendedor tienen que llegar al documento, no solo los
    // totales: es lo que hace auditable el reparto en una reunión de socios.
    expect(text).toContain("Rosario")
    expect(text).toContain("Ana Perez")
    expect(text).toContain("Vendedores")
  })

  it("un desglose largo pagina sin romperse", () => {
    // 40 oficinas fuerzan el salto de página en medio de la cascada.
    const ops = Array.from({ length: 40 }, (_, i) =>
      venta({ id: `op-${i}`, agency_id: `ag-${i}` })
    )
    const names = new Map(ops.map((_, i) => [`ag-${i}`, `Oficina ${i}`]))
    expect(isPdf(render({ operations: ops, agencyNames: names }))).toBe(true)
  })

  it("soporta muchos socios sin romper la paginación", () => {
    const muchos = Array.from({ length: 25 }, (_, i) => ({
      id: `p-${i}`,
      name: `Socio ${i} con un nombre bastante largo para probar el truncado`,
      percentage: 4,
      isActive: true,
    }))
    expect(isPdf(render({ partners: muchos }))).toBe(true)
  })
})
