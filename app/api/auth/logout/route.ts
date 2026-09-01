import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"

/**
 * POST /api/auth/logout
 * Cierra la sesión y redirige a /login.
 */
export async function POST() {
  const supabase = await createServerClient()
  // `scope: "local"`: revocar solo ESTA sesion.
  //
  // El default de `signOut()` es global, que borra los refresh tokens de todas
  // las sesiones del usuario. Medido contra nuestro proyecto: despues de un
  // signOut global el refresh de otra sesion viva da
  // `400 refresh_token_not_found`, y un signOut global tardio mata incluso a
  // una sesion creada despues. Cada pestaña que quedaba con la sesion muerta
  // borraba la cookie compartida al fallar su refresh — incluso si a esa altura
  // la cookie ya era de un login nuevo. Ver el comentario largo en
  // `components/nav-user.tsx`.
  await supabase.auth.signOut({ scope: "local" })
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.vibook.ai"
  return NextResponse.redirect(new URL("/login", appUrl), { status: 303 })
}
