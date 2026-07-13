import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import {
  fetchPayment,
  fetchPreapproval,
  searchPreapprovalsByPayerEmail,
  verifyWebhookSignature,
} from "@/lib/billing/mercadopago"
import { transitionFromMP, type MPPaymentEvent, type MPPreapproval } from "@/lib/billing/state-machine"
import { isAccessAllowed } from "@/lib/billing/access"
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
 * Idempotencia y reintentos:
 *  MP reintenta hasta recibir 2xx. Persistimos el raw event con status
 *  "received". Solo devolvemos 200 (y lo marcamos "processed") cuando el evento
 *  quedó APLICADO o es terminal-no-recuperable. Si la falla es transitoria
 *  (fetch a MP falló, o todavía no podemos linkear la org), devolvemos 5xx SIN
 *  marcar processed → MP reintenta y en el reintento re-procesamos el mismo raw
 *  event (no lo tratamos como duplicado). Así un cobro exitoso nunca se pierde
 *  en silencio.
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
  //    status "received" → todavía no procesado. Se marca "processed" al final.
  const eventType = typeToEventType(type)
  const insertRes = await admin
    .from("billing_events")
    .insert({
      event_type: eventType,
      external_id: resolvedId ? String(resolvedId) : null,
      status: "received",
      payload: { type, body, query: Object.fromEntries(url.searchParams) },
    })
    .select("id")
    .single()

  let rawEventId: string | null = insertRes.data?.id ?? null

  if (insertRes.error) {
    if (insertRes.error.code === "23505") {
      // Ya lo vimos antes (MP retryeó). ¿Ya se procesó?
      const { data: existing } = await admin
        .from("billing_events")
        .select("id, status")
        .eq("external_id", resolvedId ? String(resolvedId) : null)
        .eq("event_type", eventType)
        .maybeSingle()
      if (existing?.status === "processed") {
        return NextResponse.json({ ok: true, duplicate: true })
      }
      // Existe pero no se procesó (un intento anterior devolvió 5xx). Reprocesar.
      rawEventId = existing?.id ?? null
    } else {
      // 23514 (check_violation) u otro: NO lo tragamos. Antes esto se ignoraba y
      // perdíamos la traza de que el webhook llegó. Log + alerta explícita.
      console.error("mp-webhook: raw event insert failed", insertRes.error)
      logSecurityEvent({
        eventType: "mp_webhook_raw_insert_failed",
        severity: "ERROR",
        requestPath: "/api/billing/mp-webhook",
        details: { code: insertRes.error.code, message: insertRes.error.message, type, dataId: resolvedId },
      })
      notifyBillingSlack({
        event: "BILLING_ALERT",
        orgName: "—",
        details: `No se pudo persistir el raw event del webhook MP (${insertRes.error.code}). type=${type} id=${resolvedId}. Revisar constraint/migraciones de billing_events.`,
        severity: "error",
      })
      // Seguimos procesando igual: perder el audit no debe impedir aplicar el cobro.
      rawEventId = null
    }
  }

  const markProcessed = async () => {
    if (rawEventId) {
      await admin.from("billing_events").update({ status: "processed" }).eq("id", rawEventId)
    }
  }

  // 3. Solo procesamos tipos relevantes
  if (!resolvedId || !isProcessableType(type)) {
    await markProcessed()
    return NextResponse.json({ ok: true, event_id: rawEventId })
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
        // Terminal: sin preapproval_id no hay forma de resolver. No reintentar.
        console.warn("mp-webhook: subscription_authorized_payment sin preapproval_id")
        await markProcessed()
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
          // Terminal: sin email ni subscription_id no se puede linkear.
          await markProcessed()
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
          // Transitorio: el preapproval puede tardar en aparecer en el search.
          // 5xx → MP reintenta más tarde (y el cron de reconcile es red final).
          console.warn("mp-webhook: no preapproval para payer_email (retryable)", { payerEmail })
          return NextResponse.json({ error: "no preapproval para payer_email (retry)" }, { status: 503 })
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
    // Falla transitoria de MP (outage/timeout). NO marcamos processed → 5xx para
    // que MP reintente. Antes esto devolvía 200 y perdía el webhook para siempre.
    console.error("mp-webhook: fetch failed (retryable)", err?.message || err)
    return NextResponse.json({ error: "fetch failed (retry)" }, { status: 503 })
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
    // matchear por mp_preapproval_plan_id contra CHECKOUT_INITIATED pending.
    // Como el preapproval_plan es COMPARTIDO entre tenants, NO alcanza con el
    // plan_id: cross-checkeamos el payer_email del pago contra el del checkout
    // para no atribuir el cobro a la org equivocada.
    const planId = paymentDetails?.point_of_interaction?.transaction_data?.plan_id
    const payerEmail = (paymentDetails?.payer?.email || "").toLowerCase()
    if (planId) {
      const { data: initiatedRows } = await admin
        .from("billing_events")
        .select("id, org_id, payload")
        .eq("event_type", "CHECKOUT_INITIATED")
        .eq("status", "pending")
        .contains("payload", { mp_preapproval_plan_id: planId })
        .order("created_at", { ascending: false })
        .limit(10)

      const rows = (initiatedRows ?? []) as Array<{ id: string; org_id: string; payload: any }>
      // Preferir match por payer_email; si no hay email en el pago, no adivinar.
      const matched = payerEmail
        ? rows.find((r) => String(r.payload?.payer_email || "").toLowerCase() === payerEmail)
        : undefined

      if (matched?.org_id) {
        orgId = matched.org_id
        consumedCheckoutEventId = matched.id
      } else if (rows.length === 1 && !payerEmail) {
        // Único candidato y sin email para desambiguar → aceptamos.
        orgId = rows[0].org_id
        consumedCheckoutEventId = rows[0].id
      } else if (rows.length > 1) {
        // Ambigüedad real entre tenants: no linkear a ciegas. Alertar.
        console.warn("mp-webhook: múltiples CHECKOUT_INITIATED para el plan, sin match por email", {
          planId, payerEmail, candidates: rows.length,
        })
        notifyBillingSlack({
          event: "BILLING_ALERT",
          orgName: "—",
          details: `Pago MP no atribuible unívocamente (plan compartido ${planId}, ${rows.length} checkouts pendientes, sin match por email). Revisar manualmente.`,
          severity: "warning",
        })
      }
    }
  }
  if (!orgId) {
    // Primer webhook del flow preapproval_plan — la org aún no tiene el id
    // persistido. /api/billing/sync lo hará cuando el user vuelva al back_url,
    // o el cron billing-reconcile (Fase 3) lo recupera. Devolvemos 5xx para que
    // MP reintente: en el reintento el mp_preapproval_id ya puede estar seteado.
    return NextResponse.json({ error: "org no resuelta aún (retry)" }, { status: 503 })
  }

  // 5. Idempotencia por last_modified.
  const { data: org } = await admin
    .from("organizations")
    .select("id, name, subscription_status, current_period_ends_at, mp_last_synced_at, trial_ends_at")
    .eq("id", orgId)
    .maybeSingle()
  if (!org) {
    // Terminal: la org no existe. No reintentar.
    await markProcessed()
    return NextResponse.json({ ok: true, warning: "org not found" })
  }

  // Solo aplicamos el short-circuit "stale" cuando NO hay un evento de pago:
  // un subscription_authorized_payment/payment approved o rejected debe aplicarse
  // aunque el last_modified del preapproval no haya avanzado (el cambio está en el
  // pago, no en el preapproval). La state machine es idempotente.
  if (!paymentEvent && org.mp_last_synced_at && preapproval.last_modified) {
    if (new Date(org.mp_last_synced_at).getTime() >= new Date(preapproval.last_modified).getTime()) {
      await markProcessed()
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
      await markProcessed()
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

  // Guard: un preapproval PENDING (nuevo intento de pago recién creado, aún sin
  // autorizar) NO debe revocar el acceso que la org ya tiene. Si está con acceso
  // vigente (PAST_DUE en gracia, TRIALING, ACTIVE, CANCELLED con período), lo
  // preservamos hasta que el pago se apruebe o se venza la gracia. NO persistimos
  // el mp_preapproval_id del pending para que el reconcile tampoco la baje; el
  // evento authorized posterior resuelve por external_reference y setea todo.
  if (transition.subscription_status === "PENDING_PAYMENT" && isAccessAllowed(org as any)) {
    await admin.from("organizations")
      .update({ mp_last_synced_at: preapproval.last_modified })
      .eq("id", orgId)
    await markProcessed()
    return NextResponse.json({
      ok: true,
      preserved_access: true,
      kept_status: org.subscription_status,
    })
  }

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

  const { error: orgUpdateErr } = await admin.from("organizations").update(updates).eq("id", orgId)
  if (orgUpdateErr) {
    // Falla contable crítica: no marcar processed → MP reintenta. Alerta.
    console.error("mp-webhook: org update failed", orgId, orgUpdateErr)
    notifyBillingSlack({
      event: "BILLING_ALERT",
      orgName: org.name || orgId,
      orgId,
      details: `No se pudo actualizar subscription_status en webhook MP (${orgUpdateErr.code}). Reintentará.`,
      severity: "error",
    })
    return NextResponse.json({ error: "org update failed (retry)" }, { status: 503 })
  }

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

  await markProcessed()
  return NextResponse.json({
    ok: true,
    event_id: rawEventId,
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
