import {
  calculateAmountInSaleCurrency,
  normalizeSupportedCurrency,
  type SupportedCurrency,
} from "@/lib/payments/customer-income-fx"

export type ReceiptScope = "OPERATION" | "SERVICE"

export interface ReceiptPaymentRecord {
  id: string
  amount: number | string | null
  currency?: string | null
  exchange_rate?: number | string | null
  amount_usd?: number | string | null
  date_paid?: string | null
  reference?: string | null
  operation_service_id?: string | null
}

export interface ReceiptHistoryEntry {
  id: string
  amount: number
  currency: SupportedCurrency
  datePaid: string | null
  reference: string
  amountInReceiptCurrency: number
}

export interface ReceiptPaymentSummary {
  totalOperacion: number
  totalPagado: number
  saldoRestante: number
  paymentHistory: ReceiptHistoryEntry[]
}

function parseNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null
  }

  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function getReceiptScope(operationServiceId?: string | null): ReceiptScope {
  return operationServiceId ? "SERVICE" : "OPERATION"
}

export function filterReceiptPaymentsByScope<T extends { operation_service_id?: string | null }>(
  payments: T[],
  operationServiceId?: string | null
): T[] {
  return payments.filter((payment) => {
    const paymentServiceId = payment.operation_service_id || null
    return operationServiceId ? paymentServiceId === operationServiceId : paymentServiceId === null
  })
}

export function getReceiptPaymentAmountInCurrency(
  payment: ReceiptPaymentRecord,
  receiptCurrency: string
): number {
  const amount = parseNumber(payment.amount) || 0
  const normalizedReceiptCurrency = normalizeSupportedCurrency(receiptCurrency)
  const normalizedPaymentCurrency = normalizeSupportedCurrency(payment.currency)

  if (normalizedReceiptCurrency === "USD") {
    const amountUsd = parseNumber(payment.amount_usd)
    if (amountUsd !== null && amountUsd > 0) {
      return amountUsd
    }
  }

  if (normalizedPaymentCurrency === normalizedReceiptCurrency) {
    return amount
  }

  const convertedAmount = calculateAmountInSaleCurrency({
    paymentCurrency: normalizedPaymentCurrency,
    saleCurrency: normalizedReceiptCurrency,
    amount,
    exchangeRate: parseNumber(payment.exchange_rate),
  })

  return convertedAmount ?? 0
}

export function buildReceiptPaymentSummary(params: {
  payments: ReceiptPaymentRecord[]
  receiptCurrency: string
  totalAmount: number
}): ReceiptPaymentSummary {
  const paymentHistory = params.payments.map((payment) => ({
    id: payment.id,
    amount: parseNumber(payment.amount) || 0,
    currency: normalizeSupportedCurrency(payment.currency),
    datePaid: payment.date_paid || null,
    reference: payment.reference || "",
    amountInReceiptCurrency: getReceiptPaymentAmountInCurrency(payment, params.receiptCurrency),
  }))

  const totalPagado = paymentHistory.reduce(
    (sum, payment) => sum + payment.amountInReceiptCurrency,
    0
  )

  return {
    totalOperacion: params.totalAmount,
    totalPagado,
    saldoRestante: Math.max(0, params.totalAmount - totalPagado),
    paymentHistory,
  }
}
