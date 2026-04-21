import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/server"
import { createPreapproval } from "@/lib/billing/mercadopago"
import type { PlanId } from "@/lib/billing/plans"
import { PLANS } from "@/lib/billing/plans"

/**
 * POST /api/billing/checkout
 * Body: { plan: "STARTER" | "PRO" | "ENTERPRISE" }
 *
 * Crea una preapproval (suscripción mensual) en MP para la org del user
 * y devuelve `init_point` (URL a la que redirigir para completar el pago).
 * Loguea el checkout en billing_events.
 */
export async function POST(request: Request) {
  const { user } = await getCurrentUser()
  const orgId = (user as any).org_id as string | null
  if (!orgId) {
    return NextResponse.json({ error: "Usuario sin tenant" }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const plan = body.plan as PlanId
  if (!plan || !PLANS[plan]) {
    return NextResponse.json({ error: "plan inválido" }, { status: 400 })
  }

  // Planes contact-sales-only (Enterprise) no pasan por MP: se contactan por
  // mailto desde la UI. Rechazamos el request para evitar un createPreapproval
  // con priceArsMonthly null.
  const planDef = PLANS[plan]
  if (planDef.contactSalesOnly || planDef.priceArsMonthly === null) {
    return NextResponse.json(
      { error: "Plan no disponible para checkout self-serve. Contactanos a hola@vibook.ai" },
      { status: 400 }
    )
  }

  const admin = createAdminClient() as any
  const { data: org } = await admin
    .from("organizations")
    .select("id, name, billing_email, plan, subscription_status, mp_preapproval_id")
    .eq("id", orgId)
    .single()

  if (!org) {
    return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 })
  }

  const payerEmail = org.billing_email || user.email
  if (!payerEmail) {
    return NextResponse.json({ error: "Tenant sin billing_email configurado" }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.vibook.ai"
  // back_url de MP preapproval: usamos la raíz del dominio. MP valida que la
  // URL sea pública y accesible; paths con auth-middleware (ej.
  // /settings/subscription) pueden devolver 307→/login y MP los rechaza con
  // "Invalid value for back_url, must be a valid URL". La raíz redirige via
  // middleware a /login → /dashboard si hay sesión, sin bouncing de MP.
  const backUrl = appUrl

  let preapproval
  try {
    preapproval = await createPreapproval({
      orgId,
      plan,
      payerEmail,
      backUrl,
    })
  } catch (err: any) {
    console.error("checkout: MP createPreapproval failed", err?.message || err)
    return NextResponse.json(
      { error: "No se pudo iniciar el checkout con MercadoPago" },
      { status: 502 }
    )
  }

  // Log del intento para reconciliación futura (no actualizamos plan todavía —
  // eso lo hace el webhook cuando MP confirma el primer pago).
  await admin.from("billing_events").insert({
    org_id: orgId,
    event_type: "CHECKOUT_INITIATED",
    external_id: preapproval.id,
    amount_cents: (planDef.priceArsMonthly ?? 0) * 100,
    currency: "ARS",
    status: preapproval.status,
    payload: {
      plan,
      init_point: preapproval.init_point,
      payer_email: payerEmail,
      initiated_by_user_id: user.id,
    },
  })

  // Guardamos el preapproval_id en la org para correlación futura.
  await admin
    .from("organizations")
    .update({ mp_preapproval_id: preapproval.id })
    .eq("id", orgId)

  return NextResponse.json({ init_point: preapproval.init_point, preapproval_id: preapproval.id })
}
