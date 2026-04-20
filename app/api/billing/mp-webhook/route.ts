import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { fetchPreapproval, verifyWebhookSignature } from "@/lib/billing/mercadopago"

/**
 * POST /api/billing/mp-webhook
 *
 * Recibe notificaciones de MercadoPago (suscripciones + pagos).
 * Valida firma, consulta el preapproval afectado, actualiza
 * organizations.subscription_status en consecuencia, y loguea todo
 * en billing_events.
 *
 * MP reintenta hasta que devolvemos 2xx, así que cualquier error lo
 * loguea pero igualmente respondemos 200 después de haber persistido
 * el evento (para no perder el mensaje).
 *
 * Nota: esta route es PÚBLICA (no requiere auth de user). El middleware
 * la excluye explícitamente, y la seguridad viene de la firma MP.
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

  // Verificar firma. En dev con MP_WEBHOOK_SECRET sin setear, aceptamos
  // igual (la función emite un warn).
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

  // Persistimos el evento raw primero (para no perderlo nunca).
  const { data: rawInsert } = await admin
    .from("billing_events")
    .insert({
      event_type: "MP_WEBHOOK",
      external_id: resolvedId ? String(resolvedId) : null,
      payload: { type, body, query: Object.fromEntries(url.searchParams) },
    })
    .select("id")
    .single()

  // Sólo procesamos notificaciones de tipo preapproval / subscription_preapproval.
  // Los pagos individuales llegan con type=payment y se linkean por external_reference
  // del payment → preapproval — preferimos consultar el preapproval directamente.
  if (!resolvedId || !(type === "preapproval" || type === "subscription_preapproval")) {
    return NextResponse.json({ ok: true, event_id: rawInsert?.id })
  }

  let preapproval: any
  try {
    preapproval = await fetchPreapproval(String(resolvedId))
  } catch (err: any) {
    console.error("mp-webhook: fetchPreapproval failed", err?.message || err)
    return NextResponse.json({ ok: true, event_id: rawInsert?.id, warning: "fetch failed" })
  }

  const orgId = preapproval.external_reference as string | undefined
  const mpStatus = preapproval.status as string | undefined // authorized, paused, cancelled, pending

  if (!orgId || !mpStatus) {
    return NextResponse.json({ ok: true, event_id: rawInsert?.id, warning: "missing fields" })
  }

  // Mapeo MP status → organizations.subscription_status
  let newStatus: string | null = null
  let newEventType: string | null = null
  switch (mpStatus) {
    case "authorized":
      newStatus = "ACTIVE"
      newEventType = "SUBSCRIPTION_AUTHORIZED"
      break
    case "paused":
      newStatus = "PAST_DUE"
      newEventType = "SUBSCRIPTION_PAUSED"
      break
    case "cancelled":
      newStatus = "CANCELLED"
      newEventType = "SUBSCRIPTION_CANCELLED"
      break
    case "pending":
      newEventType = "SUBSCRIPTION_CREATED"
      break
  }

  if (newStatus) {
    await admin
      .from("organizations")
      .update({
        subscription_status: newStatus,
        // Si ACTIVE, limpiar trial/grace — la suscripción toma el control.
        ...(newStatus === "ACTIVE"
          ? { trial_ends_at: null, grace_period_ends_at: null }
          : {}),
      })
      .eq("id", orgId)
  }

  if (newEventType) {
    await admin.from("billing_events").insert({
      org_id: orgId,
      event_type: newEventType,
      external_id: String(resolvedId),
      amount_cents: preapproval.auto_recurring?.transaction_amount
        ? Math.round(preapproval.auto_recurring.transaction_amount * 100)
        : null,
      currency: preapproval.auto_recurring?.currency_id ?? null,
      status: mpStatus,
      payload: { preapproval },
    })
  }

  return NextResponse.json({ ok: true, event_id: rawInsert?.id, applied_status: newStatus })
}
