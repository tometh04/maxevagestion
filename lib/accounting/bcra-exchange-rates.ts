/**
 * BCRA EXCHANGE RATES - Feed automatico de tipo de cambio
 *
 * Obtiene el tipo de cambio oficial USD/ARS desde APIs publicas.
 * Intenta multiples fuentes en orden ya que la API del BCRA puede ser inestable.
 *
 * Fuentes:
 *   1. dolarapi.com (primaria, gratis, sin auth)
 *   2. bluelytics.com.ar (fallback, gratis, sin auth)
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { upsertExchangeRate } from "./exchange-rates"

export interface FetchedExchangeRate {
  buy: number
  sell: number
  date: string
  source: string
}

/**
 * Intenta obtener el tipo de cambio oficial desde dolarapi.com
 */
async function fetchFromDolarApi(): Promise<FetchedExchangeRate | null> {
  try {
    const response = await fetch("https://dolarapi.com/v1/dolares/oficial", {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "application/json" },
    })

    if (!response.ok) {
      console.warn(`[BCRA] dolarapi.com responded with status ${response.status}`)
      return null
    }

    const data = await response.json()

    // dolarapi.com returns: { compra, venta, casa, nombre, moneda, fechaActualizacion }
    if (!data?.compra || !data?.venta) {
      console.warn("[BCRA] dolarapi.com returned unexpected data shape:", data)
      return null
    }

    return {
      buy: Number(data.compra),
      sell: Number(data.venta),
      date: data.fechaActualizacion
        ? new Date(data.fechaActualizacion).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
      source: "dolarapi.com",
    }
  } catch (error) {
    console.warn("[BCRA] Error fetching from dolarapi.com:", error)
    return null
  }
}

/**
 * Intenta obtener el tipo de cambio oficial desde bluelytics.com.ar
 */
async function fetchFromBluelytics(): Promise<FetchedExchangeRate | null> {
  try {
    const response = await fetch("https://api.bluelytics.com.ar/v2/latest", {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "application/json" },
    })

    if (!response.ok) {
      console.warn(`[BCRA] bluelytics.com.ar responded with status ${response.status}`)
      return null
    }

    const data = await response.json()

    // bluelytics returns: { oficial: { value_avg, value_sell, value_buy }, ... , last_update }
    if (!data?.oficial?.value_buy || !data?.oficial?.value_sell) {
      console.warn("[BCRA] bluelytics.com.ar returned unexpected data shape:", data)
      return null
    }

    return {
      buy: Number(data.oficial.value_buy),
      sell: Number(data.oficial.value_sell),
      date: data.last_update
        ? new Date(data.last_update).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
      source: "bluelytics.com.ar",
    }
  } catch (error) {
    console.warn("[BCRA] Error fetching from bluelytics.com.ar:", error)
    return null
  }
}

/**
 * Obtiene el tipo de cambio oficial USD/ARS.
 * Intenta multiples fuentes en orden de prioridad.
 *
 * @returns El tipo de cambio (compra, venta, fecha, fuente) o null si todas las fuentes fallan
 */
export async function fetchOfficialExchangeRate(): Promise<FetchedExchangeRate | null> {
  // Fuente primaria
  const fromDolarApi = await fetchFromDolarApi()
  if (fromDolarApi) return fromDolarApi

  // Fallback
  const fromBluelytics = await fetchFromBluelytics()
  if (fromBluelytics) return fromBluelytics

  console.error("[BCRA] All exchange rate sources failed")
  return null
}

/**
 * Obtiene el tipo de cambio oficial y lo guarda automaticamente en la base de datos.
 * Usa la tasa vendedora (sell) que es la que se usa para contabilidad.
 *
 * @param supabase - Cliente de Supabase (preferiblemente admin para bypasear RLS)
 * @param userId - ID del usuario que ejecuta la accion (opcional, para tracking)
 * @returns El resultado del upsert o null si fallo la obtencion
 */
export async function autoUpdateExchangeRate(
  supabase: SupabaseClient<Database>,
  userId?: string
): Promise<{ id: string; rate: number; source: string } | null> {
  const fetched = await fetchOfficialExchangeRate()

  if (!fetched) {
    console.error("[BCRA] Could not fetch exchange rate from any source")
    return null
  }

  try {
    // Usar la tasa vendedora (sell) para contabilidad
    const result = await upsertExchangeRate(
      supabase,
      fetched.date,
      fetched.sell,
      "USD",
      "ARS",
      "BCRA_AUTO",
      `Auto-fetched from ${fetched.source}. Compra: ${fetched.buy}, Venta: ${fetched.sell}`,
      userId
    )

    console.log(
      `[BCRA] Exchange rate updated: ${fetched.sell} ARS/USD (sell) from ${fetched.source} for ${fetched.date}`
    )

    return {
      id: result.id,
      rate: fetched.sell,
      source: fetched.source,
    }
  } catch (error) {
    console.error("[BCRA] Error saving exchange rate:", error)
    return null
  }
}
