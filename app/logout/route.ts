import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"

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
 */
export const dynamic = "force-dynamic"

export async function GET() {
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

  // `NEXT_PUBLIC_APP_URL` y NO el origin del request.
  //
  // La primera versión usaba `new URL(request.url).origin` con el argumento de
  // que así funcionaba igual en local y en producción sin depender de la env.
  // Es al revés: en Railway la app corre `next start -p 3005`, así que dentro
  // del contenedor ese origin es `localhost:3005` — y el logout mandaba a la
  // gente a una URL rota. Misma fuente que la ruta hermana, que está probada.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.vibook.ai"
  return NextResponse.redirect(new URL("/login", appUrl))
}
