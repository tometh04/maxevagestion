import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import {
  fetchPayment,
  fetchPreapproval,
  searchPreapprovalsByPayerEmail,
  verifyWebhookSignature,
} from "@/lib/billing/mercadopago"
import { transitionFromMP, type MPPaymentEvent, type MPPreapproval } from "@/lib/billing/state-machine"
import { logSecurityEvent } from "@/lib/security/audit"
import { notifyBillingSlack } from "@/lib/billing/slack-notify"

/**
 * POST /api/billing/mp-webhook
 *
 * Recibe notificaciones de MercadoPago.
 * Valida firma, consulta el preapproval fresh con fetchPreapproval (confiamos
 * en el estado actual, no en el payload), aplica la state machine idempotente,
 * actualiza organizations y loggea billing_events.
 *
 * Tipos que procesamos:
 *  - subscription_preapproval: cambios de estado del preapproval
 *  - subscription_authorized_payment: cobros individuales (approved/rejected)
 *  - payment: pagos sueltos. MP los envía para trials y primeros cobros de
 *    preapproval_plan. No traen preapproval_id directamente, así que
 *    matcheamos por payer_email.
 *
 * MP reintenta hasta recibir 2xx. Persistimos el raw event primero y respondemos
 * 200 incluso si el procesamiento posterior falla — así no perdemos el mensaje
 * y MP no reenvía innecesariamente.
 */
