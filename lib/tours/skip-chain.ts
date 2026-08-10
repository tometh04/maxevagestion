// Cuándo dejar de saltear pasos cuyo ancla no apareció.
//
// Saltear de a uno es correcto: un paso puede apuntar a un campo condicional
// que hoy no está montado. Encadenar salteos sin límite no lo es. Si el usuario
// cierra el diálogo a mitad de una guía de formulario, TODOS los pasos que
// quedan pierden su ancla, la cadena se pasa del último y el tour termina solo.
// Lo que se ve es que se apaga todo de golpe: sin tarjeta, sin atenuado y sin
// ninguna explicación de por qué.
//
// Puro y sin React para poder probarlo: es lógica de control de flujo, no de
// renderizado.

/**
 * Cuántos pasos seguidos se pueden saltear antes de asumir que el problema no
 * es un campo condicional sino que el contexto desapareció.
 *
 * Tres cubre el caso legítimo más largo que existe hoy (en el alta de operación
 * hay tres condicionales consecutivos alrededor de la comisión compartida) sin
 * llegar a vaciar una guía entera.
 */
export const MAX_SKIP_CHAIN = 3

export interface SkipChainInput {
  /** Lo que el paso declara si su ancla no aparece. */
  onMissing?: "skip" | "center"
  /** Salteos consecutivos sin que se haya dibujado ningún paso en el medio. */
  consecutiveSkips: number
}

/**
 * Un `false` acá no rompe nada: el overlay ya dibuja la tarjeta centrada cuando
 * el ancla falta, así que cortar la cadena deja al usuario viendo el paso donde
 * está, con sus botones, en vez de dejarlo sin nada.
 */
export function shouldSkipMissingStep({ onMissing, consecutiveSkips }: SkipChainInput): boolean {
  if (onMissing === "center") return false
  return consecutiveSkips < MAX_SKIP_CHAIN
}
