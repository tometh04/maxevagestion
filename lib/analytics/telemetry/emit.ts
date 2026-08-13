"use client"

// Transporte hacia el sink propio. Es el UNICO modulo del browser que puede
// hablar con `/api/telemetry` — `scripts/check-analytics.sh` lo hace cumplir.
//
// Por que batch + sendBeacon y no un fetch por evento:
//
//   - `module_viewed` se dispara en cada navegacion. Un request por hit
//     multiplica la carga del server por nada.
//   - Un `fetch` normal disparado en el unload se cancela cuando la pagina se
//     va, asi que el ultimo tramo de la sesion (justo el que dice si la persona
//     se fue frustrada) se pierde. `sendBeacon` sobrevive al unload.
//
// El evento NO lleva `org_id` ni `user_id`: los resuelve el endpoint desde la
// sesion. Mandarlos desde el cliente seria dejar que cualquiera escriba
// telemetria en el tenant que quiera.

import {
  TELEMETRY_ENDPOINT,
  TELEMETRY_FLUSH_MS,
  TELEMETRY_MAX_BATCH,
  isTelemetryEnabled,
} from "./config"
import { isTenantUsagePath } from "../modules"
import { scrubParams } from "../ga/scrub"

export type QueuedUsageEvent = {
  name: string
  params: Record<string, string | number | boolean>
  occurred_at: string
}

let queue: QueuedUsageEvent[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
let listenersBound = false

/** Techo de memoria si el usuario esta offline y nada se puede enviar. */
const MAX_QUEUE = TELEMETRY_MAX_BATCH * 4

function canEmit(): boolean {
  if (typeof window === "undefined") return false
  if (!isTelemetryEnabled()) return false
  // Defensa en profundidad: nada de `/admin`, `/cotizacion` ni pantallas de auth.
  return isTenantUsagePath(window.location.pathname)
}

/**
 * Vacia la cola en el unload. `visibilitychange` es el unico evento confiable en
 * mobile: `beforeunload` no dispara cuando el sistema mata la pestaña en
 * background, y ahi se pierde la sesion entera.
 */
function bindFlushListeners(): void {
  if (listenersBound || typeof window === "undefined") return
  listenersBound = true

  const onHide = () => {
    if (document.visibilityState === "hidden") flushUsageEvents()
  }
  document.addEventListener("visibilitychange", onHide)
  window.addEventListener("pagehide", () => flushUsageEvents())
}

function scheduleFlush(): void {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flushUsageEvents()
  }, TELEMETRY_FLUSH_MS)
}

/**
 * Encola un evento. No lo manda: el envio ocurre por lote.
 *
 * Los params pasan por el MISMO `scrubParams` que GA. El sink es propio, pero la
 * regla de "no guardamos PII en el stream de eventos" no cambia por eso: esta
 * tabla la lee el platform admin de todos los tenants.
 */
export function enqueueUsageEvent(name: string, params: Record<string, unknown>): void {
  if (!canEmit()) return

  queue.push({
    name,
    params: scrubParams(params),
    occurred_at: new Date().toISOString(),
  })

  // Se descartan los mas viejos: en una cola que no drena, los ultimos eventos
  // describen mejor lo que esta pasando.
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE)

  bindFlushListeners()

  if (queue.length >= TELEMETRY_MAX_BATCH) flushUsageEvents()
  else scheduleFlush()
}

/** Manda lo que haya en la cola. Idempotente si la cola esta vacia. */
export function flushUsageEvents(): void {
  if (typeof window === "undefined") return
  if (queue.length === 0) return

  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }

  const batch = queue.slice(0, TELEMETRY_MAX_BATCH)
  queue = queue.slice(TELEMETRY_MAX_BATCH)

  const body = JSON.stringify({ events: batch })

  try {
    // `sendBeacon` no acepta headers; el endpoint acepta text/plain y parsea a
    // mano. Es tambien lo que lo mantiene fuera del preflight CORS.
    const sent =
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function" &&
      navigator.sendBeacon(TELEMETRY_ENDPOINT, new Blob([body], { type: "text/plain" }))

    if (!sent) {
      void fetch(TELEMETRY_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {})
    }
  } catch {
    // Telemetria caida no puede romper una navegacion.
  }

  // Quedo mas de un batch encolado: se sigue drenando.
  if (queue.length > 0) scheduleFlush()
}

/** Solo para tests. */
export function __resetUsageQueue(): void {
  queue = []
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
}

/** Solo para tests. */
export function __peekUsageQueue(): QueuedUsageEvent[] {
  return [...queue]
}
