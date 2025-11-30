/**
 * Utilidades para manejo de depósitos de leads
 * Mapea métodos de pago a tipos de cuenta y métodos del ledger
 */

export type DepositMethod = string | null

export type LedgerMethod = "CASH" | "BANK" | "MP" | "USD" | "OTHER"
export type AccountType = "CASH" | "BANK" | "MP" | "USD"

/**
 * Mapea el método de pago del depósito al método del ledger
 */
export function mapDepositMethodToLedgerMethod(depositMethod: DepositMethod): LedgerMethod {
  if (!depositMethod) return "OTHER"

  const method = depositMethod.toLowerCase().trim()

  // Efectivo
  if (method.includes("efectivo") || method.includes("cash") || method === "efectivo") {
    return "CASH"
  }

  // Transferencia bancaria
  if (
    method.includes("transferencia") ||
    method.includes("banco") ||
    method.includes("bank") ||
    method.includes("deposito") ||
    method === "transferencia"
  ) {
    return "BANK"
  }

  // Mercado Pago
  if (
    method.includes("mercado pago") ||
    method.includes("mercadopago") ||
    method.includes("mp") ||
    method === "mercado pago"
  ) {
    return "MP"
  }

  // USD (si el método es específicamente USD)
  if (method === "usd" || method === "dolares") {
    return "USD"
  }

  // Por defecto
  return "OTHER"
}

/**
 * Determina el tipo de cuenta financiera según el método de pago y la moneda
 */
export function getAccountTypeForDeposit(
  depositMethod: DepositMethod,
  currency: "ARS" | "USD"
): AccountType {
  // Si es USD, siempre va a cuenta USD
  if (currency === "USD") {
    return "USD"
  }

  // Si es ARS, determinar según método de pago
  const ledgerMethod = mapDepositMethodToLedgerMethod(depositMethod)

  switch (ledgerMethod) {
    case "CASH":
      return "CASH"
    case "BANK":
      return "BANK"
    case "MP":
      return "MP"
    case "USD":
      return "USD"
    default:
      // Por defecto, si no se puede determinar, usar CASH
      return "CASH"
  }
}

/**
 * Determina si un depósito debe generar IVA
 * NOTA: Los depósitos NO generan IVA porque son solo depósitos/señas.
 * El IVA se genera cuando se factura la operación completa.
 */
export function shouldGenerateIVAForDeposit(): boolean {
  return false // Los depósitos nunca generan IVA
}

