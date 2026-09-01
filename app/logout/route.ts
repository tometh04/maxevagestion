import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { clearAuthCookies } from "@/lib/auth/logout"

/**
 * GET /logout — cierra la sesión y manda a /login.
 *
 * Existía el link pero no la ruta: `app/admin/layout.tsx` y `app/paywall/page.tsx`
 * apuntan a `/logout` desde hace tiempo y daban 404. El paywall es el caso feo:
 * es la pantalla de una org con la suscripción vencida, o sea alguien que quizás
 * quiere entrar con otra cuenta, y el único botón para salir estaba roto.
 *
 * Es GET y no POST porque los dos call sites son `<Link href="/logout">`. No hay
 * riesgo de CSRF que importe: lo peor que puede hacer un tercero es desloguear a
 * alguien, y no hay side effect destructivo detrás.
 *
 * `app/api/auth/logout/route.ts` sigue existiendo para el `<form method="POST">`
 * de onboarding/billing; ambos hacen lo mismo.
 *
 * Los botones de logout del producto tambien terminan acá: cierran la sesión del
 * lado del cliente y después navegan duro a esta ruta, para que el borrado de
 * cookies lo confirme el server (ver `clearAuthCookies`).
 */
export const dynamic = "force-dynamic"

export async function GET() {
  const supabase = await createServerClient()
  // Best effort: si falla, igual borramos las cookies abajo. `signOut()` devuelve
  // el error en vez de tirarlo, así que el try/catch es solo por las fallas de red.
  try {
    // `scope: "local"`: revocar solo ESTA sesión. El default es global, que borra
    // los refresh tokens de todas las sesiones del usuario — medido contra
    // nuestro proyecto, eso deja a cada pestaña abierta borrando la cookie
    // compartida al fallar su refresh. Ver `components/nav-user.tsx`.
    const { error } = await supabase.auth.signOut({ scope: "local" })
    if (error) console.warn("[auth] signOut server-side devolvió error:", error.message)
  } catch (error) {
    console.error("[auth] signOut server-side falló:", error)
  }

  // `NEXT_PUBLIC_APP_URL` y NO el origin del request.
  //
  // La primera versión usaba `new URL(request.url).origin` con el argumento de
  // que así funcionaba igual en local y en producción sin depender de la env.
  // Es al revés: en Railway la app corre `next start -p 3005`, así que dentro
  // del contenedor ese origin es `localhost:3005` — y el logout mandaba a la
  // gente a una URL rota. Misma fuente que la ruta hermana, que está probada.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.vibook.ai"
  return clearAuthCookies(NextResponse.redirect(new URL("/login", appUrl)))
}
