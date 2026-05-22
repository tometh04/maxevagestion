import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/server"

/**
 * POST /api/billing/reactivate
 *
 * Reactiva una suscripción CANCELLED. MP no permite revivir un preapproval
 * cancelado — siempre creamos uno nuevo. Para no cobrar doble, pasamos
 * start_date futuro si el user todavía tiene current_period_ends_at vigente.
 *
 * Delegamos al checkout con {reactivate: true} para reusar toda la lógica de
 * construcción del preapproval (free_trial off, start_date, etc.). El cliente
 * recibe init_point y redirige a MP para re-ingresar tarjeta.
 *
 * Auth: solo OWNER/SUPER_ADMIN/ADMIN.
 */
export async function POST() {
  const { user } = await getCurrentUser()
  if (!user || !user.org_id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const role = (user as any).role
  if (role !== "SUPER_ADMIN" && role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  // adminDb justificado (caso C billing): organizations.
  const admin = createAdminClient() as any
  const { data: org } = await admin
    .from("organizations")
    .select("id, subscription_status, plan")
    .eq("id", user.org_id)
    .maybeSingle()

  if (!org) return NextResponse.json({ error: "org not found" }, { status: 404 })
  if (org.subscription_status !== "CANCELLED") {
    return NextResponse.json(
      { error: "Solo podés reactivar una suscripción cancelada" },
      { status: 400 }
    )
  }

  // Respondemos con instrucción al cliente de llamar directamente al checkout
  // con {reactivate: true}. Así la cookie de auth fluye sin problemas vs
  // hacer un fetch server-to-server que requiere forwarding de cookies.
  return NextResponse.json({
    reactivate_via: "POST /api/billing/checkout",
    plan: org.plan,
    body: { plan: org.plan, reactivate: true },
  })
}
