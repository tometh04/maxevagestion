import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { createAdminClient } from "@/lib/supabase/server"

/**
 * SaaS Pilar 4 — helpers de platform admin.
 *
 * PLATFORM_ADMIN vive en la tabla `platform_admins` (separada del role por-tenant
 * en `users.role`). Es el único rol que puede cruzar orgs — todo lo demás está
 * acotado por RLS tenant_isolation.
 *
 * Uso típico:
 *   const supabase = await createServerClient()
 *   if (!(await isPlatformAdmin(supabase, user.id))) return 403
 *
 * Implementación: usamos `createAdminClient()` internamente para bypassear RLS.
 * Si usáramos el `supabase` del caller autenticado como el propio platform admin,
 * la policy RLS de `platform_admins` tiene que permitir que el user vea su entry
 * y cualquier inconsistencia de policy (ej. filtrar por auth_id vs user_id) hace
 * que el helper retorne false aunque la fila exista. El parámetro `supabase` se
 * mantiene para no romper callers, pero no se usa.
 */

export async function isPlatformAdmin(
  _supabase: SupabaseClient<Database>,
  userId: string
): Promise<boolean> {
  const admin = createAdminClient() as any
  const { data } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle()
  return !!data
}
