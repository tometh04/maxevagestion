// Registro de guías + resolución de qué guía corresponde a una ruta.
//
// Puro y sin efectos: la UI le pregunta "¿qué guía va en este pathname?" y el
// registry responde. Agregar una guía nueva es agregar un archivo en
// definitions/ y sumarlo a TOURS.

import type { TourDefinition } from "./types"
import { ALL_TOURS } from "./definitions"

export const TOURS: TourDefinition[] = ALL_TOURS

export const TOUR_IDS: string[] = TOURS.map((t) => t.id)

export function getTourById(id: string): TourDefinition | null {
  return TOURS.find((t) => t.id === id) ?? null
}

/** Quita query, hash y slash final. `usePathname()` ya viene sin query. */
export function normalizePath(pathname: string): string {
  const clean = pathname.split("?")[0].split("#")[0]
  if (clean.length > 1 && clean.endsWith("/")) return clean.slice(0, -1)
  return clean || "/"
}

function segments(path: string): string[] {
  return normalizePath(path).split("/").filter(Boolean)
}

function isDynamic(segment: string): boolean {
  return segment.startsWith("[") && segment.endsWith("]")
}

/**
 * Matchea un pathname contra un patrón y devuelve su especificidad, o -1 si no
 * matchea. Un segmento estático pesa más que uno dinámico, así que
 * `/operations/billing` le gana a `/operations/[id]` sobre la misma URL.
 */
function matchScore(pattern: string, pathname: string): number {
  const pat = segments(pattern)
  const path = segments(pathname)

  const prefixMatch = pat[pat.length - 1] === "*"
  const compare = prefixMatch ? pat.slice(0, -1) : pat

  if (prefixMatch ? path.length < compare.length : path.length !== compare.length) return -1

  let score = 0
  for (let i = 0; i < compare.length; i++) {
    const p = compare[i]
    if (isDynamic(p)) {
      if (!path[i]) return -1
      score += 1
    } else {
      if (p !== path[i]) return -1
      score += 2
    }
  }
  // El prefijo es lo menos específico: pierde ante un match exacto del mismo largo.
  return prefixMatch ? score : score + 1
}

/**
 * ¿Esta ruta pertenece al recorrido de la guía?
 *
 * No alcanza con `match`: el tour de configuración inicial navega a propósito a
 * /accounting/financial-accounts, que no es una de sus rutas de disparo. Por eso
 * también cuentan las rutas declaradas por sus pasos.
 *
 * Se usa para cortar una guía cuando el usuario se va a otra pantalla: sin esto
 * la tarjeta lo sigue y queda apuntando a la nada.
 */
export function tourCoversPath(tour: TourDefinition, pathname: string): boolean {
  const normalized = normalizePath(pathname)
  if (tour.steps.some((step) => step.route && normalizePath(step.route) === normalized)) return true
  if (tour.exclude?.some((ex) => normalizePath(ex) === normalized)) return false
  return tour.match.some((pattern) => matchScore(pattern, normalized) >= 0)
}

/**
 * Devuelve la guía que corresponde a una ruta, o null. Ante varias que matcheen
 * gana la más específica: `/operations/abc-123` → `operation-detail`, no
 * `operations-list`.
 */
export function resolveTourForPath(pathname: string): TourDefinition | null {
  const normalized = normalizePath(pathname)

  let best: TourDefinition | null = null
  let bestScore = -1

  for (const tour of TOURS) {
    // Las guías de formulario comparten ruta con la de su pantalla (el diálogo
    // no tiene URL propia). Si compitieran acá, una de ellas podría terminar
    // auto-disparándose o siendo "la guía de esta pantalla", y sus anclas viven
    // dentro de un diálogo que en ese momento está cerrado.
    if (tour.kind === "form") continue
    if (tour.exclude?.some((ex) => normalizePath(ex) === normalized)) continue

    const score = tour.match.reduce((max, pattern) => {
      const s = matchScore(pattern, normalized)
      return s > max ? s : max
    }, -1)
    if (score < 0) continue

    const effective = tour.priority ?? score
    if (effective > bestScore) {
      best = tour
      bestScore = effective
    }
  }

  return best
}
