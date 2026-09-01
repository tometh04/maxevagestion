/**
 * Las clases de comisión, y cuáles NO produce el plan de la operación.
 *
 * `applyCommissionPlan` arma un plan a partir del margen de la operación y
 * después BARRE: toda fila cuyo vendedor no figure en ese plan se borra
 * físicamente. Ese barrido corre en casi cualquier edición de la operación o de
 * sus servicios.
 *
 * Por eso, cada vez que aparece una clase de comisión que no nace del margen,
 * hay que excluirla de la lectura del plan o el barrido se la lleva puesta:
 *
 *   * `SERVICE` (VIB-172): tiene su propio vendedor, su propio porcentaje y su
 *     propio mes; no se deriva del margen de la operación.
 *   * `ADJUSTMENT` (VIB-174): es la corrección por liquidación de operador. Se
 *     imputa al mes en que llegó la liquidación, puede ser negativa, y una
 *     operación puede acumular varias.
 *
 * Tener el criterio en un solo lugar es lo que evita que la próxima clase se
 * agregue en dos de los tres filtros y desaparezca en el tercero.
 */

export const COMMISSION_KINDS = ["SELLER", "ADVISOR_MANAGER", "SERVICE", "ADJUSTMENT"] as const

export type CommissionKind = (typeof COMMISSION_KINDS)[number]

/** Clases que NO produce `applyCommissionPlan` y que su barrido no debe tocar. */
export const KINDS_FUERA_DEL_PLAN: CommissionKind[] = ["SERVICE", "ADJUSTMENT"]

/**
 * Filtro PostgREST para excluirlas: `.not("kind", "in", KINDS_FUERA_DEL_PLAN_FILTER)`.
 *
 * Se arma acá y no en cada caller para que agregar una clase nueva a la lista
 * alcance para que todos la excluyan.
 */
export const KINDS_FUERA_DEL_PLAN_FILTER = `(${KINDS_FUERA_DEL_PLAN.join(",")})`

/** true si esa fila la produce el plan de la operación. */
export function esComisionDelPlan(kind: string | null | undefined): boolean {
  return !KINDS_FUERA_DEL_PLAN.includes((kind ?? "SELLER") as CommissionKind)
}
