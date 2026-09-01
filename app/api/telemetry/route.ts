import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { recordUsageEvents } from "@/lib/analytics/telemetry/server"
import { resolveActorContext } from "@/lib/analytics/telemetry/actor-context"
import { TELEMETRY_MAX_BATCH } from "@/lib/analytics/telemetry/config"

/**
 * Ingesta de eventos de uso del producto.
 *
 * Tres decisiones que importan:
 *
 * 1. `org_id` y `user_id` salen de la SESION, nunca del payload. Si el cliente
 *    pudiera elegir el org_id, cualquier usuario podria escribir telemetria en
 *    el tenant de otro y ensuciar (o inflar) su mapa de uso.
 *
 * 2. Nunca devuelve error al cliente. Es un beacon: el browser lo dispara en el
 *    unload y no mira la respuesta. Un 500 no le sirve a nadie y un 401
 *    ensuciaria la consola de usuarios deslogueados. Sin sesion -> 204 y listo.
 *
 * 3. `getCurrentUser()` no sirve aca: hace `redirect('/login')` cuando no hay
 *    sesion, lo que en un route handler se convierte en un 307 a HTML para un
 *    request que solo queria dejar 3 filas.
 */

/** Techo de payload. Un batch de 50 eventos scrubbeados no llega a 20 KB. */
const MAX_BODY_BYTES = 100_000

export async function POST(request: Request) {
  let payload: unknown

  try {
    // `sendBeacon` manda text/plain (asi evita el preflight CORS), asi que se
    // lee crudo y se parsea a mano en vez de confiar en `request.json()`.
    const raw = await request.text()
    if (!raw || raw.length > MAX_BODY_BYTES) {
      return new NextResponse(null, { status: 204 })
    }
    payload = JSON.parse(raw)
  } catch {
    return new NextResponse(null, { status: 204 })
  }

  const events = (payload as { events?: unknown })?.events
  if (!Array.isArray(events) || events.length === 0) {
    return new NextResponse(null, { status: 204 })
  }

  const supabase = await createServerClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) return new NextResponse(null, { status: 204 })

  // Rol y agencia salen de acá, nunca del payload. Memoizado 120 s: el batch
  // llega cada 15 s por pestaña, así que en régimen no agrega queries.
  const actor = await resolveActorContext(supabase, authUser.id)
  if (!actor) return new NextResponse(null, { status: 204 })

  const accepted = await recordUsageEvents(
    actor.orgId,
    actor.userId,
    events.slice(0, TELEMETRY_MAX_BATCH),
    { role: actor.role, agencyId: actor.agencyId }
  )

  return NextResponse.json({ accepted }, { status: 202 })
}
