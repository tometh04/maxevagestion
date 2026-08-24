/**
 * MONEDA DEL COMPROBANTE vs MONEDA DE LA VENTA (VIB-151)
 *
 * Una operación se vende en ARS o USD (`operations.sale_currency`) y la factura
 * se emite en la moneda AFIP que pida el cliente (`invoices.moneda`: PES/DOL).
 * Las dos no tienen por qué coincidir: es válido vender en USD y facturar en
 * pesos.
 *
 * El tope "no facturar más de lo vendido" comparaba los dos importes sin mirar
 * moneda, así que una venta de USD 8050 topeaba la factura en $8050 y la agencia
 * no podía emitir. Acá viven las conversiones puras que usa
 * `app/api/invoices/route.ts` (y sus tests): todo se lleva a la moneda de la
 * VENTA, que es la unidad en la que el tope tiene sentido.
 *
 * Sobre `invoices.cotizacion`: es el campo MonCotiz de AFIP, o sea la cotización
 * de la moneda DEL COMPROBANTE contra el peso. Para un comprobante en PES vale 1
 * por definición (ver `afipMonCotiz`), así que NO sirve para valuar una factura
 * en pesos contra una venta en dólares: para eso se usa el TC del día de emisión
 * (`exchange_rates`), que es la fuente autoritativa de valuación según
 * docs/finance/TIPO-DE-CAMBIO-FUENTES.md.
 */

import { ledgerSign } from "@/lib/invoices/credit-note"
import {
  calculateAmountInSaleCurrency,
  coercePositiveNumber,
  getOperationSaleCurrency,
  type SupportedCurrency,
} from "@/lib/payments/customer-income-fx"

export type InvoiceMoneda = string | null | undefined

/** Redondeo a 2 decimales (evita que el float arrastre en las sumas). */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Código de moneda AFIP → moneda soportada por el sistema.
 * Devuelve null para monedas que la app no sabe valuar (EUR, BRL, etc.): el
 * caller decide si eso es un error o si sigue sin convertir.
 */
export function invoiceCurrencyToSupported(moneda: InvoiceMoneda): SupportedCurrency | null {
  const code = String(moneda ?? "PES").trim().toUpperCase()
  if (code === "PES" || code === "ARS") return "ARS"
  if (code === "DOL" || code === "USD") return "USD"
  return null
}

/**
 * MonCotiz para AFIP.
 *
 * AFIP define MonCotiz como la cotización de MonId contra el peso, así que un
 * comprobante en PES SIEMPRE va con 1. El alta de facturas guarda en
 * `cotizacion` el TC con el que se convirtió una venta en USD a pesos, que es
 * otra cosa; si eso viajara tal cual a AFIP (o al QR) el comprobante quedaría
 * declarando "1 peso = 1367 pesos".
 */
export function afipMonCotiz(moneda: InvoiceMoneda, cotizacion: number | null | undefined): number {
  if (invoiceCurrencyToSupported(moneda) === "ARS") return 1
  return coercePositiveNumber(cotizacion) ?? 1
}

/**
 * Importe de una factura expresado en la moneda de la venta.
 * `exchangeRate` es ARS por USD. Devuelve null si falta el TC y hace falta.
 */
export function invoiceTotalInSaleCurrency(params: {
  impTotal: number
  moneda: InvoiceMoneda
  saleCurrency: SupportedCurrency
  exchangeRate?: number | null
}): number | null {
  const invoiceCurrency = invoiceCurrencyToSupported(params.moneda)
  if (!invoiceCurrency) return null

  const converted = calculateAmountInSaleCurrency({
    paymentCurrency: invoiceCurrency,
    saleCurrency: params.saleCurrency,
    amount: params.impTotal,
    exchangeRate: params.exchangeRate,
  })

  return converted === null ? null : round2(converted)
}

interface OperationCurrencyLike {
  sale_currency?: string | null
  currency?: string | null
}

