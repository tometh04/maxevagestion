/**
 * Decide si `recalculateOperationTotals` debe ABSTENERSE de pisar los totales
 * agregados de la operación (sale_amount_total, operator_cost, margin_amount)
 * a partir de `operation_services`.
 *
 * Contexto: existen dos modelos de compra independientes.
 *  - operation_operators + campos base en `operations`  (modelo operador)
 *  - operation_services                                 (modelo por servicio)
 *
 * Recalcular los totales desde `operation_services` sólo es válido cuando la op
 * es puramente "por servicio". Si la op:
 *   - tiene operadores (modelo operador), o
 *   - no le quedan servicios,
 * entonces los totales los gestiona el otro modelo (trigger operation_operators
 * / edición manual / read-time) y recalcular los destruiría.
 *
 * Incidentes que esto previene (VICO):
 *   - a3bb84e1: se agregó un servicio y se borró → 0 servicios → recalc sumaba
 *     un set vacío y ponía sale/costo/margen = 0.
 *   - OP-20260518-3C89DA03: op modelo operador; al recalcular desde un único
 *     servicio con sale/cost 0 los totales base quedaban en 0.
 */
export function shouldSkipOperatorModelRecalc(
  operatorRowCount: number,
  serviceCount: number
): boolean {
  return operatorRowCount > 0 || serviceCount === 0
}
