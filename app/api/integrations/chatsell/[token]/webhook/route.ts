import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { decryptSecret } from "@/lib/integrations/secrets"
import { verifyHmac } from "@/lib/integrations/hmac"
import {
  adaptChatsellPayload,
  ChatsellValidationError,
} from "@/lib/integrations/chatsell/payload-adapter"
import { processChatsellLead } from "@/lib/integrations/chatsell/sync-handler"
import type { ChatsellIntegrationConfig } from "@/lib/integrations/chatsell/types"

/**
 * Webhook entrante de Chatsell (agente IA de ventas).
 *
 * Patrón: idéntico a /api/integrations/callbell-in/[token]/webhook y
 * /api/integrations/manychat/[token]/webhook. Lookup org via token,
 * HMAC opcional, idempotency por event_id, insert/update lead.
 *
 * Documentación pública del contrato del body en lib/integrations/chatsell/types.ts.
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
    .eq("integration", "chatsell")
    .eq("webhook_token", token)
    .maybeSingle()

  if (!integ || !integ.is_active) {
    // Mismo 404 si no existe o si no está activa — no revelamos cuál.
    return NextResponse.json({ error: "Integration not active" }, { status: 404 })
  }

  const config = (integ.config as ChatsellIntegrationConfig | null) || ({} as ChatsellIntegrationConfig)
  const agencyId = config.agency_id
  if (!agencyId) {
    console.error(
      `[chatsell] integration ${integ.org_id} sin agency_id en config — no se puede crear lead`
    )
    return NextResponse.json(
      { error: "Integration misconfigured: missing agency_id in config" },
      { status: 500 }
    )
  }

  // 2. Leer body como texto para verificación HMAC
  const body = await request.text()
  const signature = request.headers.get("x-chatsell-signature") || ""

  if (signature) {
    let secret: string
    try {
      secret = decryptSecret(integ.webhook_secret)
    } catch (err) {
      console.error("[chatsell] error desencriptando secret:", err)
      return NextResponse.json({ error: "Server error" }, { status: 500 })
    }
    if (!verifyHmac("sha256", body, signature, secret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }
  } else {
    // HMAC opcional. Si Chatsell decide no firmar, confiamos en el token
    // del path (256 bits de entropía). Log para visibilidad.
    console.warn(
      `[chatsell] webhook org=${integ.org_id} recibido sin x-chatsell-signature — confiando en URL token`
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
    normalized = adaptChatsellPayload(rawBody)
  } catch (err) {
    if (err instanceof ChatsellValidationError) {
      // Log con detalle del campo que falta para que Chatsell debuggee.
      await admin.from("webhook_event_log").insert({
        org_id: integ.org_id,
        integration: "chatsell",
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
    integration: "chatsell",
    event_id: normalized.event_id,
    event_type: `lead.${normalized.quality_raw}`,
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
    const result = await processChatsellLead(admin, integ.org_id, agencyId, normalized)

    return NextResponse.json(
      {
        status: "ok",
        lead_id: result.lead_id,
        action: result.action,
        event_id: normalized.event_id,
      },
      { status: 200 }
    )
  } catch (err: any) {
    console.error("[chatsell] error procesando lead:", err)

    // Marcar el evento como errored para que sea reintento-friendly si
    // Chatsell decide reenviar con el mismo event_id (el INSERT del log
    // ya quedó, pero updateamos result a 'error').
    await admin
      .from("webhook_event_log")
      .update({ result: "error", error_detail: err?.message || "unknown" })
      .eq("org_id", integ.org_id)
      .eq("integration", "chatsell")
      .eq("event_id", normalized.event_id)

    return NextResponse.json(
      { error: "Failed to process lead", detail: err?.message },
      { status: 500 }
    )
  }
}
