/**
 * Diferencia de cambio — VIB-141 (D).
 *
 * CUÁNDO EXISTE UNA DIFERENCIA DE CAMBIO
 * --------------------------------------
 * Solo cuando una partida está en una moneda distinta a la funcional de la
 * agencia. Eso da dos casos distintos, y una agencia puede tener uno, el otro o
 * ninguno:
 *
 *   1. **Al cobrar una deuda en otra moneda** (`calcularDiferenciaPorCobro`).
 *      Una agencia que lleva sus libros en PESOS y vende en dólares tiene una
 *      cuenta por cobrar en dólares: cada cobro la cancela a un tipo de cambio
 *      distinto al del reconocimiento, y esa diferencia es resultado financiero.
 *
 *   2. **Al revaluar saldos en otra moneda** (`calcularRevaluacion`). Una
 *      agencia que lleva sus libros en DÓLARES y tiene plata en pesos: esos
 *      pesos valen distinto al cierre que cuando entraron.
 *
 * Para Lozada, que lleva todo en dólares y vende en dólares, el caso 1 NO
 * aplica: cuando un cliente paga en pesos, esos pesos cancelan deuda en dólares
 * y no hay diferencia. Su exposición es el caso 2, que es exactamente lo que
 * pidió el cliente: "los saldos en usd los mantenemos, los que habría que
 * reevaluar son los saldos en $".
 *
 * POR QUÉ PROPORCIONAL Y NO AL CANCELARSE
 * ---------------------------------------
 * Se reconoce la diferencia en CADA cobro, por la parte de deuda que ese cobro
 * cancela, y no recién cuando la operación termina de cobrarse. Es más trabajo,
 * pero es lo correcto: una agencia cobra en cuotas a lo largo de meses, y
 * concentrar toda la diferencia en el mes del último pago pondría el resultado
 * en un período al que no pertenece.
 */

export type Moneda = "ARS" | "USD"

export type TipoDiferencia = "FX_GAIN" | "FX_LOSS"

export interface Diferencia {
  /** Importe en la moneda funcional. Siempre positivo. */
  monto: number
  tipo: TipoDiferencia | null
}

const redondear = (n: number) => Math.round(n * 100) / 100

/**
 * Menos de un centavo de la moneda funcional no se registra: sería ruido de
 * redondeo, no un hecho económico.
 */
const UMBRAL = 0.01

function clasificar(diferencia: number): Diferencia {
  if (Math.abs(diferencia) < UMBRAL) return { monto: 0, tipo: null }
  return {
    monto: redondear(Math.abs(diferencia)),
    tipo: diferencia > 0 ? "FX_GAIN" : "FX_LOSS",
  }
}

/** Pasa un importe a la moneda funcional. La cotización siempre es ARS por USD. */
function aFuncional(monto: number, moneda: Moneda, funcional: Moneda, cotizacion: number): number {
  if (moneda === funcional) return monto
  return funcional === "USD" ? monto / cotizacion : monto * cotizacion
}

export interface CobroParams {
  /** Importe cobrado, en la moneda en la que se cobró. */
  montoCobrado: number
  monedaCobro: Moneda
  /** Cotización del día del cobro (ARS por USD). */
  cotizacionCobro: number
  /** Moneda en la que está denominada la deuda (la de la venta). */
  monedaDeuda: Moneda
  /** Cotización a la que se reconoció la deuda (ARS por USD). */
  cotizacionReconocimiento: number
  monedaFuncional: Moneda
}

/**
 * Diferencia de cambio generada por un cobro que cancela parte de una deuda.
 *
 * La idea: el cobro cancela una porción de la deuda. Esa porción está
 * registrada en los libros a la cotización del reconocimiento. Si lo que
 * efectivamente entró vale distinto, la diferencia es resultado financiero.
 *
 * Devuelve tipo null cuando no hay diferencia que reconocer, que es el caso
 * más común: cuando la deuda ya está en la moneda funcional.
 */
export function calcularDiferenciaPorCobro(p: CobroParams): Diferencia {
  if (p.montoCobrado <= 0) return { monto: 0, tipo: null }
  if (p.cotizacionCobro <= 0 || p.cotizacionReconocimiento <= 0) return { monto: 0, tipo: null }

  // Si la deuda está en la moneda funcional, cobrarla no genera diferencia:
  // el cobro simplemente cancela deuda por su equivalente. La exposición pasa
  // a estar en el saldo cobrado, y eso lo resuelve la revaluación.
  if (p.monedaDeuda === p.monedaFuncional) return { monto: 0, tipo: null }

  // Cuánta deuda cancela este cobro, expresado en la moneda de la deuda.
  const deudaCancelada = aFuncional(
    p.montoCobrado,
    p.monedaCobro,
    p.monedaDeuda,
    p.cotizacionCobro
  )

  // Valor de esa porción según los libros: al tipo de cambio del
  // reconocimiento.
  const valorEnLibros = aFuncional(
    deudaCancelada,
    p.monedaDeuda,
    p.monedaFuncional,
    p.cotizacionReconocimiento
  )

  // Valor de lo que efectivamente entró, al tipo de cambio del cobro.
  const valorRecibido = aFuncional(
    p.montoCobrado,
    p.monedaCobro,
    p.monedaFuncional,
    p.cotizacionCobro
  )

  return clasificar(valorRecibido - valorEnLibros)
}

export interface RevaluacionParams {
  /** Saldo de la cuenta, en su propia moneda. */
  saldo: number
  monedaSaldo: Moneda
  monedaFuncional: Moneda
  /** Cotización a la que está valuado hoy en los libros. */
  cotizacionAnterior: number
  /** Cotización de cierre del período. */
  cotizacionCierre: number
}

/**
 * Diferencia por revaluar un saldo en otra moneda al cierre del período.
 *
 * Es el caso de una agencia que lleva sus libros en dólares y tiene pesos en la
 * caja: esos pesos valen distinto al cierre que cuando entraron, y esa
 * diferencia es resultado del período aunque no haya habido ningún movimiento.
 */
export function calcularRevaluacion(p: RevaluacionParams): Diferencia {
  if (p.saldo === 0) return { monto: 0, tipo: null }
  if (p.cotizacionAnterior <= 0 || p.cotizacionCierre <= 0) return { monto: 0, tipo: null }

  // Un saldo que ya está en la moneda funcional no se revalúa: vale lo que dice.
  if (p.monedaSaldo === p.monedaFuncional) return { monto: 0, tipo: null }

  const valorAnterior = aFuncional(p.saldo, p.monedaSaldo, p.monedaFuncional, p.cotizacionAnterior)
  const valorCierre = aFuncional(p.saldo, p.monedaSaldo, p.monedaFuncional, p.cotizacionCierre)

  return clasificar(valorCierre - valorAnterior)
}

/** Códigos del plan donde va cada lado de la diferencia. */
export const CUENTAS_DIFERENCIA = {
  FX_GAIN: "4.1.05", // Diferencia de Cambio Positiva
  FX_LOSS: "4.3.13", // Diferencia de Cambio Negativa
} as const
