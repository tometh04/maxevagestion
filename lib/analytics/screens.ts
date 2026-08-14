// Identidad de PANTALLA para el event stream.
//
// El modulo responde "que area del producto usa esta agencia". La pantalla
// responde "que hace adentro". Son preguntas distintas y necesitan claves
// distintas: `/reports` es un solo pathname con doce vistas atras.
//
// Formato unico para los tres origenes, para que haya un solo GROUP BY y un
// solo formateador en la UI:
//
//   pagina  ->  /operations/:id
//   tab     ->  /reports#tab:margins
//   dialog  ->  /sales/leads#dlg:quotation-builder

import { isTenantUsagePath } from "./modules"
import { normalizePath } from "./ga/paths"

/** Techo de segmentos. Ninguna pantalla real del producto pasa de tres. */
const MAX_SEGMENTS = 3

/** Largo maximo del identificador de vista (valor de tab o nombre de dialog). */
const MAX_VIEW_LENGTH = 32

/**
 * Prefijos cuyo siguiente segmento es CONTENIDO, no una pantalla.
 *
 * `normalizePath()` conserva los slugs a proposito — para GA el slug editorial
 * de un articulo es la dimension util. Para `screen` es una fuga: los slugs
 * salen de `kb_articles`, crecen con cada articulo publicado y ensucian el
 * ranking de pantallas con filas de una sola visita.
 */
const CONTENT_SLUG_PREFIXES: readonly string[] = ["/ayuda"]

/**
 * Pantalla base a partir del pathname. `null` si la ruta no es uso de tenant.
 *
 * Nunca incluye query string: el `?q=` del buscador del admin es un leak
 * conocido y no vale la pena reabrirlo por esta dimension.
 */
export function screenFromPath(pathname: string | null | undefined): string | null {
  if (!isTenantUsagePath(pathname)) return null

  const normalized = normalizePath(pathname)
  if (normalized === "/") return "/"

  const segments = normalized.split("/").filter(Boolean)
  if (segments.length === 0) return "/"

  const out: string[] = []
  for (let i = 0; i < segments.length && out.length < MAX_SEGMENTS; i++) {
    const soFar = `/${out.join("/")}`
    // El segmento que sigue a un prefijo de contenido se colapsa entero.
    if (out.length > 0 && CONTENT_SLUG_PREFIXES.includes(soFar)) {
      out.push(":slug")
      break
    }
    out.push(segments[i])
  }

  return `/${out.join("/")}`
}

/**
 * Normaliza el identificador de una vista sin URL.
 *
 * Los valores los escriben desarrolladores (el `value` de un tab, el nombre de
 * un dialog), asi que no hay riesgo de PII — pero se acotan igual: un `value`
 * interpolado con datos seria una fuga silenciosa.
 */
export function sanitizeViewName(view: string | null | undefined): string | null {
  if (!view || typeof view !== "string") return null
  const clean = view
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, MAX_VIEW_LENGTH)
  return clean || null
}

/** Compone la clave de una vista sin URL propia. */
export function screenForView(
  base: string | null,
  kind: "tab" | "dlg",
  view: string | null | undefined
): string | null {
  const name = sanitizeViewName(view)
  if (!base || !name) return null
  return `${base}#${kind}:${name}`
}

// ---------------------------------------------------------------------------
// Dedupe
// ---------------------------------------------------------------------------
// Los tabs anidados remontan cuando cambia el tab exterior, y el wrapper emite
// en mount para poder ver los `defaultValue`. Sin ventana de dedupe, un solo
// click del usuario produce dos o tres eventos y el ranking queda inflado justo
// en las pantallas mas anidadas.

const DEDUPE_WINDOW_MS = 2000
const lastSeen = new Map<string, number>()

/** `true` si esta clave no se emitio en los ultimos 2 segundos. */
export function shouldEmitScreen(key: string, now: number = Date.now()): boolean {
  const previous = lastSeen.get(key)
  if (previous !== undefined && now - previous < DEDUPE_WINDOW_MS) return false

  lastSeen.set(key, now)

  // La cola no puede crecer sin techo en una sesion larga.
  if (lastSeen.size > 200) {
    for (const [k, t] of lastSeen) {
      if (now - t >= DEDUPE_WINDOW_MS) lastSeen.delete(k)
    }
  }
  return true
}

/** Solo para tests. */
export function __resetScreenDedupe(): void {
  lastSeen.clear()
}
