// Configuracion del sink propio (`usage_events` en Postgres).
//
// Deliberadamente separado de `ga/config.ts`: son dos destinos con dos gates
// distintos. Se puede querer telemetria propia sin GA (o al reves), y el dia que
// haya banner de consentimiento cada uno decide por su cuenta — el dato propio
// bajo interes legitimo, el de Google bajo consentimiento.

/** Endpoint que recibe los batches. */
export const TELEMETRY_ENDPOINT = "/api/telemetry"

/** Techo de eventos por request. El endpoint lo vuelve a validar server-side. */
export const TELEMETRY_MAX_BATCH = 50

/** Cada cuanto se vacia la cola si no se llena antes. */
export const TELEMETRY_FLUSH_MS = 15_000

/**
 * Debug local. OJO: `.env.local` de este repo apunta a la Supabase de
 * PRODUCCION, asi que prender esto en dev escribe eventos reales en la tabla y
 * ensucia el mapa de calor de una agencia de verdad. Prenderlo solo contra una
 * base descartable.
 */
export const TELEMETRY_DEBUG = process.env.NEXT_PUBLIC_TELEMETRY_DEBUG === "1"

/**
 * Unica puerta de entrada para decidir si se emiten eventos propios.
 *
 * Si algun dia hace falta gatear por consentimiento, el gate va aca.
 */
export function isTelemetryEnabled(): boolean {
  return process.env.NODE_ENV === "production" || TELEMETRY_DEBUG
}
