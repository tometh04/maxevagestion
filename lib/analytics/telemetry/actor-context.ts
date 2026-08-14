// Rol y agencia del actor, resueltos SIEMPRE en el server.
//
// El cliente manda `screen` y `session_id` porque son hechos del browser que el
// server no puede conocer. `role`, `agency_id` y `org_id` NO: dejar que el
// cliente los proponga seria dejar que cualquiera escriba telemetria en el
// tenant, la agencia o el rol que quiera.

import type { SupabaseClient } from "@supabase/supabase-js"
import { usageRoleFor, type UsageRole } from "../roles"

export type ActorContext = {
  userId: string
  orgId: string
  role: UsageRole | null
  agencyId: string | null
}

type CacheEntry = { value: ActorContext; expiresAt: number }

/**
 * Memo en memoria por usuario. TTL corto.
 *
 * El batch sale cada 15 s por pestaña, asi que en estado estacionario el hit
 * rate es altisimo y esto ahorra una query por request.
 *
 * OJO, contexto que importa: `lib/permissions-api.ts` documenta que un
 * `unstable_cache` sobre `getUserAgencyIds` cacheaba un `[]` por 5 minutos tras
 * cada deploy y rompia endpoints — por eso se removio. La diferencia aca es
 * categorica y hay que tenerla presente antes de "aprovechar" este cache para
 * otra cosa:
 *
 *   1. Un valor stale afecta una DIMENSION DE ANALISIS, nunca una decision de
 *      autorizacion ni un filtro de datos. Lo peor que pasa es que un evento
 *      quede con el rol viejo durante dos minutos.
 *   2. No es `unstable_cache` (persistente, la causa real de aquel bug) sino un
 *      Map de modulo que muere con el proceso.
 */
const TTL_MS = 120_000
const cache = new Map<string, CacheEntry>()

export async function resolveActorContext(
  supabase: SupabaseClient<any, any, any>,
  authId: string
): Promise<ActorContext | null> {
  const now = Date.now()
  const hit = cache.get(authId)
  if (hit && hit.expiresAt > now) return hit.value

  const { data: userRow } = await (supabase as any)
    .from("users")
    .select("id, org_id, role, additional_roles, is_independent_advisor")
    .eq("auth_id", authId)
    .maybeSingle()

  const user = userRow as
    | {
        id: string
        org_id: string | null
        role: string | null
        additional_roles: string[] | null
        is_independent_advisor: boolean | null
      }
    | null

  if (!user?.org_id) return null

  const context: ActorContext = {
    userId: user.id,
    orgId: user.org_id,
    role: usageRoleFor(user),
    agencyId: await resolveSingleAgency(supabase, user.id, user.org_id),
  }

  cache.set(authId, { value: context, expiresAt: now + TTL_MS })
  if (cache.size > 500) pruneCache(now)

  return context
}

/**
 * Agencia SOLO si el usuario pertenece a exactamente una. `null` en cualquier
 * otro caso.
 *
 * Dos decisiones deliberadas:
 *
 * 1. **No se usa `getUserAgencyIds()`.** Esa funcion responde "que puede ver", y
 *    para SUPER_ADMIN / ORG_OWNER / CONTABLE / POST_VENTA devuelve TODAS las
 *    agencias de la org. Con eso, el dueño de una org de una sola agencia
 *    quedaria atribuido a ella y el de una org de tres quedaria en NULL:
 *    semantica inconsistente e imposible de explicar en un grafico. Lo que se
 *    necesita aca es PERTENENCIA, y eso es `user_agencies` crudo.
 *
 * 2. **No se infiere.** Si la org tiene una sola agencia es tentador atribuirle
 *    todo, pero el NULL es informacion honesta: "esta persona no esta asignada
 *    a una agencia". Si algun dia se quiere ese rollup se hace en la RPC de
 *    lectura, donde es reversible. Un dato inventado en el stream no se
 *    deshace.
 */
async function resolveSingleAgency(
  supabase: SupabaseClient<any, any, any>,
  userId: string,
  orgId: string
): Promise<string | null> {
  // Se piden 2 filas: con una alcanza para saber que es inequivoco, y la
  // segunda dice "hay mas de una" sin traer las 20 de una org grande.
  const { data } = await (supabase as any)
    .from("user_agencies")
    .select("agency_id, agencies!inner(org_id)")
    .eq("user_id", userId)
    .eq("agencies.org_id", orgId)
    .limit(2)

  const rows = (data ?? []) as { agency_id: string }[]
  return rows.length === 1 ? rows[0].agency_id : null
}

function pruneCache(now: number): void {
  cache.forEach((entry, key) => {
    if (entry.expiresAt <= now) cache.delete(key)
  })
}

/** Solo para tests. */
export function __resetActorContextCache(): void {
  cache.clear()
}
