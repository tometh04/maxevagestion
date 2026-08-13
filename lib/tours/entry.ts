// Por qué paso conviene entrar a una guía.
//
// Una ruta no siempre es una pantalla: /settings son ocho tabs. Abrir "la guía
// de esta pantalla" parado en AFIP y recibir el modal de bienvenida de la
// configuración inicial no responde a lo que el usuario pidió.
//
// La regla: si algún paso corresponde a lo que está a la vista, se entra por
// ahí. Los pasos previos siguen accesibles con el botón Atrás.
//
// Puro: recibe un predicado y no toca el DOM. Quién decide si un control está
// activo es el cliente (components/tours).

import type { TourDefinition, TourStep } from "./types"

/**
 * Ruta por la que se entra a la guía desde el menú, o null si depende de dónde
 * estés parado.
 *
 * Se lee del `route` del primer paso en vez de declararse aparte: ese campo ya
 * es el que hace navegar al motor, así que abrir desde el listado reusa el
 * mismo camino que ya funciona en vez de inventar uno paralelo.
 */
export function tourLaunchPath(tour: TourDefinition): string | null {
  return tour.steps[0]?.route ?? null
}

/**
 * Anclas cuyo estado "activo" delata que este paso es el que se está viendo.
 *
 * Se derivan del `prepare.click` en vez de declararse aparte: el control que
 * hay que activar para llegar a un paso es el mismo que indica que ya estás
 * ahí. Duplicarlo sería una segunda fuente de verdad que se desincroniza sola.
 */
export function stepContextAnchors(step: TourStep): string[] {
  if (!step.prepare?.click) return []
  return Array.isArray(step.prepare.click) ? step.prepare.click : [step.prepare.click]
}

/**
 * Índice del paso por el que entrar, dado lo que está activo en pantalla.
 * Devuelve 0 si ningún paso matchea (o si la guía no usa tabs).
 *
 * Recibe los pasos YA filtrados por permisos: el índice tiene que ser válido
 * contra la misma lista que recorre la guía.
 */
export function entryStepIndex(
  visibleSteps: TourStep[],
  isAnchorActive: (anchor: string) => boolean
): number {
  const index = visibleSteps.findIndex((step) => {
    const anchors = stepContextAnchors(step)
    return anchors.length > 0 && anchors.every(isAnchorActive)
  })
  return index >= 0 ? index : 0
}
