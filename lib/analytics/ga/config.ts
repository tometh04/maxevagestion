// Configuracion de Google Analytics 4 (telemetria de producto).
//
// OJO: `lib/analytics/date-filter.ts` es OTRO bounded context (reporting de
// negocio del tenant). Todo lo de GA vive bajo `lib/analytics/ga/`.
//
// Las `NEXT_PUBLIC_*` se inlinean en build time: cambiar la variable en Railway
// sin redeployar NO tiene efecto, el bundle queda con el string vacio y GA nunca
// carga. Por eso hay que leerlas como literales (`process.env.X`) y no armar la
// clave dinamicamente, o Next no las reemplaza.

/** Measurement ID del Web data stream, formato `G-XXXXXXXXXX`. */
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? ""

/**
 * Modo debug: habilita GA fuera de produccion y activa `debug_mode` para que los
 * hits aparezcan en GA4 DebugView. Nunca setear en produccion.
 */
export const GA_DEBUG = process.env.NEXT_PUBLIC_GA_DEBUG === "1"

const MEASUREMENT_ID_RE = /^G-[A-Z0-9]{4,}$/

/** El measurement ID existe y tiene forma valida. */
export function isGaConfigured(): boolean {
  return MEASUREMENT_ID_RE.test(GA_MEASUREMENT_ID)
}

/**
 * Unica puerta de entrada para decidir si se emite telemetria.
 *
 * En development no se manda nada salvo que se pida explicitamente con
 * `NEXT_PUBLIC_GA_DEBUG=1`, asi que el dia a dia local no ensucia la propiedad.
 *
 * Si mas adelante se agrega banner de consentimiento, el gate va aca:
 * `... && hasConsent()`. Es el unico lugar que hay que tocar.
 */
export function isGaEnabled(): boolean {
  if (!isGaConfigured()) return false
  return process.env.NODE_ENV === "production" || GA_DEBUG
}
