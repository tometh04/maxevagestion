import { NextResponse } from "next/server"
import { cookies } from "next/headers"

/**
 * Cookies de sesion de @supabase/ssr: `sb-<projectRef>-auth-token`, sus chunks
 * (`.0`, `.1`, ...) y el `-code-verifier` del flujo PKCE.
 */
const SUPABASE_AUTH_COOKIE = /^sb-.+-auth-token(\.\d+)?$|^sb-.+-auth-token-code-verifier$/

/**
 * Borra las cookies de auth en la response, pase lo que pase con `signOut()`.
 *
 * Esto NO es redundante con `signOut()`. En gotrue-js, `_signOut` empieza con
 * `_useSession()` y si eso devuelve error corta y retorna — sin llegar nunca a
 * `_removeSession()` (GoTrueClient.js:1562). O sea que si en el momento de
 * cerrar sesion el access token esta vencido y el refresh falla, `signOut()`
 * devuelve un error y **deja las cookies puestas**. Como el valor de retorno se
 * ignoraba, la app mandaba al login creyendo que habia cerrado sesion, con la
 * cookie muerta todavia en el browser.
 *
 * Esa cookie es el problema: el cliente del browser la levanta, intenta
 * refrescar, falla, y `_recoverAndRefresh` llama `_removeSession()` — que borra
 * la cookie compartida entre pestañas. Si para entonces ya volviste a entrar,
 * la que se borra es la sesion NUEVA.
 *
 * Aca no dependemos de la libreria: se expira explicitamente toda cookie de
 * auth que haya llegado en el request.
 */
export async function clearAuthCookies(response: NextResponse): Promise<NextResponse> {
  const cookieStore = await cookies()
  for (const cookie of cookieStore.getAll()) {
    if (SUPABASE_AUTH_COOKIE.test(cookie.name)) {
      response.cookies.set(cookie.name, "", { path: "/", maxAge: 0 })
    }
  }
  return response
}

export { SUPABASE_AUTH_COOKIE }