export async function POST(request: Request) {
  const xSignature = request.headers.get("x-signature")
  const xRequestId = request.headers.get("x-request-id")
  const url = new URL(request.url)
  const dataId = url.searchParams.get("data.id") || url.searchParams.get("id")
  const type = url.searchParams.get("type") || url.searchParams.get("topic")

  const bodyText = await request.text()
  let body: any = {}
  try { body = bodyText ? JSON.parse(bodyText) : {} } catch {}

  const resolvedId = dataId || body?.data?.id || body?.id || null

  // 1. Firma
  const signatureOk = verifyWebhookSignature({
    xSignature,
    xRequestId,
    dataId: resolvedId ? String(resolvedId) : null,
  })
  if (!signatureOk) {
    console.warn("mp-webhook: firma inválida", { dataId: resolvedId, type })
    // Audit: firma inválida es una señal fuerte. Puede ser webhook
    // secret rotado en MP sin updatear MP_WEBHOOK_SECRET en Railway,
    // O un atacante intentando forjar webhooks. Severity ERROR para
    // que aparezca en queries de incidentes.
    logSecurityEvent({
      eventType: "mp_webhook_invalid_signature",
      severity: "ERROR",
      requestPath: "/api/billing/mp-webhook",
      details: { dataId: resolvedId, type },
    })
    return NextResponse.json({ error: "invalid signature" }, { status: 401 })
  }

  const admin = createAdminClient() as any

  // 2. Persistir raw event (audit). Idempotencia por UNIQUE(external_id, event_type).
  const eventType = typeToEventType(type)
  const insertRes = await admin
    .from("billing_events")
    .insert({
      event_type: eventType,
      external_id: resolvedId ? String(resolvedId) : null,
      payload: { type, body, query: Object.fromEntries(url.searchParams) },
    })
    .select("id")
    .single()

  // Postgres 23505 = unique_violation → webhook duplicado (MP retryeó), OK
  if (insertRes.error?.code === "23505") {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  const rawInsert = insertRes.data

  // 3. Solo procesamos tipos relevantes
  if (!resolvedId || !isProcessableType(type)) {
    return NextResponse.json({ ok: true, event_id: rawInsert?.id })
  }

  // 4. Fetch estado fresh
  let preapproval: any
  let paymentEvent: MPPaymentEvent | undefined
  let paymentDetails: any
  let consumedCheckoutEventId: string | null = null
  try {
    if (type === "subscription_authorized_payment") {
      const preapprovalId = body?.preapproval_id || body?.data?.preapproval_id
      if (!preapprovalId) {
        console.warn("mp-webhook: subscription_authorized_payment sin preapproval_id")
        return NextResponse.json({ ok: true, warning: "missing preapproval_id" })
      }
      preapproval = await fetchPreapproval(String(preapprovalId))
      paymentEvent = {
        type: "subscription_authorized_payment",
        status: body?.status || "pending",
      }
    } else if (type === "payment") {
      // payment no siempre trae preapproval_id en el payload del webhook.
      // Priorizamos subscription_id del payment (si existe). Fallback: payer.email.
      paymentDetails = await fetchPayment(String(resolvedId))
      const subscriptionId = paymentDetails?.point_of_interaction?.transaction_data?.subscription_id
      if (subscriptionId) {
        preapproval = await fetchPreapproval(String(subscriptionId))
      } else {
        const payerEmail = paymentDetails?.payer?.email
        if (!payerEmail) {
          return NextResponse.json({ ok: true, warning: "payment sin payer.email ni subscription_id" })
        }
        const found = await searchPreapprovalsByPayerEmail(payerEmail, 5)
        // Elegir la más recientemente modificada.
        const candidate = [...found].sort((a, b) => {
          const ta = a.last_modified ? new Date(a.last_modified).getTime() : 0
          const tb = b.last_modified ? new Date(b.last_modified).getTime() : 0
          return tb - ta
        })[0]
        if (!candidate) {
          return NextResponse.json({ ok: true, warning: "no preapproval para payer_email" })
        }
        preapproval = candidate
      }
      paymentEvent = {
        type: "subscription_authorized_payment",
        status: paymentDetails?.status || "pending",
        transaction_amount: paymentDetails?.transaction_amount ?? undefined,
      }
    } else {
      preapproval = await fetchPreapproval(String(resolvedId))
    }
  } catch (err: any) {
    console.error("mp-webhook: fetch failed", err?.message || err)
    return NextResponse.json({ ok: true, warning: "fetch failed" })
  }

  // Resolver orgId:
  //  a) preapproval.external_reference (caso ideal — flow /preapproval clásico)
  //  b) organizations.mp_preapproval_id = preapproval.id (webhooks posteriores
  //     al sync inicial hecho por /api/billing/sync — cubre el flow
  //     preapproval_plan donde external_reference nunca se propaga)
  let orgId = preapproval?.external_reference as string | undefined
  if (!orgId && preapproval?.id) {
    const { data: byId } = await admin
      .from("organizations")
      .select("id")
      .eq("mp_preapproval_id", preapproval.id)
      .maybeSingle()
    if (byId) orgId = byId.id
  }
  if (!orgId && type === "payment") {
    // Fallback para flow preapproval_plan sin external_reference:
    // matchear por mp_preapproval_plan_id contra el último CHECKOUT_INITIATED pending.
    const planId = paymentDetails?.point_of_interaction?.transaction_data?.plan_id
    if (planId) {
      const { data: initiated } = await admin
        .from("billing_events")
        .select("id, org_id")
        .eq("event_type", "CHECKOUT_INITIATED")
        .eq("status", "pending")
        .contains("payload", { mp_preapproval_plan_id: planId })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (initiated?.org_id) {
        orgId = initiated.org_id
        consumedCheckoutEventId = initiated.id
      }
    }
  }
  if (!orgId) {
    // Primer webhook del flow preapproval_plan — la org aún no tiene el id
    // persistido. Lo hará /api/billing/sync cuando el user vuelva al back_url.
    return NextResponse.json({ ok: true, warning: "no external_reference (pending sync)" })
  }

  // 5. Idempotencia por last_modified
  const { data: org } = await admin
    .from("organizations")
    .select("id, name, subscription_status, current_period_ends_at, mp_last_synced_at, trial_ends_at")
    .eq("id", orgId)
    .maybeSingle()
  if (!org) return NextResponse.json({ ok: true, warning: "org not found" })

  if (org.mp_last_synced_at && preapproval.last_modified) {
    if (new Date(org.mp_last_synced_at).getTime() >= new Date(preapproval.last_modified).getTime()) {
      return NextResponse.json({ ok: true, stale: true })
    }
  }

  // 6. Guard: no sobrescribir PAST_DUE con TRIALING/ACTIVE por race condition.
  //
  // Cuando MP rechaza un pago, envía DOS webhooks casi simultáneos:
  //   a) subscription_authorized_payment (status=rejected) → PAST_DUE ✅
  //   b) subscription_preapproval (preapproval sigue "authorized") → TRIALING ❌
  // El segundo llega sin paymentEvent y la state machine recalcula desde el
  // preapproval puro, perdiendo el PAST_DUE. Fix: si el webhook actual NO
  // trae paymentEvent y la org ya está en PAST_DUE con un PAYMENT_REJECTED
  // reciente (<24h), preservamos el PAST_DUE y no sobrescribimos.
  if (!paymentEvent && org.subscription_status === "PAST_DUE") {
    const { data: recentRejection } = await admin
      .from("billing_events")
      .select("id")
      .eq("org_id", orgId)
      .eq("event_type", "PAYMENT_REJECTED")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(1)
      .maybeSingle()

    if (recentRejection) {
      // Actualizar solo el sync timestamp, NO el status
      await admin.from("organizations")
        .update({ mp_last_synced_at: preapproval.last_modified, mp_preapproval_id: preapproval.id })
        .eq("id", orgId)
      return NextResponse.json({
        ok: true,
        skipped_race_condition: true,
        preserved_status: "PAST_DUE",
      })
    }
  }

  // 7. Aplicar transición
  const transition = transitionFromMP(
    preapproval as MPPreapproval,
    paymentEvent,
    {
      preserved_current_period_ends_at: org.current_period_ends_at,
      trial_ends_at: org.trial_ends_at,
    }
  )

  const updates: Record<string, any> = {
    subscription_status: transition.subscription_status,
    mp_last_synced_at: preapproval.last_modified,
    // Persistir mp_preapproval_id desde MP (source of truth). Necesario para el
    // flow nuevo preapproval_plan donde el checkout NO guarda el id — el user
    // lo genera al aceptar, y MP nos notifica acá. Usamos preapproval.id (el real)
    // en vez de resolvedId porque en subscription_authorized_payment resolvedId
    // es el payment_id, no el preapproval_id.
    mp_preapproval_id: preapproval.id,
  }
  if (transition.current_period_ends_at !== undefined) {
    updates.current_period_ends_at = transition.current_period_ends_at
  }

  await admin.from("organizations").update(updates).eq("id", orgId)

  if (transition.event_type) {
    await admin.from("billing_events").insert({
      org_id: orgId,
      event_type: transition.event_type,
      external_id: String(resolvedId),
      amount_cents: preapproval.auto_recurring?.transaction_amount
        ? Math.round(preapproval.auto_recurring.transaction_amount * 100)
        : null,
      currency: preapproval.auto_recurring?.currency_id ?? null,
      status: preapproval.status,
      payload: { preapproval, payment_event: paymentEvent },
    })
  }
  if (consumedCheckoutEventId) {
    await admin
      .from("billing_events")
      .update({ status: "consumed" })
      .eq("id", consumedCheckoutEventId)
  }

  // Slack: notificar eventos críticos de billing a #payments-vibook
  if (transition.event_type === "PAYMENT_REJECTED") {
    const amount = preapproval.auto_recurring?.transaction_amount
    notifyBillingSlack({
      event: "PAYMENT_REJECTED",
      orgName: org.name || orgId,
      orgId,
      amount: amount ? `$${amount.toLocaleString("es-AR")}` : undefined,
      details: `Pago rechazado por MP. Status anterior: ${org.subscription_status}. Transición a PAST_DUE.`,
      severity: "error",
    })
  } else if (transition.event_type === "SUBSCRIPTION_CANCELLED") {
    notifyBillingSlack({
      event: "SUBSCRIPTION_CANCELLED",
      orgName: org.name || orgId,
      orgId,
      details: `Suscripción cancelada. Status anterior: ${org.subscription_status}.`,
      severity: "warning",
    })
  } else if (transition.event_type === "PAYMENT_APPROVED" && org.subscription_status !== "ACTIVE") {
    notifyBillingSlack({
      event: "BILLING_ALERT",
      orgName: org.name || orgId,
      orgId,
      amount: preapproval.auto_recurring?.transaction_amount
        ? `$${preapproval.auto_recurring.transaction_amount.toLocaleString("es-AR")}`
        : undefined,
      details: `Pago aprobado. Transición ${org.subscription_status} → ACTIVE.`,
      severity: "info",
    })
  }

  // Audit: cambios de status críticos en subscription. CANCELLED o
  // SUSPENDED implican que el tenant pierde acceso (paywall) — son
  // candidatos típicos de disputas tipo "yo no cancelé". Loguear con
  // WARN para que aparezcan al filtrar audit log por incidentes.
  // ACTIVE es estado normal — INFO.
  if (org.subscription_status !== transition.subscription_status) {
    const isCritical =
      transition.subscription_status === "CANCELLED" ||
      transition.subscription_status === "SUSPENDED" ||
      transition.subscription_status === "PENDING_PAYMENT"
    logSecurityEvent({
      eventType: "subscription_status_changed_via_mp",
      severity: isCritical ? "WARN" : "INFO",
      targetOrgId: orgId,
      targetEntity: "organization",
      targetEntityId: orgId,
      requestPath: "/api/billing/mp-webhook",
      details: {
        from_status: org.subscription_status,
        to_status: transition.subscription_status,
        mp_preapproval_id: preapproval.id,
        mp_event_type: type,
        mp_external_id: String(resolvedId),
      },
    })
  }

  return NextResponse.json({
    ok: true,
    event_id: rawInsert?.id,
    applied_status: transition.subscription_status,
  })
}

function isProcessableType(type: string | null): boolean {
  return (
    type === "preapproval" ||
    type === "subscription_preapproval" ||
    type === "subscription_authorized_payment" ||
    type === "payment"
  )
}

function typeToEventType(type: string | null): string {
  switch (type) {
    case "subscription_preapproval": return "MP_WEBHOOK_PREAPPROVAL"
    case "subscription_authorized_payment": return "MP_WEBHOOK_PAYMENT"
    case "preapproval": return "MP_WEBHOOK_PREAPPROVAL"
    case "payment": return "MP_WEBHOOK_PAYMENT"
    default: return "MP_WEBHOOK"
  }
}
