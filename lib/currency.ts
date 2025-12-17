/**
 * CURRENCY UTILITIES
 * 
 * Utilidades centralizadas para el manejo de múltiples monedas (ARS y USD)
 * en toda la aplicación.
 * 
 * Principios:
 * 1. Siempre mostrar la moneda original del monto
 * 2. Cuando sea necesario, mostrar también el equivalente en ARS
 * 3. Usar exchange_rate cuando esté disponible, nunca usar fallbacks silenciosos
 * 4. Formateo consistente en toda la aplicación
 */

export type Currency = "ARS" | "USD"

export interface CurrencyAmount {
  amount: number
  currency: Currency
  exchangeRate?: number | null
  date?: Date | string // Para buscar exchange_rate si no está disponible
}

export interface FormattedAmount {
  original: string // Monto en su moneda original formateado
  arsEquivalent: number | null // Equivalente en ARS (null si es ARS o no hay exchange_rate)
  arsEquivalentFormatted: string | null // Equivalente en ARS formateado
  display: string // String para mostrar (moneda original + equivalente si aplica)
  displayShort: string // Versión corta (solo moneda original)
}

/**
 * Formatear un monto en su moneda original
 */
export function formatAmount(amount: number, currency: Currency): string {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return "0,00"
  }

  const formatted = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)

  return formatted
}

/**
 * Formatear un monto con símbolo de moneda
 */
export function formatCurrency(amount: number, currency: Currency): string {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return currency === "USD" ? "USD 0,00" : "ARS 0,00"
  }

  const formatted = formatAmount(amount, currency)
  return `${currency} ${formatted}`
}

/**
 * Convertir USD a ARS usando exchange_rate
 * Si no hay exchange_rate, retorna null (no usar fallbacks silenciosos)
 */
export function convertToARS(
  amount: number,
  currency: Currency,
  exchangeRate: number | null | undefined
): number | null {
  if (currency === "ARS") {
    return amount
  }

  if (currency === "USD") {
    if (!exchangeRate || isNaN(exchangeRate)) {
      return null // No convertir si no hay tasa
    }
    return amount * exchangeRate
  }

  return null
}

/**
 * Formatear un monto con su moneda y opcionalmente mostrar equivalente en ARS
 * 
 * @param amount - Monto a formatear
 * @param currency - Moneda del monto
 * @param exchangeRate - Tasa de cambio (opcional, solo necesario para USD)
 * @param showARSEquivalent - Si mostrar el equivalente en ARS (default: true para USD)
 * @returns Objeto con diferentes formatos del monto
 */
export function formatCurrencyAmount(
  amount: number,
  currency: Currency,
  exchangeRate?: number | null,
  showARSEquivalent: boolean = true
): FormattedAmount {
  const original = formatCurrency(amount, currency)
  const arsEquivalent = convertToARS(amount, currency, exchangeRate)
  const arsEquivalentFormatted = arsEquivalent !== null 
    ? formatCurrency(arsEquivalent, "ARS")
    : null

  // Display: mostrar moneda original + equivalente ARS si está disponible y se solicita
  let display = original
  if (showARSEquivalent && currency === "USD" && arsEquivalent !== null) {
    display = `${original} (≈ ${arsEquivalentFormatted})`
  }

  return {
    original,
    arsEquivalent,
    arsEquivalentFormatted,
    display,
    displayShort: original,
  }
}

/**
 * Sumar montos en diferentes monedas, convirtiendo todo a ARS
 * Retorna el total en ARS y un desglose por moneda
 */
export function sumMultiCurrencyAmounts(
  amounts: CurrencyAmount[]
): {
  totalARS: number | null // null si falta exchange_rate para algún USD
  breakdown: {
    ars: number
    usd: number
    usdInARS: number | null
  }
  hasMissingRates: boolean
} {
  let totalARS = 0
  let totalUSD = 0
  let totalUSDInARS: number | null = 0
  let hasMissingRates = false

  for (const item of amounts) {
    if (item.currency === "ARS") {
      totalARS += item.amount
    } else if (item.currency === "USD") {
      totalUSD += item.amount
      const converted = convertToARS(item.amount, "USD", item.exchangeRate)
      if (converted !== null) {
        totalUSDInARS = (totalUSDInARS || 0) + converted
        totalARS += converted
      } else {
        hasMissingRates = true
        totalUSDInARS = null
      }
    }
  }

  return {
    totalARS: hasMissingRates ? null : totalARS,
    breakdown: {
      ars: totalARS - (totalUSDInARS || 0),
      usd: totalUSD,
      usdInARS: totalUSDInARS,
    },
    hasMissingRates,
  }
}

/**
 * Formatear un total multi-moneda para display
 */
export function formatMultiCurrencyTotal(
  amounts: CurrencyAmount[],
  options: {
    showBreakdown?: boolean
    showWarningIfMissingRates?: boolean
  } = {}
): string {
  const { showBreakdown = false, showWarningIfMissingRates = true } = options
  const sum = sumMultiCurrencyAmounts(amounts)

  if (sum.hasMissingRates && showWarningIfMissingRates) {
    const arsPart = sum.breakdown.ars > 0 ? formatCurrency(sum.breakdown.ars, "ARS") : ""
    const usdPart = sum.breakdown.usd > 0 ? formatCurrency(sum.breakdown.usd, "USD") : ""
    const parts = [arsPart, usdPart].filter(Boolean)
    return `${parts.join(" + ")} (falta tasa de cambio)`
  }

  if (sum.totalARS !== null) {
    if (showBreakdown && sum.breakdown.usd > 0) {
      const arsPart = sum.breakdown.ars > 0 ? formatCurrency(sum.breakdown.ars, "ARS") : ""
      const usdPart = sum.breakdown.usd > 0 
        ? `${formatCurrency(sum.breakdown.usd, "USD")} (≈ ${formatCurrency(sum.breakdown.usdInARS || 0, "ARS")})`
        : ""
      const parts = [arsPart, usdPart].filter(Boolean)
      return `${parts.join(" + ")} = ${formatCurrency(sum.totalARS, "ARS")}`
    }
    return formatCurrency(sum.totalARS, "ARS")
  }

  // Si no se puede calcular total, mostrar desglose
  const arsPart = sum.breakdown.ars > 0 ? formatCurrency(sum.breakdown.ars, "ARS") : ""
  const usdPart = sum.breakdown.usd > 0 ? formatCurrency(sum.breakdown.usd, "USD") : ""
  const parts = [arsPart, usdPart].filter(Boolean)
  return parts.join(" + ") || "ARS 0,00"
}

/**
 * Helper para obtener el exchange_rate de un objeto (payment, operation, etc.)
 */
export function getExchangeRateFromObject(obj: any): number | null {
  if (!obj) return null
  
  // Intentar diferentes campos donde puede estar el exchange_rate
  if (obj.exchange_rate !== null && obj.exchange_rate !== undefined) {
    const rate = parseFloat(obj.exchange_rate)
    if (!isNaN(rate) && rate > 0) {
      return rate
    }
  }
  
  // Si no está en el objeto, retornar null (no usar fallbacks)
  return null
}

