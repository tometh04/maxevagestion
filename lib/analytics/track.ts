// Dispatcher de telemetria. ESTE es el modulo que usan los call sites.
//
// Un evento se declara una vez en `events.ts` y sale hacia todos los sinks que
// declare: hoy Google Analytics y `usage_events` en Postgres. Es el patron
// "one tracking plan, many destinations" de Segment/RudderStack, en 40 lineas y
// sin vendor.
//
// Reglas del modulo:
//
//   1. Un call site NUNCA importa `ga/track` ni `telemetry/emit` directo. Si lo
//      hace, se saltea el ruteo por sink y el evento llega a un solo lado.
//      `scripts/check-analytics.sh` lo hace cumplir en el lint.
//   2. Una falla de telemetria no puede romper un flujo de la app. Todo esta
//      envuelto y los dos sinks fallan de forma independiente: que GA este
//      bloqueado por un ad blocker no puede impedir el hit a la DB.

import type { AnalyticsEventName, AnalyticsEventParams } from "./events"
import { sinksFor } from "./events"
import { trackEvent as gaTrackEvent } from "./ga/track"
import { enqueueUsageEvent } from "./telemetry/emit"

/**
 * Emite un evento de producto hacia los sinks que declare en `EVENT_SINKS`.
 * Tipado por `AnalyticsEventParams`.
 */
export function trackEvent<K extends AnalyticsEventName>(
  name: K,
  params: AnalyticsEventParams[K]
): void {
  const sinks = sinksFor(name)

  if (sinks.includes("ga")) {
    try {
      gaTrackEvent(name, params)
    } catch {
      // no-op: `gaTrackEvent` ya es defensivo, esto es cinturon y tiradores.
    }
  }

  if (sinks.includes("db")) {
    try {
      enqueueUsageEvent(name, params as Record<string, unknown>)
    } catch {
      // no-op
    }
  }
}
