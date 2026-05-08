import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { decryptSecret } from "@/lib/integrations/secrets"
import { verifyHmac } from "@/lib/integrations/hmac"
import { handleManychatAdvancedLead } from "@/lib/integrations/manychat/handler-advanced"
import { syncManychatLeadToLead } from "@/lib/manychat/sync"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const admin = createAdminClient() as any

  // 1. Lookup integration by token
  const { data: integ } = await admin
    .from("org_integrations")
    .select("org_id, webhook_secret, is_active")
    .eq("integration", "manychat")
    .eq("webhook_token", token)
    .maybeSingle()

  if (!integ || !integ.is_active) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // 2. HMAC verification
  const body = await request.text()
  const signature = request.headers.get("x-vibook-signature") || ""
  let secret: string
  try {
    secret = decryptSecret(integ.webhook_secret)
  } catch (e: any) {
    console.error("Error decifrando webhook_secret:", e?.message)
    return NextResponse.json(
      { error: "Server config error" },
      { status: 500 }
    )
  }
  if (!verifyHmac("sha256", body, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  let payload: any
  try {
    payload = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  // 3. Idempotency via webhook_event_log
  const eventId =
    payload.event_id || payload.manychat_user_id || `mc-${Date.now()}`
  const { error: logErr } = await admin.from("webhook_event_log").insert({
    org_id: integ.org_id,
    integration: "manychat",
    event_id: eventId,
    event_type: "lead",
    payload,
    result: "ok",
  })
  if (logErr && (logErr as any).code === "23505") {
    return NextResponse.json({ status: "duplicate" }, { status: 200 })
  }

  // 4. Route by crm_mode
  const { data: org } = await admin
    .from("organizations")
    .select("crm_mode")
    .eq("id", integ.org_id)
    .single()

  if ((org as any)?.crm_mode === "advanced") {
    const { data: agency } = await admin
      .from("agencies")
      .select("id")
      .eq("org_id", integ.org_id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    if (!agency) {
      return NextResponse.json({ error: "No agency for org" }, { status: 500 })
    }
    const result = await handleManychatAdvancedLead(
      admin,
      integ.org_id,
      (agency as any).id,
      payload
    )
    return NextResponse.json(result, {
      status: result.created ? 201 : 200,
    })
  }

  // crm_mode = 'legacy' → existing handler
  const result = await syncManychatLeadToLead(payload, admin)
  return NextResponse.json(
    {
      success: true,
      created: result.created,
      leadId: result.leadId,
    },
    { status: result.created ? 201 : 200 }
  )
}
