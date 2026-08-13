/**
 * getRequestPermissions — resuelve la matriz de permisos dinámicos para el
 * request actual, encapsulando la derivación de args (misma forma que el
 * layout del dashboard) para que API routes y Server Components no repitan el
 * boilerplate de getCurrentUser → agencyIds → resolveUserPermissions.
 *
 * Uso típico en una API route:
 *
 *   const { user, supabase, matrix } = await getRequestPermissions()
 *   if (!assertPermission(user.role, matrix, "operations", "write")) {
 *     return NextResponse.json({ error: "Forbidden" }, { status: 403 })
 *   }
 *
 * matrix es null solo cuando el usuario no tiene org_id (dev / pre-SaaS);
 * assertPermission ya hace el fallback estático en ese caso.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { resolveUserPermissions, type ResolvedPermissionsMatrix } from "@/lib/permissions-agency"
import { getEffectiveAgencyScopeRole, type UserRole } from "@/lib/permissions"

type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>["user"]

export interface RequestPermissions {
  user: CurrentUser
  supabase: SupabaseClient<Database>
  agencyIds: string[]
  /** null solo si el usuario no tiene org_id (dev / pre-SaaS). */
  matrix: ResolvedPermissionsMatrix | null
}

/**
 * Resuelve permisos para el request actual. Acepta opcionalmente un `supabase`
 * y/o `user` ya obtenidos por el caller para evitar re-fetch (ambos están
 * cacheados con React.cache igualmente, pero pasarlos ahorra derivaciones).
 */
export async function getRequestPermissions(opts?: {
  supabase?: SupabaseClient<Database>
  user?: CurrentUser
}): Promise<RequestPermissions> {
  const user = opts?.user ?? (await getCurrentUser()).user
  const supabase = opts?.supabase ?? (await createServerClient())

  if (!user.org_id) {
    return { user, supabase, agencyIds: [], matrix: null }
  }

  const roles = ((user as any).roles ?? [user.role]) as UserRole[]
  const effectiveRole = getEffectiveAgencyScopeRole(roles)
  const agencyIds = await getUserAgencyIds(supabase, user.id, effectiveRole)
  const matrix = await resolveUserPermissions(
    supabase as any,
    user.id,
    user.org_id,
    roles,
    agencyIds
  )

  return { user, supabase, agencyIds, matrix }
}
