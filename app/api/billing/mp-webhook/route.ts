import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import {
  fetchPayment,
  fetchPreapproval,
  searchPreapprovalsByPayerEmail,
  verifyWebhookSignature,
} from "@/lib/billing/mercadopago"
import { transitionFromMP, type MPPaymentEvent, type MPPreapproval } from "@/lib/billing/state-machine"

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
      // MP no linkea el payment al preapproval directamente. Estrategia:
      // fetchear el payment → tomar payer.email → buscar preapproval de ese payer.
      const payment = await fetchPayment(String(resolvedId))
      const payerEmail = payment?.payer?.email
      if (!payerEmail) {
        return NextResponse.json({ ok: true, warning: "payment sin payer.email" })
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
      paymentEvent = {
        type: "subscription_authorized_payment",
        status: payment.status || "pending",
        transaction_amount: payment.transaction_amount ?? undefined,
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
  if (!orgId) {
    // Primer webhook del flow preapproval_plan — la org aún no tiene el id
    // persistido. Lo hará /api/billing/sync cuando el user vuelva al back_url.
    return NextResponse.json({ ok: true, warning: "no external_reference (pending sync)" })
  }

  // 5. Idempotencia por last_modified
  const { data: org } = await admin
    .from("organizations")
    .select("id, subscription_status, current_period_ends_at, mp_last_synced_at")
    .eq("id", orgId)
    .maybeSingle()
  if (!org) return NextResponse.json({ ok: true, warning: "org not found" })

  if (org.mp_last_synced_at && preapproval.last_modified) {
    if (new Date(org.mp_last_synced_at).getTime() >= new Date(preapproval.last_modified).getTime()) {
      return NextResponse.json({ ok: true, stale: true })
    }
  }

  // 6. Aplicar transición
  const transition = transitionFromMP(
    preapproval as MPPreapproval,
    paymentEvent,
    { preserved_current_period_ends_at: org.current_period_ends_at }
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
