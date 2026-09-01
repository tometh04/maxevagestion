import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { clearAuthCookies } from "@/lib/auth/logout"

/**
 * POST /api/auth/logout
 * Cierra la sesión y redirige a /login. Gemela de `app/logout/route.ts`, para
 * el `<form method="POST">` de onboarding/billing.
 */
export async function POST() {
  const supabase = await createServerClient()
  try {
    const { error } = await supabase.auth.signOut({ scope: "local" })
    if (error) console.warn("[auth] signOut server-side devolvió error:", error.message)
  } catch (error) {
    console.error("[auth] signOut server-side falló:", error)
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.vibook.ai"
  return clearAuthCookies(NextResponse.redirect(new URL("/login", appUrl), { status: 303 }))
}
