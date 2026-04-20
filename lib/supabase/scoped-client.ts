import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "./types"
import { createServerClient } from "./server"
import { getCurrentUser } from "@/lib/auth"

/**
 * SaaS Pilar 3 — scoped-client helper.
 *
 * Crea un server client + valida que el user tenga `org_id` asignado. Sirve
 * como tercera capa de defense-in-depth (RLS + Pass 2 explicit filters +
 * esta validación temprana).
 *
 * Uso típico en routes:
 *   const { supabase, user, orgId } = await getScopedContext()
 *   const { data } = await supabase.from("leads").select("*")
 *     // RLS ya filtra por orgId; podés también agregar .eq("org_id", orgId)
 *     // explícitamente para defense-in-depth en mutations.
 *
 * Si el user no tiene org_id, esta función lanza. Combinado con el middleware
 * que redirige a /onboarding cuando org_id es null, este helper solo se
 * ejecuta con un user ya en un tenant.
 */

export type ScopedUser = {
  id: string
  auth_id: string
  email: string
  role: string
  org_id: string
}

export type ScopedContext = {
  supabase: SupabaseClient<Database>
  user: ScopedUser
  orgId: string
}

export async function getScopedContext(): Promise<ScopedContext> {
  const { user } = await getCurrentUser()
  const orgId = (user as any).org_id as string | null
  if (!orgId) {
    throw new Error(
      "User sin org_id — este endpoint requiere tenant válido. Completar onboarding primero."
    )
  }
  const supabase = await createServerClient()
  return {
    supabase,
    user: user as ScopedUser,
    orgId,
  }
}

/**
 * Query builder acotado por org_id. Úsalo en routes nuevos para no olvidar
 * el filtro (defense-in-depth encima de RLS).
 *
 *   const q = scopedFrom(supabase, orgId, "operations").select("*")
 *
 * Retorna el builder de PostgREST con `.eq("org_id", orgId)` pre-aplicado.
 */
export function scopedFrom(
  supabase: SupabaseClient<Database>,
  orgId: string,
  table: string
) {
  return (supabase.from(table) as any).select().eq("org_id", orgId)
}
