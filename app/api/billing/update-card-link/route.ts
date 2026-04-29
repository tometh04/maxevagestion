import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/server"

/**
 * GET /api/billing/update-card-link
 *
 * Devuelve la URL de MP donde el user actualiza la tarjeta de su preapproval.
 * Se abre en nueva pestaña desde el botón "Cambiar tarjeta".
 *
 * MP expone una URL pública por-preapproval que permite editar el medio de pago
 * sin cancelar. Si esa URL no funciona (MP la puede haber deprecado), fallback
 * a la lista general de suscripciones del usuario.
 *
 * Durante Fase 8 (E2E) confirmamos cuál funciona y ajustamos.
 */
export async function GET() {
  const { user } = await getCurrentUser()
  if (!user || !user.org_id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient() as any
  const { data: org } = await admin
    .from("organizations")
    .select("mp_preapproval_id")
    .eq("id", user.org_id)
    .maybeSingle()

  if (!org?.mp_preapproval_id) {
    return NextResponse.json({ error: "no preapproval" }, { status: 404 })
  }

  // URL canónica de gestión de suscripción MP por-preapproval.
  const url = `https://www.mercadopago.com.ar/subscriptions/${org.mp_preapproval_id}`

  return NextResponse.json({ url })
}
