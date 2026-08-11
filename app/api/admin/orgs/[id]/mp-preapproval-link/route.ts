import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { createPreapproval, cancelPreapproval } from "@/lib/billing/mercadopago"
import { mpErrorToUserMessage } from "@/lib/billing/mp-error-mapper"
import { logSecurityEvent } from "@/lib/security/audit"
import { PLANS, formatArs, type PlanId } from "@/lib/billing/plans"
import { resolvePlanPrice } from "@/lib/billing/plan-pricing"
import { agreedPriceFor } from "@/lib/billing/agreed-price"

/**
 * POST /api/admin/orgs/[id]/mp-preapproval-link
 * Body: { payer_email: string, include_free_trial?: boolean, free_trial_days?: number }
 *
 * Genera un preapproval PER-ORG (no el preapproval_plan compartido) atado al
 * email real de la cuenta de Mercado Pago del cliente. Devuelve el init_point
 * para mandárselo.
 *
 * free_trial_days difiere el primer cobro N días (para clientes ya cubiertos
 * hasta cierta fecha): tiene prioridad sobre include_free_trial. Ej: cliente
 * cubierto hasta el 1/08 → free_trial_days = días hasta esa fecha.
 *
 * Por qué existe: el flujo self-serve usa un preapproval_plan COMPARTIDO y
 * anónimo (sin payer_email). El antifraude de MP desconfía más de un débito
 * recurrente sin pagador conocido, y el plan compartido arrastra reputación de
 * todos los tenants. Un preapproval per-org atado a la cuenta que el cliente
 * usa habitualmente tiene mucha mejor tasa de aprobación.
 *
 * Seguridad:
 *  - Solo platform admin.
 *  - external_reference = orgId (server-side, del path) → el webhook engancha
 *    solo a esta org, imposible reclamar otra.
 *  - NO muta subscription_status ni mp_preapproval_id: si el cliente tiene acceso
 *    (p.ej. PAST_DUE en gracia) lo conserva; el estado lo actualiza el webhook
 *    cuando el pago realmente se aprueba. Así tampoco pelea con el reconcile.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()
  if (!(await isPlatformAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id: orgId } = await params
  const body = await request.json().catch(() => ({}))
  const payerEmail = (body?.payer_email as string | undefined)?.trim() || ""
  const includeFreeTrial = body?.include_free_trial === true
  // Días hasta el primer cobro (difiere el débito para clientes ya cubiertos).
  const freeTrialDays =
    typeof body?.free_trial_days === "number" && body.free_trial_days > 0
      ? Math.floor(body.free_trial_days)
      : undefined

  // Validación de email (el payer_email restringe QUIÉN puede pagar; formato correcto).
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)) {
    return NextResponse.json(
      { error: "payer_email inválido. Pasá el email de la cuenta de Mercado Pago del cliente." },
      { status: 400 }
    )
  }
  if (freeTrialDays !== undefined && (freeTrialDays < 1 || freeTrialDays > 365)) {
    return NextResponse.json(
      { error: "free_trial_days debe estar entre 1 y 365." },
      { status: 400 }
    )
  }

  const admin = createAdminClient() as any
  const { data: org } = await admin
    .from("organizations")
    .select(
      "id, name, plan, subscription_status, mp_preapproval_id, " +
      "custom_plan_id, agreed_plan_price_ars, agreed_plan_id"
    )
    .eq("id", orgId)
    .maybeSingle()

  if (!org) return NextResponse.json({ error: "Org no existe" }, { status: 404 })

  const plan = org.plan as PlanId
  const planDef = PLANS[plan]
  if (!planDef || planDef.contactSalesOnly || planDef.priceArsMonthly === null) {
    return NextResponse.json(
      { error: `El plan de la org (${org.plan}) no es cobrable self-serve.` },
      { status: 400 }
    )
  }

  // Este link es el camino manual que se usa justo cuando el débito automático
  // de una org falla. Si acá cobráramos el precio de lista, una org que venía
  // pagando el precio viejo perdería su precio congelado en el peor momento.
  const amountArs = agreedPriceFor(org, plan) ?? (await resolvePlanPrice(admin, plan))
  if (amountArs === null || amountArs <= 0) {
    return NextResponse.json(
      { error: `No se pudo resolver el precio del plan ${org.plan}.` },
      { status: 400 }
    )
  }

  // Supersede: si tenía un preapproval viejo, lo cancelamos (best-effort) para
  // no dejar dos suscripciones vivas.
  if (org.mp_preapproval_id) {
    try {
      await cancelPreapproval(org.mp_preapproval_id)
    } catch (err: any) {
      console.warn("[mp-preapproval-link] cancel old preapproval failed (non-blocking)", err?.message)
    }
  }

  const rawAppUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://app.vibook.ai").trim()
  const appUrl = /^https?:\/\//i.test(rawAppUrl) ? rawAppUrl : `https://${rawAppUrl}`
  const backUrl = `${appUrl}/onboarding/billing/return`

  let preapproval
  try {
    preapproval = await createPreapproval({
      orgId,
      plan,
      payerEmail,
      backUrl,
      amountArs,
      includeFreeTrial, // default false: cobro al aceptar
      freeTrialDays, // si viene, difiere el primer cobro N días (prioridad sobre includeFreeTrial)
    })
  } catch (err: any) {
    const raw = err?.message || String(err)
    console.error("[mp-preapproval-link] createPreapproval failed", raw)
    return NextResponse.json({ error: mpErrorToUserMessage(raw) }, { status: 502 })
  }

  // Log de auditoría. NO tocamos el estado de la org — el webhook lo hace cuando
  // el pago se aprueba (resuelve por external_reference = orgId).
  await admin.from("billing_events").insert({
    org_id: orgId,
    event_type: "CHECKOUT_INITIATED",
    external_id: null,
    amount_cents: Math.round(amountArs * 100),
    currency: "ARS",
    status: "pending",
    payload: {
      source: "admin-per-org-preapproval",
      per_org_preapproval: true,
      payer_email: payerEmail,
      preapproval_id: preapproval.id,
      included_free_trial: includeFreeTrial,
      free_trial_days: freeTrialDays ?? null,
      generated_by_user_id: user.id,
    },
  })

  logSecurityEvent({
    eventType: "admin_mp_preapproval_link",
    severity: "WARN",
    targetOrgId: orgId,
    targetEntity: "organization",
    targetEntityId: orgId,
    requestPath: "/api/admin/orgs/[id]/mp-preapproval-link",
    details: {
      by_user: user.id,
      payer_email: payerEmail,
      preapproval_id: preapproval.id,
      superseded_old: org.mp_preapproval_id ?? null,
    },
  })

  return NextResponse.json({
    ok: true,
    init_point: preapproval.init_point,
    preapproval_id: preapproval.id,
    payer_email: payerEmail,
    amount_ars: amountArs,
    note:
      `Mandale este link al cliente. Se le va a cobrar ${formatArs(amountArs)}/mes. ` +
      "Debe pagarlo con la cuenta de MP de ese email. El estado se activa solo cuando el pago se aprueba.",
  })
}
