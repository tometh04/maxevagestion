import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { checkCronAuth } from "@/lib/cron/auth"

/**
 * Sincroniza `login_sessions` desde `auth.sessions`.
 *
 * Por que hace falta un cron y no un hook en el login: no hay ningun punto del
 * codigo por el que pasen todas las sesiones. El login es client-side contra
 * GoTrue, y el cierre puede venir de un logout, de una expiracion o de una
 * revocacion — ninguno de esos tres avisa a la app.
 *
 * `auth.sessions` es efimero: GoTrue borra las sesiones vencidas. Este cron es
 * lo que convierte ese estado volatil en historial durable, y es la unica razon
 * por la que se pueden medir logins por dia despues de activar la expiracion.
 *
 * Todo el trabajo ocurre dentro de la RPC (una sentencia, atomica e
 * idempotente). Correr cada 15 minutos: mas espaciado y una sesion corta que
 * nace y muere entre dos corridas se pierde entera.
 */
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const auth = checkCronAuth(request, "sync-login-sessions")
  if (!auth.authorized) {
    return NextResponse.json({ error: "Unauthorized", reason: auth.reason }, { status: 401 })
  }

  // Cross-tenant por diseño: las sesiones de todas las orgs por igual.
  const admin = createAdminClient() as any
  const { data, error } = await admin.rpc("admin_sync_login_sessions")

  if (error) {
    console.error("[cron:sync-login-sessions] rpc fallo:", error.message)
    return NextResponse.json({ error: "Error sincronizando sesiones" }, { status: 500 })
  }

  const row = Array.isArray(data) ? data[0] : data

  return NextResponse.json({
    success: true,
    synced: row?.synced ?? 0,
    ended: row?.ended ?? 0,
  })
}
