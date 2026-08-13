/**
 * @jest-environment node
 *
 * Smoke tests del PDF del Reporte de Gastos (VIB-64).
 *
 * No validan diseño (eso se mira a ojo), sí que el generador produzca un PDF
 * válido en los casos donde suele romperse: período vacío, una sola categoría
 * (torta de 360°), muchísimas filas de detalle y textos largos.
 */

import { createHash } from "crypto"
import { generateExpensesReportPdf } from "@/lib/pdf/expenses-report-pdf"
import { buildExpensesReport } from "@/lib/reports/expenses-report"
import type { ExpenseRow } from "@/lib/expenses/fetch-expenses"
import type {
  ExpensesReportCompany,
  ExpensesReportFilters,
} from "@/lib/reports/expenses-report-data"

const company: ExpensesReportCompany = {
  name: "Lozada Viajes",
  address: "Córdoba 1234, Rosario",
  phone: "+54 341 555-5555",
  email: "hola@lozada.com",
  website: "lozada.com",
  taxId: "30-11111111-9",
  logo: "",
}

const filters: ExpensesReportFilters = {
  dateFrom: "2026-07-01",
  dateTo: "2026-07-31",
  currency: "ARS",
  agencyId: null,
  agencyName: null,
  agencyMode: "office",
  type: null,
  exchangeRate: null,
}

let seq = 0

function expense(partial: Partial<ExpenseRow> & { amount: number }): ExpenseRow {
  return {
    // Determinista a propósito: el snapshot de caracterización compara bytes.
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

function render(expenses: ExpenseRow[]): Uint8Array {
  const report = buildExpensesReport({
    expenses,
    currency: "ARS",
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  })
  const buffer = generateExpensesReportPdf({
    report,
    filters,
    company,
    generatedAt: new Date("2026-07-27T12:00:00Z"),
  })
  return new Uint8Array(buffer)
}

/** Los PDF válidos arrancan con "%PDF-". */
function isPdf(bytes: Uint8Array): boolean {
  return String.fromCharCode(...Array.from(bytes.slice(0, 5))) === "%PDF-"
}

/**
 * Huella estable del documento.
 *
 * jsPDF escribe dos cosas que cambian en cada corrida y no son parte del diseño:
 * el `/ID` del trailer y el `/CreationDate`. Se neutralizan antes de hashear;
 * todo lo demás (texto, coordenadas, colores, paginado) sí entra en la huella.
 */
function pdfFingerprint(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString("latin1")
  const normalized = raw
    .replace(/\/ID\s*\[[^\]]*\]/g, "/ID []")
    .replace(/\/CreationDate\s*\(([^)]*)\)/g, "/CreationDate ()")
  return createHash("sha256").update(normalized, "latin1").digest("hex")
}

describe("generateExpensesReportPdf", () => {
  it("genera un PDF con datos normales", () => {
    const bytes = render([
      expense({ amount: 700000, category: "Sueldos", expense_type: "recurring" }),
      expense({ amount: 250000, category: "Alquiler", expense_type: "recurring" }),
      expense({ amount: 90000, category: "Servicios" }),
      expense({ amount: 12000, category: "Librería", movement_date: "2026-07-22T15:00:00Z" }),
    ])

    expect(isPdf(bytes)).toBe(true)
    expect(bytes.length).toBeGreaterThan(1000)
  })

  it("genera un PDF para un período sin gastos", () => {
    const bytes = render([])
    expect(isPdf(bytes)).toBe(true)
  })

  it("soporta una sola categoría (sector de 360°)", () => {
    const bytes = render([expense({ amount: 1000, category: "Sueldos" })])
    expect(isPdf(bytes)).toBe(true)
  })

  it("pagina un detalle largo sin romperse", () => {
    const many = Array.from({ length: 320 }, (_, i) =>
      expense({
        amount: 1000 + i,
        category: `Categoría ${i % 17}`,
        description: `Gasto número ${i} con una descripción deliberadamente larga para forzar truncado`,
        movement_date: `2026-07-${String((i % 28) + 1).padStart(2, "0")}T15:00:00Z`,
      })
    )
    const bytes = render(many)
    expect(isPdf(bytes)).toBe(true)
    expect(bytes.length).toBeGreaterThan(10000)
  })

  /**
   * Test de caracterización: congela el output byte-a-byte.
   *
   * No valida diseño, valida que el diseño NO CAMBIE. Existe para poder extraer
   * `lib/pdf/report-kit.ts` (compartido con los reportes de comisiones, ventas y
   * caja) sin alterar un PDF que ya está en producción.
   *
   * Si este hash cambia, el refactor cambió el documento: hay que revertir, no
   * re-baselinear. Solo se actualiza cuando se rediseña el PDF a propósito.
   */
  it("mantiene el output byte-a-byte (guarda del refactor del kit)", () => {
    {
      const bytes = render([
        expense({ amount: 700000, category: "Sueldos", expense_type: "recurring" }),
        expense({
          amount: 250000,
          category: "Alquiler",
          expense_type: "recurring",
          category_color: "#123456",
        }),
        expense({ amount: 90000, category: "Servicios", movement_date: "2026-07-14T15:00:00Z" }),
        expense({ amount: 12000, category: "Librería", movement_date: "2026-07-22T15:00:00Z" }),
        expense({ amount: 400, currency: "USD", category: "Software" }),
      ])

      expect(bytes.length).toMatchSnapshot("longitud")
      expect(pdfFingerprint(bytes)).toMatchSnapshot("huella")
    }
  })

  it("no rompe con nombres y montos extremos", () => {
    const bytes = render([
      expense({
        amount: 123456789.99,
        category: "Una categoría con un nombre absurdamente largo que no entra en la columna",
        description: "x".repeat(300),
        financial_accounts: { id: "a", name: "Cuenta con nombre larguísimo", currency: "ARS" },
      }),
      expense({ amount: 0.01, category: "Redondeo" }),
    ])
    expect(isPdf(bytes)).toBe(true)
  })
})
