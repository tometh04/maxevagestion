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

export async function GET(request: Request) {
  const supabase = await createServerClient()
  await supabase.auth.signOut()

  // El origin del request y no `NEXT_PUBLIC_APP_URL`: así funciona igual en
  // local, en preview y en producción sin depender de que la env esté bien.
  return NextResponse.redirect(new URL("/login", new URL(request.url).origin))
}
