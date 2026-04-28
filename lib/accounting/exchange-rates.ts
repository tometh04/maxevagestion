/**
 * EXCHANGE RATES SERVICE
 * 
 * Maneja la obtención y gestión de tasas de cambio para conversión de monedas
 */

import { cache } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

export interface ExchangeRate {
  id: string
  rate_date: string
  from_currency: "USD"
  to_currency: "ARS"
  rate: number
  source?: string | null
  notes?: string | null
  created_at: string
  created_by?: string | null
  updated_at: string
}

/**
 * Obtener la tasa de cambio para una fecha específica
 * Si no hay tasa exacta para esa fecha, devuelve la más cercana anterior
 * Si no hay ninguna tasa, devuelve null
 */
export async function getExchangeRate(
  supabase: SupabaseClient<Database>,
  date: Date | string,
  fromCurrency: "USD" = "USD",
  toCurrency: "ARS" = "ARS"
): Promise<number | null> {
  const dateStr = typeof date === "string" ? date : date.toISOString().split("T")[0]

  // Primero intentar obtener usando la función SQL (si existe)
  // Si la función no existe (PGRST202), usar directamente el fallback sin loguear error
  const { data, error } = await (supabase.rpc as any)("get_exchange_rate", {
    p_date: dateStr,
    p_from_currency: fromCurrency,
    p_to_currency: toCurrency,
  })

  if (error) {
    // Si el error es porque la función no existe (PGRST202), no loguear como error
    // Solo loguear como warning si es otro tipo de error
    if (error.code !== "PGRST202") {
      console.warn("Error calling get_exchange_rate function (using fallback):", error.message)
    }
    // Fallback: buscar directamente
    const { data: directData, error: directError } = await (supabase
      .from("exchange_rates") as any)
      .select("rate")
      .eq("from_currency", fromCurrency)
      .eq("to_currency", toCurrency)
      .lte("rate_date", dateStr)
      .order("rate_date", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (directError || !directData) {
      return null
    }

    return parseFloat(directData.rate)
  }

  return data ? parseFloat(String(data)) : null
}

/**
 * Obtener la tasa de cambio más reciente disponible.
 * Wrappeada con React.cache: distintos supabase clients (= distintos users)
 * NO comparten cache; misma instancia + mismo par currency = 1 sola query
 * por request.
 */
export const getLatestExchangeRate = cache(async (
  supabase: SupabaseClient<Database>,
  fromCurrency: "USD" = "USD",
  toCurrency: "ARS" = "ARS"
): Promise<number | null> => {
  const { data, error } = await (supabase.from("exchange_rates") as any)
    .select("rate")
    .eq("from_currency", fromCurrency)
    .eq("to_currency", toCurrency)
    .order("rate_date", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    // No loguear warning - es esperado que no haya tasas de cambio si no se han cargado
    // El sistema usa un fallback automáticamente (1450) en los endpoints que lo necesitan
    return null
  }

  return parseFloat(data.rate)
})

/**
 * Obtener exchange rate con fallback seguro.
 * Intenta: 1) tasa por fecha, 2) tasa más reciente, 3) FALLBACK_RATE con warning visible.
 * Usar esta función en vez de hardcodear 1450 en cada API route.
 */
/**
 * Default fallback exchange rate USD→ARS when no rate is available in the database.
 * Used across API routes as a last-resort value.
 *
 * Prioridad:
 *   1. `USD_ARS_EMERGENCY_RATE` env var (preferido — permite ajustar sin deploy)
 *   2. Constante hardcodeada (último recurso, aprox. mercado 2026)
 *
 * IMPORTANTE: si termina usándose el fallback, se loguea un 🚨 con alta visibilidad.
 * Esto indica que falta cargar tasas en la tabla `exchange_rates`.
 */
const parsedEnvRate = Number(process.env.USD_ARS_EMERGENCY_RATE)
export const DEFAULT_USD_ARS_FALLBACK_RATE =
  Number.isFinite(parsedEnvRate) && parsedEnvRate > 0 ? parsedEnvRate : 1500

const FALLBACK_RATE = DEFAULT_USD_ARS_FALLBACK_RATE
let _lastFallbackWarning = 0

export async function getExchangeRateWithFallback(
  supabase: SupabaseClient<Database>,
  date: Date | string,
  context: string = "unknown"
): Promise<{ rate: number; source: "exact" | "latest" | "fallback" }> {
  // 1) Tasa exacta por fecha
  const exactRate = await getExchangeRate(supabase, date)
  if (exactRate) {
    return { rate: exactRate, source: "exact" }
  }

  // 2) Tasa más reciente
  const latestRate = await getLatestExchangeRate(supabase)
  if (latestRate) {
    console.warn(`⚠️ [${context}] No hay tasa de cambio para ${typeof date === "string" ? date : date.toISOString().split("T")[0]}, usando última disponible: ${latestRate}`)
    return { rate: latestRate, source: "latest" }
  }

  // 3) Fallback hardcodeado — loguear con alta visibilidad (máximo 1 vez por minuto para no spamear)
  const now = Date.now()
  if (now - _lastFallbackWarning > 60000) {
    console.error(`🚨 [${context}] NO HAY TASAS DE CAMBIO EN LA BASE DE DATOS. Usando fallback de emergencia: ${FALLBACK_RATE}. ¡Cargar tasas de cambio urgente!`)
    _lastFallbackWarning = now
  }
  return { rate: FALLBACK_RATE, source: "fallback" }
}

/**
 * Crear o actualizar una tasa de cambio
 */
export async function upsertExchangeRate(
  supabase: SupabaseClient<Database>,
  rateDate: Date | string,
  rate: number,
  fromCurrency: "USD" = "USD",
  toCurrency: "ARS" = "ARS",
  source?: string,
  notes?: string,
  userId?: string
): Promise<{ id: string }> {
  const dateStr = typeof rateDate === "string" ? rateDate : rateDate.toISOString().split("T")[0]

  const { data, error } = await (supabase.from("exchange_rates") as any)
    .upsert(
      {
        rate_date: dateStr,
        from_currency: fromCurrency,
        to_currency: toCurrency,
        rate,
        source: source || "MANUAL",
        notes: notes || null,
        created_by: userId || null,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "rate_date,from_currency,to_currency",
      }
    )
    .select("id")
    .single()

  if (error) {
    throw new Error(`Error upserting exchange rate: ${error.message}`)
  }

  return { id: data.id }
}

/**
 * Obtener todas las tasas de cambio en un rango de fechas
 */
export async function getExchangeRatesInRange(
  supabase: SupabaseClient<Database>,
  dateFrom: Date | string,
  dateTo: Date | string,
  fromCurrency: "USD" = "USD",
  toCurrency: "ARS" = "ARS"
): Promise<ExchangeRate[]> {
  const fromStr = typeof dateFrom === "string" ? dateFrom : dateFrom.toISOString().split("T")[0]
  const toStr = typeof dateTo === "string" ? dateTo : dateTo.toISOString().split("T")[0]

  const { data, error } = await (supabase.from("exchange_rates") as any)
    .select("*")
    .eq("from_currency", fromCurrency)
    .eq("to_currency", toCurrency)
    .gte("rate_date", fromStr)
    .lte("rate_date", toStr)
    .order("rate_date", { ascending: false })

  if (error) {
    throw new Error(`Error fetching exchange rates: ${error.message}`)
  }

  return (data || []) as ExchangeRate[]
}

/**
 * Construye un mapa de tasas de cambio en memoria para un conjunto de fechas.
 * Hace UNA sola query para obtener todas las tasas en el rango, más la más reciente como fallback.
 * Retorna una función getRate(date) que NO hace queries a la BD.
 *
 * Uso: reemplaza múltiples llamadas a getExchangeRate() dentro de un loop (N+1 → 2 queries).
 */
export async function buildExchangeRateMap(
  supabase: SupabaseClient<Database>,
  dates: (string | Date | null | undefined)[],
  fromCurrency: "USD" = "USD",
  toCurrency: "ARS" = "ARS"
): Promise<(date: string | Date | null | undefined) => number | null> {
  // Filtrar y normalizar fechas
  const dateStrings = dates
    .filter((d): d is string | Date => d != null)
    .map(d => typeof d === "string" ? d.split("T")[0] : d.toISOString().split("T")[0])

  if (dateStrings.length === 0) {
    // Sin fechas ARS, solo devolver latestRate como fallback
    const latestRate = await getLatestExchangeRate(supabase, fromCurrency, toCurrency)
    return () => latestRate
  }

  // Encontrar rango min/max
  const sorted = Array.from(new Set(dateStrings)).sort()
  const minDate = sorted[0]
  const maxDate = sorted[sorted.length - 1]

  // Extender 60 días antes del min para cubrir fechas sin tasa exacta
  const extendedMin = new Date(minDate)
  extendedMin.setDate(extendedMin.getDate() - 60)
  const extendedMinStr = extendedMin.toISOString().split("T")[0]

  // 2 queries en paralelo: rango completo + tasa más reciente como fallback
  const [ratesInRange, latestRate] = await Promise.all([
    getExchangeRatesInRange(supabase, extendedMinStr, maxDate, fromCurrency, toCurrency),
    getLatestExchangeRate(supabase, fromCurrency, toCurrency),
  ])

  // Construir array ordenado ascendente para búsqueda
  const rateEntries = ratesInRange
    .map(r => ({ date: r.rate_date, rate: parseFloat(String(r.rate)) }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // Mapa para lookup exacto rápido
  const ratesByDate = new Map<string, number>()
  for (const entry of rateEntries) {
    ratesByDate.set(entry.date, entry.rate)
  }

  return (date: string | Date | null | undefined): number | null => {
    if (!date) return latestRate

    const dateStr = typeof date === "string" ? date.split("T")[0] : date.toISOString().split("T")[0]

    // Lookup exacto
    const exact = ratesByDate.get(dateStr)
    if (exact !== undefined) return exact

    // Buscar tasa más cercana anterior (búsqueda inversa)
    for (let i = rateEntries.length - 1; i >= 0; i--) {
      if (rateEntries[i].date <= dateStr) {
        return rateEntries[i].rate
      }
    }

    // Fallback: tasa más reciente disponible
    return latestRate
  }
}

