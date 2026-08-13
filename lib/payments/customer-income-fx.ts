export type SupportedCurrency = "ARS" | "USD"

interface OperationSaleCurrencyLike {
  sale_currency?: string | null
  currency?: string | null
}

interface ServiceSaleCurrencyLike {
  sale_currency?: string | null
}

interface CustomerIncomeExchangeRateParams {
  payerType?: string | null
  direction?: string | null
  paymentCurrency?: string | null
  saleCurrency?: string | null
}

interface CrossCurrencyAmountParams {
  paymentCurrency?: string | null
  saleCurrency?: string | null
  amount: number
  exchangeRate?: number | null
}

export function normalizeSupportedCurrency(value: string | null | undefined): SupportedCurrency {
  return value === "ARS" ? "ARS" : "USD"
}

export function getOperationSaleCurrency(operation?: OperationSaleCurrencyLike | null): SupportedCurrency {
  return normalizeSupportedCurrency(operation?.sale_currency ?? operation?.currency)
}

export function getCustomerIncomeReferenceCurrency(params?: {
  operation?: OperationSaleCurrencyLike | null
  service?: ServiceSaleCurrencyLike | null
}): SupportedCurrency {
  if (params?.service?.sale_currency) {
    return normalizeSupportedCurrency(params.service.sale_currency)
  }

  return getOperationSaleCurrency(params?.operation)
}

export function coercePositiveNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null
  }

  const parsed = typeof value === "number" ? value : Number(value)

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null
  }

  return parsed
}

export function requiresCustomerIncomeExchangeRate({
  payerType,
  direction,
  paymentCurrency,
  saleCurrency,
}: CustomerIncomeExchangeRateParams): boolean {
  if (payerType !== "CUSTOMER" || direction !== "INCOME") {
    return false
  }

  return normalizeSupportedCurrency(paymentCurrency) !== normalizeSupportedCurrency(saleCurrency)
}

/**
 * Sanea el tipo de cambio ARS/USD ingresado a mano contra el TC de referencia del
 * mercado. Un cobro en ARS sobre una venta en USD (o viceversa) exige un TC real
 * (~1500 ARS/USD hoy); el sistema ya obliga a que NO esté vacío, pero aceptaba
 * valores absurdos como 1 ("1 peso = 1 dólar"), que hacían amount_usd = monto en
 * ARS y destruían la deuda del cliente (caso real op #17955bf1: deuda USD 1.270 →
 * USD -1.948.180).
 *
 * Banda amplia (factor 10) a propósito: solo bloquea errores de ORDEN DE MAGNITUD
 * (1, 10, 100 cuando el mercado es ~1500), no diferencias razonables de cotización.
 * Si no hay TC de referencia disponible, no bloquea (devuelve true).
 */
export function isExchangeRatePlausibleVsMarket(
  rate: number | null | undefined,
  marketRate: number | null | undefined
): boolean {
  const r = coercePositiveNumber(rate)
  if (!r) return false
  const m = coercePositiveNumber(marketRate)
  if (!m) return true // sin referencia, no bloquear
  const ratio = r / m
  return ratio >= 0.1 && ratio <= 10
}

export function calculateAmountInSaleCurrency({
  paymentCurrency,
  saleCurrency,
  amount,
  exchangeRate,
}: CrossCurrencyAmountParams): number | null {
  const normalizedPaymentCurrency = normalizeSupportedCurrency(paymentCurrency)
  const normalizedSaleCurrency = normalizeSupportedCurrency(saleCurrency)

  if (normalizedPaymentCurrency === normalizedSaleCurrency) {
    return amount
  }

  if (!exchangeRate || exchangeRate <= 0) {
    return null
  }

  if (normalizedSaleCurrency === "ARS" && normalizedPaymentCurrency === "USD") {
    return amount * exchangeRate
  }

  if (normalizedSaleCurrency === "USD" && normalizedPaymentCurrency === "ARS") {
    return amount / exchangeRate
  }

  return null
}
