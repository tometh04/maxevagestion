import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"

/**
 * POST /api/auth/logout
 * Cierra la sesión y redirige a /login.
 */
export async function POST() {
  const supabase = await createServerClient()
  await supabase.auth.signOut()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.vibook.ai"
  return NextResponse.redirect(new URL("/login", appUrl), { status: 303 })
}
