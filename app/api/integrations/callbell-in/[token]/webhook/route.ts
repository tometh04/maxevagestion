import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { decryptSecret } from "@/lib/integrations/secrets"
import { verifyHmac } from "@/lib/integrations/hmac"
import { processCallbellEvent } from "@/lib/integrations/callbell/sync-handler"
import type { CallbellWebhookEvent } from "@/lib/integrations/callbell/types"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const admin = createAdminClient() as any

  const { data: integ } = await admin
    .from("integration_webhooks")
    .select("org_id, webhook_secret, is_active")
    .eq("integration", "callbell-in")
    .eq("webhook_token", token)
    .maybeSingle()

  if (!integ || !integ.is_active) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const body = await request.text()
  const signature = request.headers.get("x-callbell-signature") || ""
  let secret: string
  try {
    secret = decryptSecret(integ.webhook_secret)
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
  if (!verifyHmac("sha256", body, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  let event: CallbellWebhookEvent
  try {
    event = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
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

  const result = await processCallbellEvent(admin, integ.org_id, event)
  return NextResponse.json(result, { status: 200 })
}
