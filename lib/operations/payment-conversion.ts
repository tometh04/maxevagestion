/**
 * Conversión de un pago a la moneda de la operación.
 *
 * POR QUÉ ESTÁ ACÁ Y NO INLINE EN UNA ROUTE
 * -----------------------------------------
 * Esta regla decide cuánto "cobró" una operación cuando el pago vino en otra
 * moneda, y no es un caso de borde: 402 de las 1.793 operaciones con cobros
 * (un 22%) tienen al menos un cobro en una moneda distinta a la de la venta, y
 * 225 tienen cobros en más de una.
 *
 * Vivía copiada dentro de `app/api/operations/route.ts`, que es la que alimenta
 * el listado que el cliente mira todos los días. El cierre contable necesita
 * exactamente el mismo número: si el cierre calculara lo cobrado con otro
 * criterio, generaría anticipos por operaciones que en pantalla figuran
 * saldadas, y el contador vería un pasivo que el vendedor no puede explicar.
 *
 * Que sea una sola función es lo que garantiza que eso no pueda pasar.
 *
 * EL CERO NO ES UN DESCUIDO
 * -------------------------
 * Si no hay forma de convertir —pago en otra moneda, sin `amount_usd` y sin
 * tipo de cambio propio— devuelve 0 en vez de tomar el importe crudo. Tomarlo
 * crudo sumaría pesos como si fueran dólares e inflaría lo cobrado por un
 * factor de mil. Devolver 0 subestima, que es el error barato: hace que la
 * operación parezca menos cobrada, nunca más.
 */

export interface PagoConvertible {
  amount: number | string | null
  currency: string | null
  exchange_rate?: number | string | null
  amount_usd?: number | string | null
}

/**
 * Lleva el importe del pago a `targetCurrency`.
 *
 * Prefiere `amount_usd` cuando el destino es USD porque es el valor que se
 * calculó y guardó en el momento del cobro, con el tipo de cambio de ese día.
 * Recalcularlo hoy con otra cotización daría un número distinto al que el
 * cliente ya vio.
 */
export function convertPaymentAmount(payment: PagoConvertible, targetCurrency: string): number {
  const paymentAmount = Number(payment.amount) || 0
  const paymentCurrency = payment.currency || "ARS"

  if (paymentCurrency === targetCurrency) return paymentAmount

  if (targetCurrency === "USD" && paymentCurrency === "ARS") {
    if (payment.amount_usd && Number(payment.amount_usd) > 0) {
      return Number(payment.amount_usd)
    }
    const rate = Number(payment.exchange_rate) || 0
    if (rate > 0) return paymentAmount / rate
    return 0
  }

  if (targetCurrency === "ARS" && paymentCurrency === "USD") {
    const rate = Number(payment.exchange_rate) || 0
    if (rate > 0) return paymentAmount * rate
    return 0
  }

  // Un par de monedas que el sistema no maneja (ni ARS ni USD). Se devuelve el
  // importe tal cual, que es lo que hacía la route: no hay conversión posible y
  // tampoco hay un criterio mejor que inventar acá.
  return paymentAmount
}
