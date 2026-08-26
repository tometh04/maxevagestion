/**
 * Calculadora pura del estado de facturación de una operación.
 *
 * VIB-157: la base es la **venta total** (`sale_amount_total`), no el margen.
 * Antes este resumen comparaba lo facturado contra `margin_amount` mientras el
 * tope real del servidor (`checkInvoiceCap` en POST /api/invoices y en
 * /api/invoices/[id]/authorize) y el listado de operaciones comparaban contra la
 * venta. Con seña + saldo —el flujo normal de una agencia— eso daba "ya
 * facturada completa" y deshabilitaba el botón después de la primera factura,
 * aunque quedara la mayor parte del paquete sin facturar.
 *
 * La suma de lo ya facturado delega en `sumInvoicedInSaleCurrency`, el mismo
 * helper que usa el tope: netea notas de crédito (`ledgerSign`) y valúa cada
 * comprobante en la moneda de la venta (VIB-151). Así el resumen que ve el
 * usuario y el guard que autoriza no pueden divergir.
 *
 * El nombre del endpoint (`/api/operations/:id/margin-summary`) quedó igual a
 * propósito: es un contrato ya consumido y renombrarlo no aporta nada.
 */

import {
  getInvoiceSaleCurrency,
  sumInvoicedInSaleCurrency,
  type InvoicedRow,
} from "@/lib/invoices/currency"

export type ReasonDisabled =
  | "no_sale_amount"
  | "no_customer"
  | "no_afip"
  | "already_fully_invoiced"

export interface InvoicingSummary {
  /** Venta total de la operación, en la moneda de la venta. Base facturable. */
  sale_total: number
  /** Facturado neto de notas de crédito, valuado en la moneda de la venta. */
  already_invoiced: number
  remaining: number
  /** Porcentaje de la venta ya facturado (0-100, un decimal). */
  invoiced_pct: number
  /** Porcentaje que falta facturar. Complemento exacto de `invoiced_pct`. */
  remaining_pct: number
  can_invoice: boolean
  reason_disabled: ReasonDisabled | null
  /**
   * Facturas que no se pudieron valuar en la moneda de la venta (sin TC del día
   * y en otra moneda). Quedan fuera de `already_invoiced`, igual que en el tope
   * del servidor, así que el resumen puede estar mostrando de menos.
   */
  unconverted_count: number
}

interface OperationForInvoicing {
  sale_amount_total: number | string | null
  customer_id: string | null
  sale_currency?: string | null
  currency?: string | null
}

type InvoiceForInvoicing = InvoicedRow & { status: string }

interface InvoicingSummaryOptions {
  /** TC ARS/USD del día de emisión, para las facturas en otra moneda que la venta. */
  rateFor?: (date: string | null | undefined) => number | null
}

const round2 = (value: number): number => Math.round(value * 100) / 100
const round1 = (value: number): number => Math.round(value * 10) / 10

export function calculateInvoicingSummary(
  operation: OperationForInvoicing,
  invoices: InvoiceForInvoicing[],
  hasAfipConfig: boolean,
  options: InvoicingSummaryOptions = {}
): InvoicingSummary {
  const saleTotal = round2(Number(operation.sale_amount_total) || 0)
  const saleCurrency = getInvoiceSaleCurrency(operation)

  const { total, unconverted } = sumInvoicedInSaleCurrency({
    invoices: invoices.filter((i) => i.status === "authorized"),
    saleCurrency,
    rateFor: options.rateFor ?? (() => null),
  })

  // Si las NC superan a las facturas el neto da negativo: para el usuario eso es
  // "no hay nada facturado", no un crédito a favor.
  const already = Math.max(0, round2(total))

  // Redondeo a 2 decimales para evitar falsos "remaining" negativos por ruido de
  // IEEE 754 (20000 - 19999.99 = 0.01000000000218...).
  const remaining = Math.max(0, round2(saleTotal - already))

  const invoicedPct = saleTotal > 0 ? Math.min(100, round1((already / saleTotal) * 100)) : 0

  let reason: ReasonDisabled | null = null
  if (saleTotal <= 0) {
    reason = "no_sale_amount"
  } else if (!operation.customer_id) {
    reason = "no_customer"
  } else if (!hasAfipConfig) {
    reason = "no_afip"
  } else if (remaining <= 0) {
    reason = "already_fully_invoiced"
  }

  return {
    sale_total: saleTotal,
    already_invoiced: already,
    remaining,
    invoiced_pct: invoicedPct,
    remaining_pct: round1(100 - invoicedPct),
    can_invoice: reason === null,
    reason_disabled: reason,
    unconverted_count: unconverted.length,
  }
}
