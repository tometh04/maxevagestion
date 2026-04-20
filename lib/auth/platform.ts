import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

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
 * La policy RLS de platform_admins permite que el propio user vea su entry;
 * un no-admin simplemente ve la tabla vacía y el helper retorna false.
 */

export async function isPlatformAdmin(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<boolean> {
  const { data } = await (supabase.from("platform_admins") as any)
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle()
  return !!data
}
