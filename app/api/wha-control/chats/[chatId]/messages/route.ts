import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { whaControlAuthGuard } from "@/lib/wha-control/auth-guard"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const auth = await whaControlAuthGuard()
  if (!auth.authorized) return auth.response

  const { chatId } = await params
  const { searchParams } = new URL(request.url)
  const limit = parseInt(searchParams.get("limit") || "100")
  const before = searchParams.get("before")
  // Support merged conversations: comma-separated extra chat IDs
  const extraChatIds = searchParams.get("chatIds")


  // adminDb justificado: wa_messages SÍ tiene org_id (filtramos abajo).
  // wa_chats también — pre-validamos los chatIds contra el orgId antes de
  // listar mensajes para evitar leaks por forge de URL.
  const supabase = createAdminClient() as any

  // Build list of all chat IDs to query (primary + extras from merged conversations)
  const requestedChatIds = [chatId]
  if (extraChatIds) {
    const extras = extraChatIds.split(",").map((id) => id.trim()).filter(Boolean)
    for (const id of extras) {
      if (!requestedChatIds.includes(id)) requestedChatIds.push(id)
    }
  }

  // Pre-validar que TODOS los chatIds pertenezcan al org del caller.
  const { data: validChats } = await supabase
    .from("wa_chats")
    .select("id")
    .in("id", requestedChatIds)
    .eq("org_id", auth.orgId)
  const allChatIds = (validChats || []).map((c: any) => c.id)
  if (allChatIds.length === 0) {
    return NextResponse.json({ messages: [] })
  }

  let query = supabase
    .from("wa_messages")
    .select("id, direction, message_type, body_text, sent_at, from_me, participant_jid, raw_payload")
    .eq("org_id", auth.orgId) // SaaS tenant scope

  // Use .in() for multiple chat IDs, .eq() for single
  if (allChatIds.length === 1) {
    query = query.eq("chat_id", chatId)
  } else {
    query = query.in("chat_id", allChatIds)
  }

  query = query.order("sent_at", { ascending: true }).limit(limit)

  if (before) {
    query = query.lt("sent_at", before)
  }

  const { data: messages, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Extract sender_name from raw_payload.pushName and strip raw_payload from response
  const enriched = (messages || []).map((msg: any) => {
    const senderName = msg.raw_payload?.pushName || null
    const { raw_payload, ...rest } = msg
    return { ...rest, sender_name: senderName }
  })

  return NextResponse.json({ messages: enriched })
}
