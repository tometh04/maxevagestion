// Escritura de `usage_events`. Server-only.
//
// Se usa desde dos lugares:
//   - `app/api/telemetry/route.ts`, para los batches que manda el browser.
//   - `trackServerEvent()`, para eventos que se originan en el server (API
//     routes, webhooks, crons) y que por definicion ningun ad blocker puede
//     bloquear.
//
// `org_id` SIEMPRE lo pone el caller desde la sesion o desde el token del
// webhook, nunca el payload del cliente. `createOrgAdminScope` lo hace
// imposible de olvidar: inyecta el org_id del scope en cada insert.

import { createOrgAdminScope } from "@/lib/supabase/admin-scope"
import { scrubParams } from "../ga/scrub"
import {
  DEFAULT_EVENT_MODULE,
  isDbEventName,
  type AnalyticsEventName,
  type AnalyticsEventParams,
} from "../events"
import { isModuleKey } from "../modules"

export type IncomingUsageEvent = {
  name: string
  params?: Record<string, unknown>
  occurred_at?: string
}

/** Ventana aceptada para el timestamp del cliente. */
const MAX_CLOCK_SKEW_MS = 60 * 60 * 1000

/**
 * El `occurred_at` viene del reloj del browser, que puede estar mal o venir
 * manipulado. Un timestamp en 2090 romperia todos los rangos del heatmap para
 * siempre, asi que se acota a una hora alrededor de ahora.
 */
export function clampOccurredAt(raw: string | undefined, now: Date = new Date()): string {
  if (!raw) return now.toISOString()
  const ts = new Date(raw).getTime()
  if (Number.isNaN(ts)) return now.toISOString()
  const min = now.getTime() - MAX_CLOCK_SKEW_MS
  const max = now.getTime() + 60_000
  return new Date(Math.min(Math.max(ts, min), max)).toISOString()
}

/** Normaliza y filtra un batch crudo. Puro: es lo que testean los tests. */
export function sanitizeUsageBatch(
  events: unknown,
  now: Date = new Date()
): { name: string; module: string | null; params: Record<string, unknown>; occurred_at: string }[] {
  if (!Array.isArray(events)) return []

  const out = []
  for (const raw of events) {
    if (!raw || typeof raw !== "object") continue
    const { name, params, occurred_at } = raw as IncomingUsageEvent

    // Un nombre que no esta en el catalogo con sink `db` se descarta entero: la
    // tabla no es un buzon abierto donde el cliente inventa metricas.
    if (typeof name !== "string" || !isDbEventName(name)) continue

    const clean = scrubParams(params as Record<string, unknown>)
    const module = typeof clean.module === "string" ? clean.module : undefined

    out.push({
      name,
      module: isModuleKey(module) ? module : DEFAULT_EVENT_MODULE[name] ?? null,
      params: clean,
      occurred_at: clampOccurredAt(occurred_at, now),
    })
  }
  return out
}

/**
 * Persiste un batch ya sanitizado. Fire-and-forget desde el punto de vista del
 * caller: nunca tira.
 */
export async function recordUsageEvents(
  orgId: string,
  userId: string | null,
  events: unknown
): Promise<number> {
  if (!orgId) return 0

  const rows = sanitizeUsageBatch(events)
  if (rows.length === 0) return 0

  try {
    const scope = createOrgAdminScope(orgId)
    const { error } = await scope.insert(
      "usage_events",
      rows.map((r) => ({
        user_id: userId,
        event_name: r.name,
        module: r.module,
        params: r.params,
        occurred_at: r.occurred_at,
      }))
    )
    if (error) {
      console.error("[telemetry] insert fallo:", error.message)
      return 0
    }
    return rows.length
  } catch (err) {
    console.error("[telemetry] insert tiro:", err)
    return 0
  }
}

/**
 * Emite un evento desde el server. Para acciones que no dejan fila propia y que
 * el browser no puede reportar de forma confiable.
 *
 * No se await-ea en el happy path del caller: la telemetria no puede sumarle
 * latencia ni modos de falla a un flujo de negocio.
 */
export function trackServerEvent<K extends AnalyticsEventName>(
  orgId: string | null | undefined,
  userId: string | null | undefined,
  name: K,
  params: AnalyticsEventParams[K]
): void {
  if (!orgId) return
  void recordUsageEvents(orgId, userId ?? null, [
    { name, params: params as Record<string, unknown> },
  ])
}
