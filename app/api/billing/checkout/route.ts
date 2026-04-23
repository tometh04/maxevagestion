import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/server"
import { ensureMpPlan } from "@/lib/billing/mp-plans"
import type { PlanId } from "@/lib/billing/plans"
import { PLANS } from "@/lib/billing/plans"

/**
 * POST /api/billing/checkout
 * Body: { plan: "STARTER" | "PRO" | "ENTERPRISE", reactivate?: boolean }
 *
 * Crea una preapproval (suscripción mensual) en MP para la org del user y
 * devuelve `init_point` (URL a la que redirigir para completar el pago).
 *
 * - Si la org ya tiene has_used_trial=false → MP con free_trial 7 días
 * - Si has_used_trial=true y no es reactivación → no incluye trial
 * - Si reactivate=true → permite re-checkout para orgs CANCELLED, con
 *   start_date calculado para no cobrar doble si current_period_ends_at es futuro
 * - 409 si ya hay un preapproval activo y no es reactivación
 */
export async function POST(request: Request) {
  const { user } = await getCurrentUser()
  const orgId = (user as any).org_id as string | null
  if (!orgId) {
    return NextResponse.json({ error: "Usuario sin tenant" }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const plan = body.plan as PlanId
  const isReactivation = body.reactivate === true

  if (!plan || !PLANS[plan]) {
    return NextResponse.json({ error: "plan inválido" }, { status: 400 })
  }

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
    .select(
      "id, name, billing_email, plan, subscription_status, " +
      "mp_preapproval_id, has_used_trial, current_period_ends_at"
    )
    .eq("id", orgId)
    .single()

  if (!org) {
    return NextResponse.json({ error: "Organización no encontrada" }, { status: 404 })
  }

  // Guard: ya hay preapproval activo (salvo que sea reactivación)
  if (isReactivation) {
    if (org.subscription_status !== "CANCELLED") {
      return NextResponse.json(
        { error: "Solo se puede reactivar una suscripción cancelada" },
        { status: 400 }
      )
    }
    // mp_preapproval_id viejo lo ignoramos — MP ya lo cerró
  } else if (org.mp_preapproval_id) {
    return NextResponse.json(
      {
        error: "Ya tenés una suscripción activa. Gestionala desde Settings > Suscripción.",
        existing_preapproval: true,
      },
      { status: 409 }
    )
  }

  const payerEmail = org.billing_email || user.email
  if (!payerEmail) {
    return NextResponse.json({ error: "Tenant sin billing_email configurado" }, { status: 400 })
  }

  // Normalizar APP_URL: trim (Railway a veces deja espacios) + agregar https:// si falta
  const rawAppUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://app.vibook.ai").trim()
  const appUrl = /^https?:\/\//i.test(rawAppUrl) ? rawAppUrl : `https://${rawAppUrl}`
  const backUrl = `${appUrl}/onboarding/billing/return`

  try {
    const parsed = new URL(backUrl)
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error(`protocol inválido: ${parsed.protocol}`)
    }
  } catch (err: any) {
    console.error("checkout: backUrl inválido", { rawAppUrl, backUrl, err: err?.message })
    return NextResponse.json(
      { error: `Configuración inválida: NEXT_PUBLIC_APP_URL debe ser URL absoluta` },
      { status: 500 }
    )
  }

  // Calcular start_date para reactivaciones (no cobrar doble)
  let startDate: string | undefined = undefined
  if (isReactivation && org.current_period_ends_at) {
    const periodEnd = new Date(org.current_period_ends_at)
    if (periodEnd.getTime() > Date.now()) {
      // Todavía tiene período pagado — MP arranca a cobrar después del end.
      const startDateObj = new Date(periodEnd.getTime() + 86_400_000) // +1 día
      startDate = startDateObj.toISOString()
    }
  }

  const includeFreeTrial = !org.has_used_trial
  console.log("[checkout] MP preapproval_plan request", {
    orgId, plan, backUrl, isReactivation, includeFreeTrial, startDate,
  })

  let mpPlan
  try {
    const reason = `Vibook ${planDef.name}` // ASCII only
    mpPlan = await ensureMpPlan(admin, {
      plan,
      reason,
      amount: planDef.priceArsMonthly,
      backUrl,
      includeFreeTrial,
    })
  } catch (err: any) {
    const mpMsg = err?.message || String(err)
    console.error("checkout: MP ensureMpPlan failed", mpMsg)
    return NextResponse.json(
      { error: `MercadoPago rechazó el checkout: ${mpMsg}` },
      { status: 502 }
    )
  }

  // Log del intento para auditoría. mp_preapproval_id NO se guarda acá —
  // lo hará /api/billing/sync o el webhook cuando MP notifique.
  //
  // IMPORTANTE: external_id=null a propósito. El mp_preapproval_plan_id es
  // compartido entre todos los checkouts del mismo plan (cache en mp_plans),
  // y existe un UNIQUE(external_id, event_type) WHERE external_id IS NOT NULL
  // en billing_events (mig 157). Si guardamos el plan_id en external_id, a
  // partir del segundo checkout del mismo plan el INSERT explota con 23505 y
  // el CHECKOUT_INITIATED nunca llega a DB — dejando a los users sin forma
  // de sincronizar después. Lo mandamos al payload para que /sync pueda
  // leerlo para el fallback de MP search.
  const { error: insertErr } = await admin.from("billing_events").insert({
    org_id: orgId,
    event_type: "CHECKOUT_INITIATED",
    external_id: null,
    amount_cents: (planDef.priceArsMonthly ?? 0) * 100,
    currency: "ARS",
    status: "pending",
    payload: {
      plan,
      plan_key: mpPlan.plan_key,
      mp_preapproval_plan_id: mpPlan.mp_preapproval_plan_id,
      init_point: mpPlan.init_point,
      payer_email: payerEmail, // informativo solo
      initiated_by_user_id: user.id,
      included_free_trial: includeFreeTrial,
      is_reactivation: isReactivation,
      start_date: startDate,
      cached_plan: mpPlan.cached,
    },
  })
  if (insertErr) {
    console.error("checkout: billing_events insert failed", insertErr)
    // No bloqueamos el flow (el user ya está por redirigir a MP) pero el
    // /sync posterior no va a poder resolver → queda el manual como fallback.
  }

  // Marcamos has_used_trial=true siempre (aunque el user no complete)
  // para prevenir exploit de cancel+re-trial.
  const orgUpdates: Record<string, any> = {
    has_used_trial: true,
  }
  if (isReactivation) {
    orgUpdates.subscription_status = "PENDING_PAYMENT"
  }
  await admin.from("organizations").update(orgUpdates).eq("id", orgId)

  // Agregamos external_reference=<orgId> al init_point para que el webhook
  // subscription_preapproval.created sepa a qué org pertenece la preapproval
  // que acaba de crear MP.
  const initPointWithRef = new URL(mpPlan.init_point)
  initPointWithRef.searchParams.set("external_reference", orgId)

  return NextResponse.json({
    init_point: initPointWithRef.toString(),
    plan_key: mpPlan.plan_key,
    mp_preapproval_plan_id: mpPlan.mp_preapproval_plan_id,
  })
}
