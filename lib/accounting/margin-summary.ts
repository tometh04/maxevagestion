/**
 * Calculadora pura del estado de facturación de una operación.
 *
 * Dado el margen total y las facturas asociadas, determina cuánto
 * queda por facturar y qué razones bloquean la emisión (sin customer,
 * sin AFIP config, ya facturada full, sin margen).
 *
 * VIB-151: el margen está en la moneda de la VENTA y cada factura en la suya
 * (`invoices.moneda`), así que sumar `imp_total` crudo mezclaba pesos con
 * dólares. Una operación en USD con una factura parcial en pesos daba
 * "already_fully_invoiced" y la UI bloqueaba la segunda factura.
 *
 * Spec: docs/superpowers/specs/2026-04-24-ganancia-facturacion-design.md
 */

import { invoiceTotalInSaleCurrency } from "@/lib/invoices/currency"
import { getOperationSaleCurrency } from "@/lib/payments/customer-income-fx"

export type ReasonDisabled =
  | "no_margin"
  | "no_customer"
  | "no_afip"
  | "already_fully_invoiced"

export interface MarginSummary {
  margin_total: number
  already_invoiced: number
  remaining: number
  can_invoice: boolean
  reason_disabled: ReasonDisabled | null
}

interface OperationForMargin {
  margin_amount: number
  customer_id: string | null
  /**
   * Moneda de la venta (la del margen). Si no viene, no se convierte nada y el
   * cálculo queda como antes: los callers viejos siguen funcionando igual.
   */
  sale_currency?: string | null
}

interface InvoiceForMargin {
  imp_total: number
  status: string
  moneda?: string | null
  cotizacion?: number | null
  fecha_emision?: string | null
}

interface MarginSummaryOptions {
  /** TC ARS/USD del día de emisión, para las facturas en otra moneda que la venta. */
  rateFor?: (date: string | null | undefined) => number | null
}

export function calculateMarginSummary(
  operation: OperationForMargin,
  invoices: InvoiceForMargin[],
  hasAfipConfig: boolean,
  options: MarginSummaryOptions = {}
): MarginSummary {
  const margin = Number(operation.margin_amount)
  const saleCurrency = operation.sale_currency ? getOperationSaleCurrency(operation) : null

  const already = invoices
    .filter((i) => i.status === "authorized")
    .reduce((acc, i) => {
      const impTotal = Number(i.imp_total)
      if (!saleCurrency) return acc + impTotal

      // MonCotiz sirve como TC solo cuando el comprobante NO está en pesos
      // (para PES vale 1 por definición); si no, se usa el TC del día.
      const stored = Number(i.cotizacion)
      const rate =
        Number.isFinite(stored) && stored > 1 ? stored : options.rateFor?.(i.fecha_emision) ?? null

      const converted = invoiceTotalInSaleCurrency({
        impTotal,
        moneda: i.moneda,
        saleCurrency,
        exchangeRate: rate,
      })

      // Sin TC no se puede valuar: se suma crudo como hacía la versión vieja.
      // Es un resumen de UI; el tope real lo valida POST /api/invoices.
      return acc + (converted ?? impTotal)
    }, 0)

  // Redondeo a 2 decimales para evitar falsos "remaining" negativos
  // por ruido de IEEE 754 (20000 - 19999.99 = 0.01000000000218...)
  const remainingRaw = margin - already
  const remaining = Math.max(0, Math.round(remainingRaw * 100) / 100)

  let reason: ReasonDisabled | null = null
  if (margin <= 0) {
    reason = "no_margin"
  } else if (!operation.customer_id) {
    reason = "no_customer"
  } else if (!hasAfipConfig) {
    reason = "no_afip"
  } else if (remaining <= 0) {
    reason = "already_fully_invoiced"
  }

  return {
    margin_total: margin,
    already_invoiced: Math.round(already * 100) / 100,
    remaining,
    can_invoice: reason === null,
    reason_disabled: reason,
  }
}
