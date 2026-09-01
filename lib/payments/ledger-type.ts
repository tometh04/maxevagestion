/**
 * Tipo de `ledger_movements` que le corresponde a un pago.
 *
 * POR QUÉ EXISTE
 * --------------
 * La regla estaba escrita cuatro veces: en el alta (`POST /api/payments`), en
 * `mark-paid`, en el `PATCH` que recrea el movimiento, y —mal— en el fallback
 * del `DELETE`. Las tres primeras coincidían; la cuarta se había quedado en una
 * versión vieja de dos ramas:
 *
 *     direction === "INCOME" ? "INCOME" : "OPERATOR_PAYMENT"
 *
 * Con eso, el borrado de una **devolución al cliente** (`EXPENSE` +
 * `CUSTOMER`) buscaba un `OPERATOR_PAYMENT` y no encontraba nada: el egreso
 * quedaba vivo en el mayor con `affects_balance = true` mientras su movimiento
 * de caja sí se borraba, y Caja y Mayor quedaban descuadrados.
 *
 * Que el alta y el borrado deduzcan el tipo del MISMO lugar es lo que evita que
 * vuelvan a separarse.
 */

export type PaymentLedgerType = "INCOME" | "EXPENSE" | "OPERATOR_PAYMENT"

export interface PaymentLedgerTypeInput {
  /** "INCOME" = entra plata; cualquier otra cosa = sale. */
  direction: string | null | undefined
  /** "OPERATOR" = pago a proveedor; "CUSTOMER" = cobro o devolución. */
  payer_type: string | null | undefined
}

/**
 * Un cobro es `INCOME`. Una salida es `OPERATOR_PAYMENT` si va a un operador y
 * `EXPENSE` si va al cliente (devolución de seña o reintegro).
 */
export function paymentLedgerType(payment: PaymentLedgerTypeInput): PaymentLedgerType {
  if (payment.direction === "INCOME") return "INCOME"
  return payment.payer_type === "OPERATOR" ? "OPERATOR_PAYMENT" : "EXPENSE"
}
