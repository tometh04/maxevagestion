// Transporte hacia Google Analytics. Es el UNICO modulo del repo que puede
// tocar `window.dataLayer` / `gtag` — `scripts/check-analytics.sh` lo hace
// cumplir en el lint.
//
// Tres invariantes que sostiene este archivo:
//
// 1. NADA sale sin pasar por `scrubParams`.
// 2. `page_location`, `page_path` y `page_referrer` se pisan SIEMPRE, en todos
//    los hits. gtag los re-deriva de `document.location` / `document.referrer`
//    en cada evento salvo que se los override, asi que un solo `trackEvent` sin
//    pisarlos en `/admin/orgs?q=Juan Perez` filtra la busqueda entera.
// 3. Una falla de telemetria nunca puede romper un flujo de la app. Todo va
//    envuelto en try/catch y las funciones son no-op fuera del browser.

import { GA_DEBUG, GA_MEASUREMENT_ID, isGaEnabled } from "./config"
import type { AnalyticsEventName, AnalyticsEventParams } from "../events"
import type { AnalyticsIdentity } from "./identity"
import { PRODUCT_MODULES, moduleFromPath } from "../modules"
import {
  buildPageLocation,
  isAnalyticsEnabledPath,
  normalizePath,
  normalizeQuery,
} from "./paths"
import { scrubParams, type GaParams } from "./scrub"

declare global {
  // eslint-disable-next-line no-var
  var dataLayer: unknown[] | undefined
}

type GtagFn = (...args: unknown[]) => void

/**
 * Empuja directo a `window.dataLayer` en vez de llamar a `window.gtag`.
 *
 * Importante por orden de montaje: el script de gtag vive en el root layout y
 * `<AnalyticsIdentity />` en el layout del dashboard. React corre los effects de
 * los hijos antes que los de los padres, asi que `window.gtag` puede todavia no
 * existir. El array `dataLayer` si existe (o lo creamos), y gtag.js consume la
 * cola cuando termina de cargar.
 */
const gtag: GtagFn = function () {
  const w = window as unknown as { dataLayer?: unknown[] }
  if (!w.dataLayer) w.dataLayer = []
  // eslint-disable-next-line prefer-rest-params
  w.dataLayer.push(arguments)
}

let bootstrapped = false

/**
 * Encola `js` + `config` una unica vez, antes de cualquier hit.
 *
 * Vive aca y no en un <Script> inline del componente a proposito: `next/script`
 * con `strategy="afterInteractive"` inyecta los scripts inline recien despues de
 * la hidratacion, o sea que el `config` quedaria compitiendo con el primer
 * `page_view` que dispara el effect de <AnalyticsPageView />. Un page_view
 * encolado antes del config para ese measurement ID se pierde. Haciendolo desde
 * el mismo modulo que emite los hits, el orden en la cola es determinista.
 */
function ensureBootstrap(): void {
  if (bootstrapped) return
  bootstrapped = true
  try {
    gtag("js", new Date())
    gtag("config", GA_MEASUREMENT_ID, {
      // Los page_view los mandamos a mano y normalizados. Ademas hay que apagar
      // Enhanced Measurement en la consola de GA4 o se duplican.
      send_page_view: false,
      debug_mode: GA_DEBUG,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    })
  } catch {
    // `canSend()` corre fuera del try/catch de los emisores, asi que si esto
    // tirara, la excepcion escaparia hasta el componente que llamo a trackEvent.
  }
}

/** Chequeo comun a todos los hits: browser + GA habilitado + ruta no excluida. */
function canSend(): boolean {
  if (typeof window === "undefined") return false
  if (!isGaEnabled()) return false
  // Defensa en profundidad: aunque el script se hubiera cargado, desde una vista
  // publica de cotizacion no se emite nada.
  if (!isAnalyticsEnabledPath(window.location.pathname)) return false
  ensureBootstrap()
  return true
}

/**
 * Titulo seguro para el hit.
 *
 * ESTO NO ES COSMETICO. `app/layout.tsx` arma el `<title>` de la app como
 * "<nombre de la agencia> - Gestion de Agencia" (white-label), y gtag recolecta
 * `page_title` desde `document.title` SOLO en cada hit. O sea que sin pisarlo, el
 * nombre comercial de cada tenant viaja a Google en cada page_view y en cada
 * evento — justo lo que el contrato de privacidad dice que no se manda nunca, y
 * ademas convierte la re-identificacion del tenant frente a Google de inferencia
 * en dato directo.
 *
 * Se usa la etiqueta del modulo y no un literal fijo porque es un vocabulario
 * cerrado, escrito por nosotros, y hace utiles los reportes que agrupan por
 * titulo. Fuera del producto (auth, onboarding, paywall) cae a la marca.
 */
