import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { recordUsageEvents } from "@/lib/analytics/telemetry/server"
import { resolveActorContext } from "@/lib/analytics/telemetry/actor-context"
import { isTelemetryEnabled } from "@/lib/analytics/telemetry/config"

/**
 * Post-login redirect hub. Decide server-side adónde va el user:
 *   - Platform admin  → /admin/orgs (panel admin, nunca el ERP)
 *   - Resto           → /dashboard  (ERP normal)
 *
 * Usado por login-form.tsx después de autenticación exitosa.
 *
 * También es donde se registra el evento `login`. Tiene que ser server-side: el
 * call site del browser vive en `/login`, y esa ruta está excluida de la
 * telemetría de tenant, así que el hit se descartaría. Acá la sesión ya está
 * resuelta y no depende de que el browser llegue a mandar el beacon antes de
 * navegar.
 */
export const dynamic = "force-dynamic"

export default async function PostLoginPage() {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  const isAdmin = await isPlatformAdmin(supabase, user.id)

  // El login de un platform admin no es uso de un tenant, por el mismo motivo
  // por el que `/admin` está excluido: su `org_id` apunta a una agencia real
  // (admin@vibook.ai pertenece a Lozada) y contaría como si esa agencia
  // estuviera entrando.
  if (!isAdmin && isTelemetryEnabled()) {
    await recordLogin(supabase, user.auth_id)
  }

  redirect(isAdmin ? "/admin/orgs" : "/dashboard")
}

/**
 * Se hace `await` y no fire-and-forget: `redirect()` corta la ejecución del
 * request, así que una promesa flotante se cancelaría a mitad de camino. Son
 * ~30 ms en una pantalla que ya es un hop intermedio.
 *
 * Nunca tira: un fallo de telemetría no puede dejar a alguien trabado en el
 * login.
 */
async function recordLogin(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  authId: string | null | undefined
): Promise<void> {
  if (!authId) return
  try {
    const actor = await resolveActorContext(supabase as any, authId)
    if (!actor) return
    await recordUsageEvents(actor.orgId, actor.userId, [
      { name: "login", params: { method: "password" } },
    ], { role: actor.role, agencyId: actor.agencyId })
  } catch (err) {
    console.error("[telemetry] login no registrado:", err)
  }
}
