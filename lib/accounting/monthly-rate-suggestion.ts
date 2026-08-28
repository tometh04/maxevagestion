/**
 * Cotización sugerida del mes — VIB-141.
 *
 * POR QUÉ SUGERIR Y NO IMPONER
 * ----------------------------
 * El cron de `exchange-rates` ya baja la cotización oficial todos los días
 * (dolarapi, con bluelytics de respaldo), así que no hay motivo para que
 * alguien la escriba a mano. Pero tampoco puede ser automática a secas, por dos
 * razones que son contables, no técnicas:
 *
 *   1. **El oficial no siempre es el tipo de cambio al que opera la agencia.**
 *      Si cobra a MEP o a un tipo negociado y valuamos al oficial, el resultado
 *      que le mostramos no es el suyo.
 *   2. **El criterio de valuación tiene que quedar congelado.** Un contador
 *      necesita poder decir "valué a X" y que ese número no cambie
 *      retroactivamente porque una API se actualizó.
 *
 * Por eso: se propone, la agencia confirma, y queda fija para ese mes.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

export type CriterioCotizacion = "CIERRE" | "PROMEDIO"

export interface CotizacionSugerida {
  /** El valor propuesto, o null si no hay cotizaciones para ese mes. */
  rate: number | null
  criterio: CriterioCotizacion
  /** Cuántas cotizaciones diarias se usaron. */
  muestras: number
  /** Fecha de la última cotización considerada. */
  ultima: string | null
}

/**
 * Fórmula pura, aislada para poder testear la matriz de casos sin base.
 *
 * CIERRE toma la última cotización del mes: es lo que pide un balance, que
 * mide un momento. PROMEDIO es lo que suele usarse para el estado de
 * resultados, que mide un período.
 */
export function calcularSugerencia(
  rates: Array<{ rate_date: string; rate: number }>,
  criterio: CriterioCotizacion
): CotizacionSugerida {
  const validas = rates
    .filter((r) => Number(r.rate) > 0)
    .sort((a, b) => a.rate_date.localeCompare(b.rate_date))

  if (validas.length === 0) {
    return { rate: null, criterio, muestras: 0, ultima: null }
  }

  const ultima = validas[validas.length - 1]

  if (criterio === "CIERRE") {
    return {
      rate: Number(ultima.rate),
      criterio,
      muestras: validas.length,
      ultima: ultima.rate_date,
    }
  }

  const suma = validas.reduce((acc, r) => acc + Number(r.rate), 0)
  return {
    // Dos decimales: es una cotización, no un cálculo intermedio.
    rate: Math.round((suma / validas.length) * 100) / 100,
    criterio,
    muestras: validas.length,
    ultima: ultima.rate_date,
  }
}

/** Primer y último día del mes, en formato date-only. */
export function rangoDelMes(year: number, month: number): { desde: string; hasta: string } {
  const mm = String(month).padStart(2, "0")
  // Día 0 del mes siguiente = último día de este mes. Evita la tabla de días
  // por mes y los años bisiestos.
  const ultimoDia = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { desde: `${year}-${mm}-01`, hasta: `${year}-${mm}-${String(ultimoDia).padStart(2, "0")}` }
}

/**
 * Sugerencia para un mes, leyendo las cotizaciones diarias que ya baja el cron.
 *
 * `exchange_rates` no es multi-tenant a propósito: la cotización del dólar es
 * la misma para todos. Lo que sí es por organización es la cotización MENSUAL
 * elegida, que vive en `monthly_exchange_rates`.
 */
export async function sugerirCotizacionMensual(
  supabase: SupabaseClient<Database>,
  year: number,
  month: number,
  criterio: CriterioCotizacion = "CIERRE"
): Promise<CotizacionSugerida> {
  const { desde, hasta } = rangoDelMes(year, month)

  const { data } = await (supabase.from("exchange_rates") as any)
    .select("rate_date, rate")
    .eq("from_currency", "USD")
    .eq("to_currency", "ARS")
    .gte("rate_date", desde)
    .lte("rate_date", hasta)
    .order("rate_date", { ascending: true })

  return calcularSugerencia(
    ((data ?? []) as any[]).map((r) => ({ rate_date: r.rate_date, rate: Number(r.rate) })),
    criterio
  )
}
