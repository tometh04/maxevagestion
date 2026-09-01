/**
 * Forma canónica de un vendedor en los selectores de la aplicación (VIB-63).
 *
 * ── Por qué existe este archivo ────────────────────────────────────────────
 *
 * Las pantallas de Operaciones y CRM armaban su propia lista de vendedores con
 * `.select("id, name")` y un `.map(s => ({ id, name }))`. Los diálogos que la
 * consumen declaraban el porcentaje como opcional
 * (`default_commission_percentage?: number | null`), así que TypeScript no tenía
 * nada que objetar cuando el dato no llegaba: el diálogo leía `?? 0`, calculaba
 * la mitad de cero y mandaba un reparto 0/0. Toda venta compartida cargada desde
 * Operaciones nacía sin comisión para ninguno de los dos.
 *
 * El campo es **requerido en el tipo aunque su valor pueda ser null**. Esa es la
 * parte que importa: un `.map()` que lo olvide deja de compilar en vez de
 * fallar en silencio contra la plata de alguien.
 *
 * El servidor ya no depende de estos números para calcular (ver
 * `lib/commissions/calculate.ts`), pero la pantalla los necesita para mostrar el
 * reparto antes de guardar.
 */

export interface SellerOption {
  id: string
  name: string
  /**
   * Porcentaje de comisión EFECTIVO: el que el servidor va a usar de verdad.
   *
   * El nombre viene de la columna `users.default_commission_percentage`, pero
   * esa columna es sólo la segunda de tres fuentes: una regla propia en
   * `commission_rules` le hace shadowing, y como la columna es write-once
   * (sólo se escribe al dar de alta al usuario) queda vieja apenas alguien
   * toca Reglas de Comisiones. Quien arme esta lista tiene que pasarla por
   * `resolveEffectiveSellerOptions`, o el tope de las ventas compartidas va a
   * mostrar un número que el servidor no comparte (VIB-173).
   *
   * `null` = sin configurar en ninguna fuente, distinto de 0.
   */
  default_commission_percentage: number | null
}

/** Columnas a pedirle a `users` para construir un `SellerOption`. */
export const SELLER_OPTION_SELECT = "id, name, default_commission_percentage"

/** Roles que pueden figurar como vendedor de una operación. */
export const SELLER_OPTION_ROLES = ["SELLER", "ADMIN", "SUPER_ADMIN", "POST_VENTA"]

/**
 * `effective_commission_percentage` le gana a la columna de la ficha cuando
 * viene: es lo que devuelve `/api/users` ya resuelto contra `commission_rules`
 * (VIB-173). Las filas crudas de `users` no lo traen y caen a la columna, que
 * es el comportamiento de siempre.
 */
export function toSellerOption(row: any): SellerOption {
  const raw =
    row?.effective_commission_percentage !== undefined
      ? row.effective_commission_percentage
      : row?.default_commission_percentage
  const value = raw == null ? null : Number(raw)
  return {
    id: row?.id,
    name: row?.name ?? "",
    default_commission_percentage: value != null && Number.isFinite(value) ? value : null,
  }
}

export function toSellerOptions(rows: any[] | null | undefined): SellerOption[] {
  return (rows || []).map(toSellerOption)
}
