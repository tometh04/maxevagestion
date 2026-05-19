import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { decryptSecret } from "@/lib/integrations/secrets"
import { verifyHmac } from "@/lib/integrations/hmac"
import { processCallbellEvent } from "@/lib/integrations/callbell/sync-handler"
import { adaptCallbellWebhook } from "@/lib/integrations/callbell/payload-adapter"
import type { CallbellWebhookEvent } from "@/lib/integrations/callbell/types"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const admin = createAdminClient() as any

  const { data: integ } = await admin
    .from("org_integrations")
    .select("org_id, webhook_secret, is_active, config")
    .eq("integration", "callbell-in")
    .eq("webhook_token", token)
    .maybeSingle()

  if (!integ || !integ.is_active) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // Multi-tenant: leads se crean solo si la org optó in (config.auto_create_leads).
  // Pensado para tenants Callbell-only (ej. VICO). Default false = comportamiento legacy.
  const autoCreateLeads =
    (integ.config as { auto_create_leads?: boolean } | null)?.auto_create_leads ===
    true

  const body = await request.text()
  const signature = request.headers.get("x-callbell-signature") || ""

  // Callbell webhook UI does NOT expose a signing-secret field as of 2026-05.
  // Their platform does not sign outbound webhooks → no `x-callbell-signature`
  // header arrives in production. Primary auth is the 128-bit token in the URL
  // path (looked up server-side against org_integrations.webhook_token, scoped
  // to integration='callbell-in'). If/when Callbell adds signing, this branch
  // verifies it — until then we skip and log a warning for visibility.
  if (signature) {
    let secret: string
    try {
      secret = decryptSecret(integ.webhook_secret)
    } catch {
      return NextResponse.json({ error: "Server error" }, { status: 500 })
    }
    if (!verifyHmac("sha256", body, signature, secret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }
  } else {
    console.warn(
      `[callbell-in] webhook for org=${integ.org_id} received without x-callbell-signature — relying on URL token auth (expected for Callbell, which does not sign)`
    )
  }

  let rawBody: unknown
  try {
    rawBody = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  // Callbell envía payloads sin campo `type` y con shapes distintos según el
  // tipo de evento (ver lib/integrations/callbell/payload-adapter.ts). El adapter
  // detecta la estructura y normaliza al shape CallbellWebhookEvent.
  const event = adaptCallbellWebhook(rawBody)
  if (!event) {
    // Guardamos el rawBody en webhook_event_log con result='ignored' para
    // poder diagnosticar el shape real que Callbell manda. Los logs de
    // Railway pueden estar delayed por incidents; el log en BD es fiable.
    const topKeys =
      typeof rawBody === "object" && rawBody
        ? Object.keys(rawBody as object).slice(0, 12)
        : [typeof rawBody]
    console.warn(
      `[callbell-in] payload no reconocido para org=${integ.org_id}:`,
      topKeys
    )
    await admin.from("webhook_event_log").insert({
      org_id: integ.org_id,
      integration: "callbell-in",
      event_id: `unrecognized-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      event_type: "unrecognized",
      payload: rawBody as object,
      result: "ignored",
      error_detail: `top-level keys: ${JSON.stringify(topKeys)}`,
    })
    return NextResponse.json(
      { status: "ignored", reason: "unrecognized_payload" },
      { status: 200 }
    )
  }

  // Idempotency
  const eventId = event.uuid || `cb-${Date.now()}`
  const { error: logErr } = await admin.from("webhook_event_log").insert({
    org_id: integ.org_id,
    integration: "callbell-in",
    event_id: eventId,
    event_type: event.type,
    payload: event,
    result: "ok",
  })
  if (logErr && (logErr as any).code === "23505") {
    return NextResponse.json({ status: "duplicate" }, { status: 200 })
  }

  const result = await processCallbellEvent(admin, integ.org_id, event, {
    autoCreateLeads,
  })
  return NextResponse.json(result, { status: 200 })
}
