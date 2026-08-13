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
  /** Porcentaje de comisión. `null` = sin configurar, distinto de 0. */
  default_commission_percentage: number | null
}

/** Columnas a pedirle a `users` para construir un `SellerOption`. */
export const SELLER_OPTION_SELECT = "id, name, default_commission_percentage"

/** Roles que pueden figurar como vendedor de una operación. */
export const SELLER_OPTION_ROLES = ["SELLER", "ADMIN", "SUPER_ADMIN", "POST_VENTA"]

export function toSellerOption(row: any): SellerOption {
  const raw = row?.default_commission_percentage
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
