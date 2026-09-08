import { createServerClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"

/**
 * A que pantalla le corresponde entrar a quien YA tiene sesion.
 *
 * Existe porque abrir `app.vibook.ai` en una pestaña nueva, con la sesion
 * viva, mostraba el formulario de login: `/` redirige a `/login` y `/login`
 * no miraba la sesion. Quien ya entro no tiene que volver a ver esa pantalla.
 *
 * Devuelve `null` cuando NO hay sesion utilizable —o cuando no se puede
 * resolver, por ejemplo si el servicio de Auth esta caido—. En ese caso el
 * caller muestra el login, que es lo seguro: nunca destruye la sesion ni deja
 * a nadie trabado.
 *
 * A diferencia de `getCurrentUser()`, esto NO redirige por su cuenta. Tiene que
 * ser asi para poder usarlo dentro de `/login` sin armar un loop de redirects.
 */
export async function resolveHomeForSession(): Promise<string | null> {
  try {
    const supabase = await createServerClient()

    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !authUser) return null

    const { data: userRow, error } = await (supabase.from("users") as any)
      .select("id, is_active, org_id")
      .eq("auth_id", authUser.id)
      .maybeSingle()

    // Sin fila en `users` o desactivado: que pase por el login, que ya sabe
    // explicar el caso.
    if (error || !userRow || (userRow as any).is_active === false) return null

    // Los platform admins no tienen tenant. Su pantalla de inicio es el panel,
    // nunca el ERP. Ver `project-platform-admin-sin-org`: mandarlos al flujo de
    // tenant es lo que termino con cuentas nuestras adentro de un cliente.
    if (await isPlatformAdmin(supabase as any, (userRow as any).id)) {
      return "/admin/orgs"
    }

    // Alta a medio terminar: el mismo destino que ya elige el middleware.
    if (!(userRow as any).org_id) return "/onboarding"

    return "/dashboard"
  } catch {
    // Cualquier problema de infra cae al login. No es un logout: la cookie
    // sigue intacta y el proximo intento resuelve normal.
    return null
  }
}
