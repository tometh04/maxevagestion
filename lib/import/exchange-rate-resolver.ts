import { getExchangeRate } from "@/lib/accounting/exchange-rates"
import type { SupabaseClientTyped, ExchangeRateConfig } from "./types"

/**
 * Crea una función resolver de exchange rate USD→ARS según el modo del job.
 * El resolver cachea por fecha (key=YYYY-MM) para no consultar BD múltiples veces.
 */
export function createExchangeRateResolver(
  supabase: SupabaseClientTyped,
  config: ExchangeRateConfig
): (date: Date) => Promise<number> {
  if (config.mode === "manual_fixed" && config.manualRate === undefined) {
    throw new Error("manualRate is required for manual_fixed mode")
  }

  const cache = new Map<string, number>()

  return async (date: Date): Promise<number> => {
    const cacheKey = date.toISOString().slice(0, 7) // YYYY-MM
    if (cache.has(cacheKey)) return cache.get(cacheKey)!

    let rate: number | null = null

    if (config.mode === "manual_fixed") {
      rate = config.manualRate!
    } else {
      // monthly_rates or monthly_with_fallback
      rate = await getExchangeRate(supabase, date)
      if (rate === null && config.mode === "monthly_with_fallback") {
        if (config.manualRate === undefined) {
          throw new Error(
            `No exchange rate for ${cacheKey} and no manualRate fallback configured`
          )
        }
        rate = config.manualRate
      }
      if (rate === null) {
        throw new Error(`No exchange rate for ${cacheKey}`)
      }
    }

    cache.set(cacheKey, rate)
    return rate
  }
}
