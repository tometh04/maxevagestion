import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { decryptSecret } from "@/lib/integrations/secrets"
import { verifyHmac } from "@/lib/integrations/hmac"
import {
  adaptEvePayload,
  EveValidationError,
} from "@/lib/integrations/eve/payload-adapter"
import { processEveLead } from "@/lib/integrations/eve/sync-handler"
import type { EveIntegrationConfig } from "@/lib/integrations/eve/types"

/**
 * Webhook entrante de Eve (agente conversacional Vibu que captura leads).
 *
 * Patrón: idéntico a /api/integrations/chatsell/[token]/webhook.
 * Lookup org via token → HMAC opcional → idempotencia webhook_event_log →
 * upsert lead por (org_id, eve_session_id).
 *
 * Contrato del body en lib/integrations/eve/types.ts.
 * Aislamiento multi-tenant: org_id proviene SIEMPRE del lookup de
 * org_integrations por token — NUNCA del body.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const admin = createAdminClient() as any

  // 1. Lookup integración por token
  const { data: integ } = await admin
    .from("org_integrations")
    .select("org_id, webhook_secret, is_active, config")
    .eq("integration", "eve")
    .eq("webhook_token", token)
    .maybeSingle()

  if (!integ || !integ.is_active) {
    // Mismo 404 si no existe o si no está activa — no revelamos cuál.
    return NextResponse.json({ error: "Integration not active" }, { status: 404 })
  }

  const config = (integ.config as EveIntegrationConfig | null) || ({} as EveIntegrationConfig)

  // agencyId: usar default_agency_id o eve_agencia_id del config; si no,
  // hacer fallback a la primera agency de la org (igual que otros webhooks).
  let agencyId = config.default_agency_id || config.eve_agencia_id || ""
  if (!agencyId) {
    const { data: agencies } = await admin
      .from("agencies")
      .select("id")
      .eq("org_id", integ.org_id)
      .limit(1)
    agencyId = agencies?.[0]?.id || ""
  }

  if (!agencyId) {
    console.error(
      `[eve] integración org=${integ.org_id} sin agency_id — no se puede crear lead`
    )
    return NextResponse.json(
      { error: "Integration misconfigured: no agency found for org" },
      { status: 500 }
    )
  }

  // 2. Leer body como texto para verificación HMAC
  const body = await request.text()
  const signature = request.headers.get("x-eve-signature") || ""

  if (signature) {
    let secret: string
    try {
      secret = decryptSecret(integ.webhook_secret)
    } catch (err) {
      console.error("[eve] error desencriptando secret:", err)
      return NextResponse.json({ error: "Server error" }, { status: 500 })
    }
    if (!verifyHmac("sha256", body, signature, secret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }
  } else {
    // HMAC opcional. Si Eve no firma, confiamos en el token del path (256 bits).
    console.warn(
      `[eve] webhook org=${integ.org_id} recibido sin x-eve-signature — confiando en URL token`
    )
  }

  // 3. Parsear JSON
  let rawBody: unknown
  try {
    rawBody = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  // 4. Validar/adaptar payload
  let normalized
  try {
    normalized = adaptEvePayload(rawBody)
  } catch (err) {
    if (err instanceof EveValidationError) {
      await admin.from("webhook_event_log").insert({
        org_id: integ.org_id,
        integration: "eve",
        event_id: `invalid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        event_type: "validation_error",
        payload: rawBody as object,
        result: "error",
        error_detail: `${err.message} (field: ${err.field || "?"})`,
      })
      return NextResponse.json(
        { error: err.message, field: err.field },
        { status: 400 }
      )
    }
    throw err
  }

  // 5. Idempotencia — UNIQUE (org_id, integration, event_id)
  const { error: logErr } = await admin.from("webhook_event_log").insert({
    org_id: integ.org_id,
    integration: "eve",
    event_id: normalized.event_id,
    event_type: `lead.${normalized.estado}`,
    payload: rawBody as object,
    result: "ok",
  })

  if (logErr && (logErr as any).code === "23505") {
    // Duplicate event_id → ya procesamos este evento antes
    return NextResponse.json(
      { status: "duplicate", event_id: normalized.event_id },
      { status: 200 }
    )
  }

  // 6. Crear/actualizar lead
  try {
    const result = await processEveLead(admin, integ.org_id, agencyId, normalized)

    return NextResponse.json(
      {
        status: "ok",
        lead_id: result.lead_id,
        action: result.action,
      },
      { status: 200 }
    )
  } catch (err: any) {
    console.error("[eve] error procesando lead:", err)

    await admin
      .from("webhook_event_log")
      .update({ result: "error", error_detail: err?.message || "unknown" })
      .eq("org_id", integ.org_id)
      .eq("integration", "eve")
      .eq("event_id", normalized.event_id)

    return NextResponse.json(
      { error: "Failed to process lead", detail: err?.message },
      { status: 500 }
    )
  }
}
