import { NextResponse } from "next/server"
import crypto from "crypto"
import { createAdminClient } from "@/lib/supabase/server"
import { mapLinearStateToTicketStatus, APP_COMMENT_SIGNATURE } from "@/lib/integrations/linear"

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

  try {
    // ── Comentario en el issue → respuesta en el ticket ──────────────────
    if (payload?.type === "Comment" && payload?.action === "create") {
      const commentIssueId: string | undefined =
        payload?.data?.issueId ?? payload?.data?.issue?.id
      const body: string | undefined = payload?.data?.body
      const authorName: string =
        payload?.data?.user?.name || payload?.data?.user?.displayName || "Linear"

      // Ignorar los comentarios que posteó vibook (llevan la firma) para no
      // reimportarlos como respuesta y generar un duplicado/loop.
      const isOwnComment = !!body && body.includes(APP_COMMENT_SIGNATURE)

      if (commentIssueId && body?.trim() && !isOwnComment) {
        const admin = createAdminClient()
        const { data: ticket } = await (admin as any)
          .from("support_tickets")
          .select("id")
          .eq("linear_issue_id", commentIssueId)
          .maybeSingle()

        if (ticket) {
          const { error } = await (admin as any)
            .from("support_ticket_replies")
            .insert({
              ticket_id: ticket.id,
              author_id: null,
              author_role: "admin",
              author_name: authorName,
              source: "linear",
              content: body.trim(),
            })
          if (error) console.error("[linear-webhook] error insertando reply:", error)
        }
      }
      return NextResponse.json({ ok: true })
    }

    // ── Cambio de estado del issue → status del ticket ───────────────────
    if (payload?.type === "Issue" && (payload?.action === "update" || payload?.action === "create")) {
      const issueId: string | undefined = payload?.data?.id
      const stateType: string | undefined = payload?.data?.state?.type
      if (issueId && stateType) {
        const admin = createAdminClient()
        const { error } = await (admin as any)
          .from("support_tickets")
          .update({ status: mapLinearStateToTicketStatus(stateType) })
          .eq("linear_issue_id", issueId)
        if (error) console.error("[linear-webhook] error actualizando ticket:", error)
      }
      return NextResponse.json({ ok: true })
    }
  } catch (err) {
    console.error("[linear-webhook] excepción procesando evento:", err)
  }

  // Siempre 200 para que Linear no reintente en loop.
  return NextResponse.json({ ok: true, ignored: true })
}
