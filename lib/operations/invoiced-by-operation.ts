/**
 * Estado de facturación por operación, para el LISTADO de operaciones.
 *
 * VIB-157: el detalle de la operación, el listado y el tope del servidor tienen
 * que dar el mismo número. El detalle usa `calculateInvoicingSummary` y el tope
 * usa `checkInvoiceCap`; los dos suman con `sumInvoicedInSaleCurrency`, así que
 * el listado hace lo mismo acá en vez de sumar `imp_total` crudo (que mezclaba
 * pesos con dólares: una venta en USD facturada en ARS quedaba "Facturado").
 */

import {
  buildExchangeRateMap,
  getExchangeRateWithFallback,
} from "@/lib/accounting/exchange-rates"
import {
  getInvoiceSaleCurrency,
  needsMarketRate,
  sumInvoicedInSaleCurrency,
  type InvoicedRow,
} from "@/lib/invoices/currency"

export type InvoiceStatus = "INVOICED" | "PARTIAL" | "NOT_INVOICED"

/** Tolerancia de 1 centavo, para que el redondeo no marque "Parcial" una op completa. */
const TOLERANCE = 0.01

export interface OperationInvoicing {
  /** Facturado neto de notas de crédito, en la moneda de la venta. */
  invoiced: number
  sale_total: number
  status: InvoiceStatus
  /** Porcentaje de la venta ya facturado (0-100, un decimal). */
  pct: number
}

export function invoiceStatusFor(invoiced: number, saleTotal: number): InvoiceStatus {
  if (invoiced <= TOLERANCE) return "NOT_INVOICED"
  return invoiced >= saleTotal - TOLERANCE ? "INVOICED" : "PARTIAL"
}

export function invoicedPctFor(invoiced: number, saleTotal: number): number {
  if (!(saleTotal > 0)) return 0
  const pct = (Math.max(0, invoiced) / saleTotal) * 100
  return Math.min(100, Math.round(pct * 10) / 10)
}

interface OperationCurrencyRow {
  id: string
  sale_amount_total?: number | string | null
  sale_currency?: string | null
  currency?: string | null
}

/**
 * Facturado por operación, valuado en la moneda de venta de cada una.
 *
 * `operations` trae las filas que ya tiene el caller (el listado paginado); si
 * no las tiene, pasar solo `{ id }` y el cálculo asume ARS, que es el default de
 * la columna.
 */
export async function getInvoicedByOperation(
  supabase: any,
  orgId: string,
  operations: OperationCurrencyRow[]
): Promise<Record<string, number>> {
  const ids = operations.map((op) => op.id).filter(Boolean)
  if (ids.length === 0) return {}

  const { data: authInvoices } = await supabase
    .from("invoices")
    .select("operation_id, imp_total, cbte_tipo, moneda, cotizacion, fecha_emision")
    .eq("org_id", orgId)
    .eq("status", "authorized")
    .in("operation_id", ids)

  const rows = (authInvoices || []) as Array<InvoicedRow & { operation_id: string | null }>
  if (rows.length === 0) return {}

  const byOp: Record<string, InvoicedRow[]> = {}
  for (const row of rows) {
    if (!row.operation_id) continue
    ;(byOp[row.operation_id] ||= []).push(row)
  }

  // El TC del día solo se trae si alguna factura está en otra moneda que su venta.
  const currencyByOp = new Map(operations.map((op) => [op.id, getInvoiceSaleCurrency(op)]))
  const needsRates = rows.some((row) => {
    const saleCurrency = row.operation_id ? currencyByOp.get(row.operation_id) : undefined
    return saleCurrency ? needsMarketRate(row, saleCurrency) : false
  })

  let rateFor: (date: string | null | undefined) => number | null = () => null
  if (needsRates) {
    const [rateMap, market] = await Promise.all([
      buildExchangeRateMap(supabase, rows.map((row) => row.fecha_emision ?? null)),
      getExchangeRateWithFallback(supabase, new Date(), "operations-invoice-status"),
    ])
    rateFor = (date) => rateMap(date) ?? market.rate
  }

  const result: Record<string, number> = {}
  for (const [opId, invoices] of Object.entries(byOp)) {
    const saleCurrency = currencyByOp.get(opId) ?? "ARS"
    result[opId] = sumInvoicedInSaleCurrency({ invoices, saleCurrency, rateFor }).total
  }
  return result
}

/**
 * Estado de facturación de TODAS las operaciones del org que tienen al menos un
 * comprobante autorizado. Lo usa el filtro "Estado de facturación" del listado,
 * que necesita resolver los ids ANTES de paginar.
 *
 * Las operaciones sin comprobantes no aparecen en el resultado: son
 * NOT_INVOICED por definición y traerlas sería traer la tabla entera.
 */
export async function getInvoicingStatusByOperation(
  supabase: any,
  orgId: string
): Promise<Record<string, OperationInvoicing>> {
  const { data: invoiced } = await supabase
    .from("invoices")
    .select("operation_id")
    .eq("org_id", orgId)
    .eq("status", "authorized")
    .not("operation_id", "is", null)

  const opIds = Array.from(
    new Set(((invoiced || []) as any[]).map((row) => row.operation_id as string))
  )
  if (opIds.length === 0) return {}

  const { data: operations } = await supabase
    .from("operations")
    .select("id, sale_amount_total, sale_currency, currency")
    .eq("org_id", orgId)
    .in("id", opIds)

  const opRows = (operations || []) as OperationCurrencyRow[]
  const invoicedByOp = await getInvoicedByOperation(supabase, orgId, opRows)

  const result: Record<string, OperationInvoicing> = {}
  for (const op of opRows) {
    const amount = invoicedByOp[op.id] || 0
    const saleTotal = Number(op.sale_amount_total) || 0
    result[op.id] = {
      invoiced: amount,
      sale_total: saleTotal,
      status: invoiceStatusFor(amount, saleTotal),
      pct: invoicedPctFor(amount, saleTotal),
    }
  }
  return result
}
