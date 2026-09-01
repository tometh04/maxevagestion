import { NextResponse } from "next/server"

/**
 * 401 en JSON para requests de API sin sesion.
 *
 * `getCurrentUser()` hace `redirect("/login")` cuando no hay sesion. En una
 * pagina eso es lo correcto, pero en una route handler el `redirect` sale como
 * 307 y el `fetch` del browser lo SIGUE: la pantalla termina recibiendo el HTML
 * del login donde esperaba JSON, y lo unico que se ve en consola es
 * `SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`.
 *
 * Paso real: el panel de novedades quedaba vacio, sin ningun indicio de que el
 * problema era la sesion.
 *
 * Con esto el `fetch` sigue el redirect pero aterriza en un 401 parseable, o
 * sea que `res.ok` es false y el cuerpo dice que paso. No reemplaza mandar al
 * usuario al login — eso necesita un wrapper de fetch compartido — pero hace
 * que la falla sea legible en vez de un error de parseo.
 */
export const dynamic = "force-dynamic"

const body = {
  error: "No autenticado",
  code: "SESSION_REQUIRED",
  login: "/login",
}

export async function GET() {
  return NextResponse.json(body, { status: 401 })
}

export const POST = GET
export const PUT = GET
export const PATCH = GET
export const DELETE = GET
