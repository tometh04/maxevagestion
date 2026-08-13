// Normalizacion de URLs antes de mandarlas a Google Analytics.
//
// Dos problemas que resuelve este modulo:
//
// 1. CARDINALIDAD: rutas como /operations/<uuid> generan un page_path distinto
//    por operacion. GA4 colapsa dimensiones de alta cardinalidad en "(other)" y
//    los reportes quedan inservibles.
//
// 2. PII: la query string lleva texto libre. `components/admin/orgs-search-bar.tsx`
//    empuja el buscador a la URL (`?q=...`) y su placeholder es "Buscar por
//    nombre, slug, CUIT, email, ID...". Con el page_view automatico de GA4 eso
//    manda nombres de agencia, CUITs y emails a Google. Ademas
//    /auth/reset-password y /auth/accept-invite llevan `token` / `code` /
//    `access_token`.
//
// Por eso el allowlist de query es cerrado: lo que no esta listado se descarta
// entero. Agregar una clave nueva es una decision consciente, no un default.

/** Prefijos de ruta donde NO se emite telemetria. */
export const EXCLUDED_PATH_PREFIXES: readonly string[] = ["/cotizacion"]

/** Params cuyo valor es un enum chico y se conserva tal cual. */
const QUERY_ALLOWLIST_VERBATIM: readonly string[] = [
  "tab",
  "view",
  "v",
  "kind",
  "status",
  "plan",
  "checkout",
  "page",
  "range",
  "dateField",
  "currency",
  "type",
]

/** Params cuya clave interesa pero el valor es un identificador: se enmascara. */
const QUERY_ALLOWLIST_MASKED: readonly string[] = [
  "agencyId",
  "leadId",
  "invoiceId",
  "assetId",
  "operationId",
]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DIGITS_RE = /^\d+$/
const MAX_SEGMENT_LENGTH = 48

/**
 * `true` si en `pathname` se puede emitir telemetria.
 *
 * `/cotizacion/*` son las vistas publicas por token que abren los clientes
 * finales de la agencia: audiencia distinta, y no consintieron nada.
 *
 * El chequeo es por limite de segmento a proposito: `/cotizaciones` (si algun
 * dia existe) NO debe quedar excluido por compartir prefijo de string.
 */
export function isAnalyticsEnabledPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return !EXCLUDED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

/**
 * Colapsa los segmentos variables de un pathname.
 *
 * UUID o numero -> `:id`; blob opaco largo -> `:token`; el resto se conserva
 * como literal para que `new`, `billing`, `credit-note` y los slugs editoriales
 * de `/ayuda/[slug]` sigan siendo distinguibles en los reportes.
 */
export function normalizePath(pathname: string | null | undefined): string {
  if (!pathname) return "/"

  const segments = pathname.split("/").filter(Boolean)
  if (segments.length === 0) return "/"

  const normalized = segments.map((segment) => {
    const decoded = safeDecode(segment)

    if (UUID_RE.test(decoded)) return ":id"
    if (DIGITS_RE.test(decoded)) return ":id"

    // Blob opaco: largo y sin forma de palabras separadas por guiones. Cubre los
    // tokens de cotizacion y cualquier base64/jwt que aparezca en el path.
    if (decoded.length > 32 && !/^[a-z0-9]+(-[a-z0-9]+)+$/i.test(decoded)) {
      return ":token"
    }

    return decoded
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, MAX_SEGMENT_LENGTH)
  })

  return `/${normalized.join("/")}`
}

/**
 * Aplica el allowlist a la query string y devuelve `""` o `"?a=b&c=d"`.
 *
 * Las claves salen ordenadas alfabeticamente para que el resultado sea estable:
 * el componente de pageview dedupea por este string, y un orden inestable
 * mandaria hits repetidos.
 *
 * Efecto util del allowlist: como `q` se descarta, el debounce de
 * `/admin/orgs?q=J` -> `?q=Ju` -> `?q=Jua` colapsa al mismo string y no genera
 * un page_view por tecla.
 */
export function normalizeQuery(
  search: string | URLSearchParams | null | undefined
): string {
  if (!search) return ""

  let params: URLSearchParams
  try {
    params =
      typeof search === "string"
        ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
        : search
  } catch {
    return ""
  }

  const kept: Array<[string, string]> = []

  params.forEach((value, key) => {
    if (QUERY_ALLOWLIST_MASKED.includes(key)) {
      kept.push([key, ":id"])
      return
    }
    if (!QUERY_ALLOWLIST_VERBATIM.includes(key)) return

    const clean = value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32)
    if (!clean) return
    kept.push([key, clean])
  })

  if (kept.length === 0) return ""

  kept.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  return `?${kept.map(([k, v]) => `${k}=${v}`).join("&")}`
}

/**
 * URL absoluta ya saneada, para pisar el `page_location` que gtag derivaria solo
 * de `document.location`.
 */
export function buildPageLocation(
  origin: string,
  pathname: string | null | undefined,
  search: string | URLSearchParams | null | undefined
): string {
  const cleanOrigin = (origin || "").replace(/\/+$/, "")
  return `${cleanOrigin}${normalizePath(pathname)}${normalizeQuery(search)}`
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
