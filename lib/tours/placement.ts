// Dónde ubicar la tarjeta de la guía respecto del elemento que ilumina.
//
// Puro y sin DOM: recibe medidas y devuelve la decisión. Vive en lib/ para
// poder probarlo, porque es el tipo de regla que se rompe en silencio — el
// síntoma es una tarjeta cortada contra el borde de la pantalla, que no falla
// ningún test de integración pero deja el texto sin leer.

/**
 * "center" no es un lado: es la renuncia a anclar.
 *
 * Cuando la tarjeta no entra en ninguno de los cuatro lados, elegir el "menos
 * malo" la deja cortada contra el borde y el usuario pierde el texto y los
 * botones. Centrarla siempre entra; el spotlight sigue marcando el campo, que
 * es lo que de verdad hace falta que se vea.
 */
export type Side = "top" | "bottom" | "left" | "right" | "center"
export type Align = "start" | "center" | "end"

export interface PlacementInput {
  /** Preferencia declarada en el paso. */
  preferred: Side
  align: Align
  /** Rect del elemento iluminado, en coordenadas de viewport. */
  rect: { top: number; left: number; width: number; height: number }
  viewport: { width: number; height: number }
}

/**
 * Alto que hay que reservar arriba o abajo para que la tarjeta entre.
 * Con el detalle plegado ronda 200-280px; 320 deja aire para el offset y para
 * los títulos de dos líneas.
 */
export const CARD_VERTICAL_ROOM = 320

/**
 * Ancho que hay que reservar al costado: la tarjeta mide 360 más el offset.
 *
 * Sin este chequeo, un elemento que ocupa casi todo el ancho del diálogo mandaba
 * la tarjeta a un costado donde no entraba y la dejaba mitad afuera de la
 * pantalla — peor que el problema que el costado venía a resolver.
 */
export const CARD_HORIZONTAL_ROOM = 390

/**
 * El `placement` del paso es una preferencia, no una orden.
 *
 * Lo que decide es cuánto aire queda: si ni arriba ni abajo entra la tarjeta,
 * se va al costado, que es espacio que casi siempre está libre. Mirar el alto
 * del elemento no alcanzaba — un campo chico pegado al borde de la pantalla
 * deja igual de poco lugar que una tarjeta enorme.
 */
export function resolvePlacement({
  preferred,
  align,
  rect,
  viewport,
}: PlacementInput): { side: Side; align: Align } {
  // Una preferencia lateral se respeta: quien la puso ya sabía que arriba o
  // abajo no servía.
  if (preferred === "left" || preferred === "right") return { side: preferred, align }

  const above = rect.top
  const below = viewport.height - (rect.top + rect.height)

  if (preferred === "top" && above >= CARD_VERTICAL_ROOM) return { side: "top", align }
  if (preferred === "bottom" && below >= CARD_VERTICAL_ROOM) return { side: "bottom", align }
  // Si entra el opuesto, Radix lo iba a voltear solo; lo hacemos explícito para
  // que la decisión quede acá y se pueda probar.
  if (above >= CARD_VERTICAL_ROOM) return { side: "top", align }
  if (below >= CARD_VERTICAL_ROOM) return { side: "bottom", align }

  // No entra ni arriba ni abajo: al costado, pero solo si de verdad cabe.
  const roomLeft = rect.left
  const roomRight = viewport.width - (rect.left + rect.width)
  const best = roomRight >= roomLeft ? "right" : "left"
  if (Math.max(roomLeft, roomRight) >= CARD_HORIZONTAL_ROOM) {
    return { side: best, align: "center" }
  }

  // Tampoco entra al costado: pasa con un campo que ocupa casi todo el ancho de
  // un diálogo, en una pantalla baja. Devolver igual el lado "menos malo" no
  // servía — Radix la ubica donde pedimos y la deja cortada contra el borde.
  return { side: "center", align: "center" }
}
