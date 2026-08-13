/**
 * Aritmética del reporte de Ganancias (provisión trimestral estimada).
 *
 * Existe como módulo aparte por un solo invariante, que es el que se rompía:
 * **cada moneda se resta de la suya**. La versión anterior sumaba las comisiones
 * de todo el trimestre en un número único —ARS y USD juntos— y lo restaba
 * únicamente del resultado en dólares. O sea que las comisiones en pesos
 * achicaban la provisión en USD peso por dólar, y el resultado impositivo en ARS
 * no descontaba ninguna comisión. Lo mismo pasaba con las retenciones sufridas:
 * la query traía `currency` y no lo usaba.
 *
 * La regla dura del repo es que ARS y USD nunca se suman entre sí (ver
 * `lib/commissions/currency.ts`). Acá se cumple por construcción: la función
 * corre el mismo cálculo dos veces, una por moneda, sin ningún punto donde las
 * dos se toquen. No hay conversión por tipo de cambio a propósito — esto es una
 * provisión estimada, y meter un TC acá inventaría un número que después nadie
 * puede explicar frente al contador.
 */

export type GananciasCurrency = "ARS" | "USD"

/** Un importe en las dos monedas, siempre separadas. */
export interface AmountByCurrency {
  ars: number
  usd: number
}

export interface GananciasCalcInput {
  /** Margen de las operaciones del trimestre. */
  margin: AmountByCurrency
  /** Gastos deducibles: los únicos que bajan el resultado impositivo. */
  deductibleExpenses: AmountByCurrency
  /** Todos los gastos, deducibles o no: van al resultado contable. */
  totalExpenses: AmountByCurrency
  /** Comisiones de vendedores devengadas en el trimestre. */
  commissions: AmountByCurrency
  /** Retenciones de Ganancias sufridas: se descuentan de la provisión. */
  withholdings: AmountByCurrency
  /** Alícuota en porcentaje (0-100). */
  ratePercent: number
}

export interface GananciasCalcResult {
  /** Base imponible: margen − gastos deducibles − comisiones. */
  taxableResult: AmountByCurrency
  /** Resultado contable: margen − todos los gastos − comisiones. */
  profitBeforeTax: AmountByCurrency
  /** Provisión bruta: base imponible × alícuota, nunca negativa. */
  provision: AmountByCurrency
  /** Provisión neta de retenciones sufridas, nunca negativa. */
  provisionNet: AmountByCurrency
}

const CURRENCIES: GananciasCurrency[] = ["ARS", "USD"]

/** Redondeo a centavos. Evita colas de floating point en un número contable. */
function round2(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100
}

function emptyAmount(): AmountByCurrency {
  return { ars: 0, usd: 0 }
}

const KEY: Record<GananciasCurrency, keyof AmountByCurrency> = {
  ARS: "ars",
  USD: "usd",
}

export function computeGananciasResult(input: GananciasCalcInput): GananciasCalcResult {
  const rate = (Number(input.ratePercent) || 0) / 100

  const taxableResult = emptyAmount()
  const profitBeforeTax = emptyAmount()
  const provision = emptyAmount()
  const provisionNet = emptyAmount()

  for (const currency of CURRENCIES) {
    const k = KEY[currency]
    const margin = Number(input.margin?.[k]) || 0
    const deductible = Number(input.deductibleExpenses?.[k]) || 0
    const total = Number(input.totalExpenses?.[k]) || 0
    const commissions = Number(input.commissions?.[k]) || 0
    const withheld = Number(input.withholdings?.[k]) || 0

    taxableResult[k] = round2(margin - deductible - commissions)
    profitBeforeTax[k] = round2(margin - total - commissions)

    // Una base imponible negativa no genera provisión: es quebranto, y el
    // tratamiento del quebranto no lo resuelve esta estimación.
    const gross = Math.max(0, round2(taxableResult[k] * rate))
    provision[k] = gross
    // La retención sufrida solo puede llevar la provisión a cero, no a favor:
    // el saldo a favor se arrastra en la DDJJ, no en esta pantalla.
    provisionNet[k] = Math.max(0, round2(gross - withheld))
  }

  return { taxableResult, profitBeforeTax, provision, provisionNet }
}
