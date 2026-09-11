/**
 * Qué salida de plata es un GASTO de la agencia — VIB-149.
 *
 * Que salga plata de una cuenta no la convierte en gasto. Hay dos casos en los
 * que el egreso existe, mueve el saldo, y aun así no es un resultado del
 * período:
 *
 *  1. **Transferencia entre cuentas propias** (incluida la compra/venta de
 *     dólares). La agencia no gastó nada: cambió pesos por dólares, o pasó
 *     plata de una caja a un banco. Se registra como un par EXPENSE + INCOME
 *     espejo y las dos patas quedan marcadas con `is_internal_transfer`.
 *
 *  2. **Egreso que el usuario marcó "no es gasto"** desde Caja (VIB-125 /
 *     VIB-164): un retiro, un ajuste, un pago que no le corresponde a la
 *     agencia. La decisión ya está tomada en el producto y vive en
 *     `cash_movements.is_agency_expense`.
 *
 * El caso 2 se lee del `cash_movement` y no se copia a `ledger_movements` a
 * propósito: el flag se puede cambiar después de cargado, y dos copias del
 * mismo dato se desincronizan. La fuente de verdad sigue siendo una sola.
 *
 * POR QUÉ IMPORTA QUE SEA UN SOLO CRITERIO
 * ----------------------------------------
 * Antes de esto, un mismo movimiento podía ser "no es gasto" en el Reporte de
 * Gastos y gasto deducible en Contabilidad → Ganancias. Dos pantallas
 * contestando distinto sobre la misma plata es lo que hace que nadie confíe en
 * ninguna de las dos.
 */

/** Lo que hay que traer del movimiento para poder aplicar el criterio. */
export const AGENCY_EXPENSE_SELECT =
  "is_internal_transfer, cash_movements!cash_movements_ledger_movement_id_fkey(is_agency_expense)"

type CashMovementFlag = { is_agency_expense?: boolean | null } | null | undefined

export interface ExpenseMovementForResult {
  is_internal_transfer?: boolean | null
  /**
   * Embed de PostgREST. Llega como array (la relación es one-to-many desde el
   * lado del ledger) pero se contempla el objeto suelto por si algún caller lo
   * arma a mano.
   */
  cash_movements?: CashMovementFlag | CashMovementFlag[]
}

/**
 * true = este egreso cuenta como gasto de la agencia en un reporte de resultado.
 *
 * Ante la duda cuenta como gasto: un movimiento sin marcas es un gasto común, y
 * es la respuesta conservadora para una superficie fiscal (no descontar de más).
 */
export function isAgencyExpenseMovement(movement: ExpenseMovementForResult): boolean {
  if (movement.is_internal_transfer === true) return false

  const cash = movement.cash_movements
  const filas = Array.isArray(cash) ? cash : cash ? [cash] : []
  if (filas.some((fila) => fila?.is_agency_expense === false)) return false

  return true
}

/** Motivo por el que un egreso quedó afuera. Sirve para explicarlo en pantalla. */
export function nonExpenseReason(
  movement: ExpenseMovementForResult
): "INTERNAL_TRANSFER" | "MARKED_NOT_EXPENSE" | null {
  if (movement.is_internal_transfer === true) return "INTERNAL_TRANSFER"

  const cash = movement.cash_movements
  const filas = Array.isArray(cash) ? cash : cash ? [cash] : []
  if (filas.some((fila) => fila?.is_agency_expense === false)) return "MARKED_NOT_EXPENSE"

  return null
}
