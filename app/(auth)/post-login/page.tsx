import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"

/**
 * Post-login redirect hub. Decide server-side adónde va el user:
 *   - Platform admin  → /admin/orgs (panel admin, nunca el ERP)
 *   - Resto           → /dashboard  (ERP normal)
 *
 * Usado por login-form.tsx después de autenticación exitosa.
 */
export const dynamic = "force-dynamic"

export default async function PostLoginPage() {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  const isAdmin = await isPlatformAdmin(supabase, user.id)
  redirect(isAdmin ? "/admin/orgs" : "/dashboard")
}
