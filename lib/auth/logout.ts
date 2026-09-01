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

/**
 * `true` si el request es un prefetch de Next o una navegacion RSC, o sea algo
 * que el browser pidio solo.
 *
 * Esto no es teorico. `app/admin/layout.tsx` tenia `<Link href="/logout">`, y
 * Next prefetchea los Link cuando entran en viewport: el prefetch es un GET
 * real, asi que apenas el sidebar del admin scrolleaba lo suficiente como para
 * mostrar "Cerrar sesion", el browser pedia `/logout?_rsc=...` y la sesion se
 * destruia sola. Medido en produccion: una entrada de performance
 * `https://app.vibook.ai/logout?_rsc=12bvq` con initiator `fetch`, y la cookie
 * de auth ausente inmediatamente despues. Nadie toco nada.
 *
 * Los call sites ya pasaron a POST, pero la guarda queda igual: la ruta no puede
 * depender de que nadie vuelva a linkearla. Un GET que destruye estado es
 * justamente lo que HTTP pide que sea seguro, y prefetchers, escaneadores de
 * links y antivirus lo van a pedir solos.
 *
 * Devolver 204 ante una navegacion RSC no rompe un click real: Next cae a una
 * navegacion dura, que llega sin estos headers y si cierra sesion.
 */
export function esPrefetchONavegacionRSC(request: Request): boolean {
  const h = request.headers
  if (
    h.get("next-router-prefetch") === "1" ||
    h.get("purpose") === "prefetch" ||
    h.get("x-purpose") === "prefetch" ||
    h.get("x-moz") === "prefetch" ||
    h.get("rsc") === "1"
  ) {
    return true
  }
  try {
    return new URL(request.url).searchParams.has("_rsc")
  } catch {
    return false
  }
}

export { SUPABASE_AUTH_COOKIE }
