/**
 * Decide si el reparto de comisión de una operación es automático o manual
 * (VIB-63).
 *
 * Vive en `lib/` y no dentro de las rutas por dos motivos: la regla estaba
 * duplicada entre POST y PATCH —y las versiones duplicadas de la validación
 * anterior ya habían divergido entre sí—, y acá se puede probar sin montar el
 * request entero.
 *
 * - `AUTO`: los `commission_pct_*` son un snapshot de salida y el servidor
 *   recalcula el reparto a partir del porcentaje y el modo de cada vendedor.
 * - `MANUAL`: alguien fijó los porcentajes a mano y el recálculo no los pisa.
 */

export type CommissionSplitMode = "AUTO" | "MANUAL"

const TOLERANCE = 0.001

function isSet(value: unknown): boolean {
  return value != null && value !== "" && Number.isFinite(Number(value))
}

/**
 * Alta de operación. Solo un reparto explícito y completo arranca en MANUAL.
 *
 * Sin secundario no hay reparto que congelar. Y con un solo porcentaje cargado
 * tampoco: el otro quedaría implícito y sería justo el escenario del bug, donde
 * un valor faltante se convertía en un cero.
 */
export function splitModeForCreate(input: {
  secondarySellerId: string | null | undefined
  pctPrimary: unknown
  pctSecondary: unknown
}): CommissionSplitMode {
  if (!input.secondarySellerId) return "AUTO"
  return isSet(input.pctPrimary) && isSet(input.pctSecondary) ? "MANUAL" : "AUTO"
}

/**
 * Edición de operación. Devuelve `null` cuando el modo no debe cambiar.
 *
 * El caso sutil: el formulario de edición reenvía los porcentajes que ya tenía
 * la operación, y en AUTO esos valores son el snapshot que escribió el propio
 * servidor. Si eso contara como edición manual, cambiar la fecha de una
 * operación la congelaría y dejaría de recalcularse para siempre.
 */
export function splitModeForUpdate(input: {
  /** true si el PATCH deja la operación sin vendedor secundario. */
  secondaryRemoved: boolean
  incomingPctPrimary: unknown
  incomingPctSecondary: unknown
  storedPctPrimary: unknown
  storedPctSecondary: unknown
}): CommissionSplitMode | null {
  // Sin secundario no hay reparto: los porcentajes congelados eran de un
  // reparto que ya no existe.
  if (input.secondaryRemoved) return "AUTO"

  if (!isSet(input.incomingPctPrimary) || !isSet(input.incomingPctSecondary)) {
    return null
  }

  const igualAlSnapshot =
    isSet(input.storedPctPrimary) &&
    isSet(input.storedPctSecondary) &&
    Math.abs(Number(input.incomingPctPrimary) - Number(input.storedPctPrimary)) < TOLERANCE &&
    Math.abs(Number(input.incomingPctSecondary) - Number(input.storedPctSecondary)) < TOLERANCE

  return igualAlSnapshot ? null : "MANUAL"
}
