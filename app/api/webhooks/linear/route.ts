import { NextResponse } from "next/server"
import crypto from "crypto"
import { createAdminClient } from "@/lib/supabase/server"
import { mapLinearStateToTicketStatus } from "@/lib/integrations/linear"

/**
 * POST /api/webhooks/linear
 *
 * Webhook de Linear: cuando un desarrollador cambia el estado de un issue,
 * sincronizamos ese estado de vuelta al support_ticket vinculado.
 *
 * Auth: header "Linear-Signature" = HMAC-SHA256(body_crudo, LINEAR_WEBHOOK_SECRET).
 * Usa createAdminClient() porque es un webhook externo sin usuario logueado
 * (permitido por la regla multi-tenant para /api/webhooks/*).
 *
 * Docs: https://developers.linear.app/docs/graphql/webhooks
 */
export async function POST(request: Request) {
  const secret = process.env.LINEAR_WEBHOOK_SECRET
  if (!secret) {
    console.error("[linear-webhook] LINEAR_WEBHOOK_SECRET no configurado")
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 })
  }

  // Leer el body CRUDO antes de parsear para poder verificar la firma HMAC.
  const rawBody = await request.text()
  const signature = request.headers.get("Linear-Signature") || ""
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex")

  const sigBuf = Buffer.from(signature)
  const expBuf = Buffer.from(expected)
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    console.error("[linear-webhook] firma inválida")
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  // Solo nos interesan updates de issues.
  if (payload?.type !== "Issue" || (payload?.action !== "update" && payload?.action !== "create")) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const issueId: string | undefined = payload?.data?.id
  const stateType: string | undefined = payload?.data?.state?.type
  if (!issueId || !stateType) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const newStatus = mapLinearStateToTicketStatus(stateType)

  try {
    const admin = createAdminClient()
    const { error } = await (admin as any)
      .from("support_tickets")
      .update({ status: newStatus })
      .eq("linear_issue_id", issueId)

    if (error) {
      console.error("[linear-webhook] error actualizando ticket:", error)
    }
  } catch (err) {
    console.error("[linear-webhook] excepción actualizando ticket:", err)
  }

  // Siempre 200 para que Linear no reintente en loop.
  return NextResponse.json({ ok: true })
}
