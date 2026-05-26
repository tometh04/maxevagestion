import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/server"
import { ensureMpPlan } from "@/lib/billing/mp-plans"
import { cancelPreapproval } from "@/lib/billing/mercadopago"
import { mpErrorToUserMessage } from "@/lib/billing/mp-error-mapper"
import { notifyBillingSlack } from "@/lib/billing/slack-notify"
import type { PlanId } from "@/lib/billing/plans"
import { PLANS } from "@/lib/billing/plans"

/**
 * POST /api/billing/checkout
 * Body: { plan: "STARTER" | "PRO" | "ENTERPRISE", reactivate?: boolean, regularize?: boolean }
 *
 * Crea una preapproval (suscripción mensual) en MP para la org del user y
 * devuelve `init_point` (URL a la que redirigir para completar el pago).
 *
 * - Si la org ya tiene has_used_trial=false → MP con free_trial 7 días
 * - Si has_used_trial=true y no es reactivación → no incluye trial
 * - Si reactivate=true → permite re-checkout para orgs CANCELLED, con
 *   start_date calculado para no cobrar doble si current_period_ends_at es futuro
 * - Si regularize=true → para orgs PAST_DUE: cancela preapproval viejo,
 *   crea uno nuevo SIN trial y SIN start_date → cobro inmediato
 * - 409 si ya hay un preapproval activo y no es reactivación/regularización
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
  const isRegularize = body.regularize === true

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

  // adminDb justificado (caso C billing): organizations + billing_events son
  // escritas por webhooks de MP y por este flow. El body NUNCA acepta org_id
  // del cliente — se usa user.org_id del session. Anti-forge.
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

  // Guard: ya hay preapproval activo (salvo que sea reactivación/regularización)
  if (isRegularize) {
    if (org.subscription_status !== "PAST_DUE") {
      return NextResponse.json(
        { error: "Solo se puede regularizar una suscripción con pago vencido" },
        { status: 400 }
      )
    }
    // Cancelar preapproval viejo que está fallando en cobrar
    if (org.mp_preapproval_id) {
      try {
        await cancelPreapproval(org.mp_preapproval_id)
        console.log("[checkout:regularize] cancelled old preapproval", org.mp_preapproval_id)
      } catch (err: any) {
        // Si ya estaba cancelado o no existe, seguimos igual
        console.warn("[checkout:regularize] cancel old preapproval failed (non-blocking)", err?.message)
      }
    }
  } else if (isReactivation) {
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
  // NOTA: para regularize (PAST_DUE) NUNCA ponemos start_date — queremos cobro inmediato.
  let startDate: string | undefined = undefined
  if (isReactivation && !isRegularize && org.current_period_ends_at) {
    const periodEnd = new Date(org.current_period_ends_at)
    if (periodEnd.getTime() > Date.now()) {
      // Todavía tiene período pagado — MP arranca a cobrar después del end.
      const startDateObj = new Date(periodEnd.getTime() + 86_400_000) // +1 día
      startDate = startDateObj.toISOString()
    }
  }

  // PAST_DUE regularización: NUNCA trial (ya usaron el servicio, deben pagar ya)
  const includeFreeTrial = !org.has_used_trial && !isRegularize
  console.log("[checkout] MP preapproval_plan request", {
    orgId, plan, backUrl, isReactivation, isRegularize, includeFreeTrial, startDate,
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
      { error: mpErrorToUserMessage(mpMsg) },
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
      is_regularize: isRegularize,
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
  if (isReactivation || isRegularize) {
    orgUpdates.subscription_status = "PENDING_PAYMENT"
  }
  if (isRegularize) {
    // Limpiar preapproval_id viejo (ya lo cancelamos arriba). El nuevo se
    // escribirá cuando MP notifique subscription_preapproval.created vía webhook.
    orgUpdates.mp_preapproval_id = null
  }
  await admin.from("organizations").update(orgUpdates).eq("id", orgId)

  // Agregamos external_reference=<orgId> al init_point para que el webhook
  // subscription_preapproval.created sepa a qué org pertenece la preapproval
  // que acaba de crear MP.
  const initPointWithRef = new URL(mpPlan.init_point)
  initPointWithRef.searchParams.set("external_reference", orgId)

  // Slack: notificar cuando una agencia inicia regularización (PAST_DUE → checkout nuevo)
  if (isRegularize) {
    notifyBillingSlack({
      event: "BILLING_ALERT",
      orgName: org.name,
      orgId,
      details: `Regularización iniciada — plan ${planDef.name}. Se canceló preapproval viejo y se generó checkout nuevo (cobro inmediato).`,
      severity: "info",
    })
  }

  return NextResponse.json({
    init_point: initPointWithRef.toString(),
    plan_key: mpPlan.plan_key,
    mp_preapproval_plan_id: mpPlan.mp_preapproval_plan_id,
  })
}
