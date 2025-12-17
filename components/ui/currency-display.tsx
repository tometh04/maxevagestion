"use client"

import { Currency, formatCurrencyAmount, getExchangeRateFromObject } from "@/lib/currency"
import { cn } from "@/lib/utils"

interface CurrencyDisplayProps {
  amount: number
  currency: Currency
  exchangeRate?: number | null
  showARSEquivalent?: boolean
  className?: string
  variant?: "default" | "short" | "full"
}

/**
 * Componente para mostrar montos de forma consistente en toda la aplicación
 * 
 * @example
 * <CurrencyDisplay amount={1000} currency="USD" exchangeRate={1000} />
 * // Muestra: "USD 1.000,00 (≈ ARS 1.000.000,00)"
 * 
 * <CurrencyDisplay amount={50000} currency="ARS" variant="short" />
 * // Muestra: "ARS 50.000,00"
 */
export function CurrencyDisplay({
  amount,
  currency,
  exchangeRate,
  showARSEquivalent = true,
  className,
  variant = "default",
}: CurrencyDisplayProps) {
  const formatted = formatCurrencyAmount(amount, currency, exchangeRate, showARSEquivalent)

  if (variant === "short") {
    return <span className={className}>{formatted.displayShort}</span>
  }

  if (variant === "full" && formatted.arsEquivalent !== null) {
    return (
      <span className={className}>
        {formatted.original}
        {showARSEquivalent && currency === "USD" && (
          <span className="text-muted-foreground text-sm ml-1">
            (≈ {formatted.arsEquivalentFormatted})
          </span>
        )}
      </span>
    )
  }

  return <span className={className}>{formatted.display}</span>
}

/**
 * Helper para usar con objetos que tienen amount y currency
 */
interface CurrencyDisplayFromObjectProps {
  obj: {
    amount?: number | string | null
    currency?: Currency | string | null
    exchange_rate?: number | string | null
    [key: string]: any
  }
  showARSEquivalent?: boolean
  className?: string
  variant?: "default" | "short" | "full"
}

export function CurrencyDisplayFromObject({
  obj,
  showARSEquivalent = true,
  className,
  variant = "default",
}: CurrencyDisplayFromObjectProps) {
  const amount = typeof obj.amount === "string" ? parseFloat(obj.amount) : (obj.amount || 0)
  const currency = (obj.currency as Currency) || "ARS"
  const exchangeRate = getExchangeRateFromObject(obj)

  return (
    <CurrencyDisplay
      amount={amount}
      currency={currency}
      exchangeRate={exchangeRate}
      showARSEquivalent={showARSEquivalent}
      className={className}
      variant={variant}
    />
  )
}