/**
 * Moneda de la venta de una operación, para comparar contra facturas.
 *
 * No usa `getOperationSaleCurrency` directo a propósito: ese helper asume USD
 * cuando no hay moneda declarada, y acá eso sería peligroso — una operación
 * vieja sin moneda (la columna se agregó en la migración 008, con DEFAULT 'ARS')
 * pasaría a valuarse dividiendo por el TC y el tope dejaría facturar de más.
 * Sin moneda declarada asumimos ARS, que es el default de la columna y deja el
 * comportamiento igual al de antes de VIB-151 (comparación sin conversión).
 */
export function getInvoiceSaleCurrency(operation: OperationCurrencyLike): SupportedCurrency {
  if (!operation?.sale_currency && !operation?.currency) return "ARS"
  return getOperationSaleCurrency(operation)
}

export interface InvoicedRow {
  imp_total: number | string | null
  cbte_tipo: number
  moneda?: string | null
  cotizacion?: number | string | null
  fecha_emision?: string | null
}

/**
 * ¿Esta factura ya emitida necesita el TC del día para valuarse contra la venta?
 * Sí cuando está en otra moneda que la venta y su `cotizacion` no sirve como TC
 * (caso factura en PES: MonCotiz = 1).
 */
export function needsMarketRate(row: InvoicedRow, saleCurrency: SupportedCurrency): boolean {
  const invoiceCurrency = invoiceCurrencyToSupported(row.moneda)
  if (!invoiceCurrency || invoiceCurrency === saleCurrency) return false
  const stored = coercePositiveNumber(row.cotizacion)
  return !stored || stored <= 1
}

/**
 * Suma las facturas ya autorizadas de una operación en la moneda de la venta.
 * Las NC restan y las ND suman (`ledgerSign`).
 *
 * `rateFor(fecha)` resuelve el TC del día de emisión para las facturas que lo
 * necesitan. Las que no se pueden valuar salen en `unconverted` en vez de
 * sumarse crudas: un total mal armado infla el restante y deja facturar de más.
 */
export function sumInvoicedInSaleCurrency(params: {
  invoices: InvoicedRow[]
  saleCurrency: SupportedCurrency
  rateFor: (date: string | null | undefined) => number | null
}): { total: number; unconverted: InvoicedRow[] } {
  const { invoices, saleCurrency, rateFor } = params
  const unconverted: InvoicedRow[] = []
  let total = 0

  for (const row of invoices) {
    const impTotal = Number(row.imp_total ?? 0)
    const invoiceCurrency = invoiceCurrencyToSupported(row.moneda)

    // Moneda desconocida o igual a la de la venta: se suma tal cual. La moneda
    // desconocida mantiene el comportamiento histórico a propósito — son filas
    // legacy y bloquear la facturación por ellas sería peor que valuarlas 1:1.
    if (!invoiceCurrency || invoiceCurrency === saleCurrency) {
      total += ledgerSign(row.cbte_tipo) * impTotal
      continue
    }

    const stored = coercePositiveNumber(row.cotizacion)
    const rate = stored && stored > 1 ? stored : rateFor(row.fecha_emision)
    const converted = invoiceTotalInSaleCurrency({
      impTotal,
      moneda: row.moneda,
      saleCurrency,
      exchangeRate: rate,
    })

    if (converted === null) {
      unconverted.push(row)
      continue
    }

    total += ledgerSign(row.cbte_tipo) * converted
  }

  return { total: round2(total), unconverted }
}

/** Tolerancia de 1 centavo, para que el redondeo no bloquee una factura exacta. */
const CAP_TOLERANCE = 0.01

/**
 * Tope de facturación de una operación, todo en la moneda de la venta.
 */
export function checkInvoiceCap(params: {
  saleTotal: number
  alreadyInvoiced: number
  newTotalInSaleCurrency: number
}): { ok: boolean; remaining: number } {
  const remaining = round2(params.saleTotal - params.alreadyInvoiced)
  return {
    ok: params.newTotalInSaleCurrency <= remaining + CAP_TOLERANCE,
    remaining,
  }
}
