export type SupportedCurrency = "ARS" | "USD"

interface OperationSaleCurrencyLike {
  sale_currency?: string | null
  currency?: string | null
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
