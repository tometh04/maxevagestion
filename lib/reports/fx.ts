/**
 * Conversión de montos a la moneda de salida de un reporte.
 *
 * Generaliza lo que `convertExpensesTo` hace para gastos, para los reportes que
 * tienen que juntar ventas, comisiones y gastos —cada uno con su propia moneda
 * y su propia fecha— en un único número.
 *
 * Dos reglas que vienen del resto del repo:
 *  - El TC de la tabla es siempre USD→ARS. Cualquier otro par no está modelado.
 *  - Lo que no se puede convertir NO se descarta en silencio: se acumula en
 *    `missing()` con su importe original, para que el reporte pueda decir
 *    cuánta plata quedó afuera y por qué.
 */

import { roundMoney } from "@/lib/currency"

export interface ReportMissingRate {
  currency: string
  count: number
  /** Importe ORIGINAL: no hay forma de expresarlo en la moneda de salida. */
  total: number
}

export type RateLookup = (date: string | Date) => number | null

export interface MoneyConverter {
  readonly currency: string
  /** "fixed" = un TC único para todo el período; "none" = no hay TC disponible. */
  readonly mode: "daily" | "fixed" | "none"
  /** TC único cuando `mode === "fixed"`; null en los demás casos. */
  readonly fixedRate: number | null
  /** Convierte sin registrar nada. `null` = no se pudo. */
  convert(amount: number, from: string | null | undefined, date: string | null | undefined): number | null
  /**
   * Convierte y, si no se pudo, acumula el faltante. Devuelve 0 en ese caso:
   * el llamador suma el resultado sin ramificar, y el reporte avisa aparte.
   */
  take(amount: number, from: string | null | undefined, date: string | null | undefined): number
  missing(): ReportMissingRate[]
}

export interface CreateMoneyConverterParams {
  /** Moneda de SALIDA: todo se lleva a esta. */
  currency: string
  /** TC USD→ARS de una fecha. */
  getRate?: RateLookup
  /**
   * Cotización única para todo el período. Tiene prioridad sobre `getRate`: es
   * el modo "cierre de mes", donde todo se valúa al mismo TC elegido.
   */
  fixedRate?: number | null
}

export function createMoneyConverter({
  currency,
  getRate,
  fixedRate,
}: CreateMoneyConverterParams): MoneyConverter {
  const to = (currency || "USD").toUpperCase()
  const usaFijo = fixedRate != null && Number.isFinite(fixedRate) && fixedRate > 0
  const rateFor: RateLookup = usaFijo ? () => fixedRate! : getRate ?? (() => null)
  const mode: MoneyConverter["mode"] = usaFijo ? "fixed" : getRate ? "daily" : "none"

  const missingAgg = new Map<string, { count: number; total: number }>()

  const convert = (
    amount: number,
    from: string | null | undefined,
    date: string | null | undefined
  ): number | null => {
    const value = Number(amount)
    if (!Number.isFinite(value)) return null

    const source = (from || to).toUpperCase()
    if (source === to) return roundMoney(value)

    const rate = date ? rateFor(date) : null
    if (!rate || !Number.isFinite(rate) || rate <= 0) return null

    if (source === "USD" && to === "ARS") return roundMoney(value * rate)
    if (source === "ARS" && to === "USD") return roundMoney(value / rate)

    // Cualquier otra combinación de monedas no está modelada.
    return null
  }

  return {
    currency: to,
    mode,
    fixedRate: usaFijo ? fixedRate! : null,
    convert,
    take(amount, from, date) {
      const converted = convert(amount, from, date)
      if (converted != null) return converted
      const code = (from || "?").toUpperCase()
      const prev = missingAgg.get(code)
      missingAgg.set(code, {
        count: (prev?.count || 0) + 1,
        total: (prev?.total || 0) + (Number(amount) || 0),
      })
      return 0
    },
    missing() {
      return Array.from(missingAgg.entries())
        .map(([code, g]) => ({ currency: code, count: g.count, total: roundMoney(g.total) }))
        .sort((a, b) => b.total - a.total)
    },
  }
}
