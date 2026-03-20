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

  
  const supabase = createAdminClient() as any

  let query = supabase
    .from("wa_messages")
    .select("id, direction, message_type, body_text, sent_at, from_me, participant_jid")
    .eq("chat_id", chatId)
    .order("sent_at", { ascending: true })
    .limit(limit)

  if (before) {
    query = query.lt("sent_at", before)
  }

  const { data: messages, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ messages: messages || [] })
}