function safePageTitle(pathname: string): string {
  const productModule = moduleFromPath(pathname)
  if (!productModule) return "Vibook"
  return PRODUCT_MODULES.find((m) => m.key === productModule)?.label ?? "Vibook"
}

/**
 * Params de pagina ya normalizados. Se mergean en TODOS los hits para que gtag
 * no los reconstruya solo desde la URL real.
 */
export function currentPageParams(): GaParams {
  if (typeof window === "undefined") return {}

  const { origin, pathname, search } = window.location
  return {
    page_location: buildPageLocation(origin, pathname, search),
    page_path: `${normalizePath(pathname)}${normalizeQuery(search)}`,
    page_referrer: sanitizeReferrer(document.referrer),
    page_title: safePageTitle(pathname),
  }
}

/**
 * El referrer tambien es una URL nuestra en toda navegacion interna, asi que
 * arrastra los mismos `?q=` que acabamos de limpiar del page_location.
 */
export function sanitizeReferrer(referrer: string | null | undefined): string {
  if (!referrer) return ""
  try {
    const url = new URL(referrer)
    if (typeof window !== "undefined" && url.origin !== window.location.origin) {
      // Referrer externo: solo el origen, sin path ni query.
      return url.origin
    }
    return buildPageLocation(url.origin, url.pathname, url.search)
  } catch {
    return ""
  }
}

/**
 * Fija el contexto de pagina saneado como default global de gtag.
 *
 * Cinturon: los hits que gtag genera por su cuenta (session_start, first_visit)
 * heredan estos valores en vez de re-derivarlos de `document.location`.
 */
export function setPageContext(): void {
  if (!canSend()) return
  try {
    gtag("set", currentPageParams())
  } catch {
    // no-op
  }
}

/** Emite un evento de producto. Tipado por `AnalyticsEventParams`. */
export function trackEvent<K extends AnalyticsEventName>(
  name: K,
  params: AnalyticsEventParams[K]
): void {
  if (!canSend()) return
  try {
    gtag("event", name, {
      ...scrubParams(params as Record<string, unknown>),
      ...currentPageParams(),
    })
  } catch {
    // Telemetria caida no puede romper un dialogo de pago.
  }
}

/**
 * Pageview manual. `pathname`/`search` vienen de los hooks de Next; se
 * normalizan antes de salir.
 */
export function trackPageView(
  pathname: string,
  search: string | URLSearchParams | null
): void {
  if (!canSend()) return
  if (!isAnalyticsEnabledPath(pathname)) return
  try {
    const origin = window.location.origin
    gtag("event", "page_view", {
      page_location: buildPageLocation(origin, pathname, search),
      page_path: `${normalizePath(pathname)}${normalizeQuery(search)}`,
      page_referrer: sanitizeReferrer(document.referrer),
      // Igual que en `currentPageParams`: sin esto el `<title>` con el nombre de
      // la agencia se va a Google. Este emisor arma sus params a mano, asi que
      // hay que pisarlo aca tambien.
      page_title: safePageTitle(pathname),
      // El modulo como dimension propia: hace agrupables los page_view sin
      // depender de parsear el path en la consola.
      module: moduleFromPath(pathname) ?? "otro",
    })
  } catch {
    // no-op
  }
}

/** Setea la identidad user-scoped. Se aplica a todos los hits posteriores. */
export function setAnalyticsUser(identity: AnalyticsIdentity | null): void {
  if (!canSend()) return
  if (!identity) return
  try {
    gtag("set", { user_id: identity.user_id })
    gtag("set", "user_properties", {
      org_id: identity.org_id ?? undefined,
      role: identity.role,
      plan: identity.plan ?? undefined,
    })
  } catch {
    // no-op
  }
}

/** Limpia la identidad (logout, desmontaje del shell autenticado). */
export function clearAnalyticsUser(): void {
  if (!canSend()) return
  try {
    gtag("set", { user_id: null })
    gtag("set", "user_properties", { org_id: null, role: null, plan: null })
  } catch {
    // no-op
  }
}

export { GA_MEASUREMENT_ID }
