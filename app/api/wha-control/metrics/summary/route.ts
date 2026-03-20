import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { whaControlAuthGuard } from "@/lib/wha-control/auth-guard"

export async function GET(request: Request) {
  const auth = await whaControlAuthGuard()
  if (!auth.authorized) return auth.response

  const { searchParams } = new URL(request.url)
  const deviceId = searchParams.get("deviceId")
  const dateFrom = searchParams.get("dateFrom")
  const dateTo = searchParams.get("dateTo")

  const supabase = createAdminClient() as any

  // Build date filters
  const fromDate = dateFrom ? `${dateFrom}T00:00:00.000Z` : undefined
  const toDate = dateTo ? `${dateTo}T23:59:59.999Z` : undefined

  // Query all messages in range directly (real-time, no pre-aggregation)
  let msgQuery = supabase
    .from("wa_messages")
    .select("id, device_id, chat_id, direction, sent_at")

  if (deviceId && deviceId !== "all") {
    msgQuery = msgQuery.eq("device_id", deviceId)
  }
  if (fromDate) msgQuery = msgQuery.gte("sent_at", fromDate)
  if (toDate) msgQuery = msgQuery.lte("sent_at", toDate)

  const { data: messages, error } = await msgQuery

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const msgs = messages || []

  // Count inbound/outbound
  let inbound_count = 0
  let outbound_count = 0
  const chatIds = new Set<string>()
  const inboundChatIds = new Set<string>()
  const outboundChatIds = new Set<string>()

  for (const m of msgs) {
    chatIds.add(m.chat_id)
    if (m.direction === "inbound") {
      inbound_count++
      inboundChatIds.add(m.chat_id)
    } else if (m.direction === "outbound") {
      outbound_count++
      outboundChatIds.add(m.chat_id)
    }
  }

  // Responded = chats that have both inbound and outbound
  let respondedCount = 0
  Array.from(inboundChatIds).forEach((chatId) => {
    if (outboundChatIds.has(chatId)) {
      respondedCount++
    }
  })

  // Unanswered = inbound chats without outbound reply
  const unansweredCount = inboundChatIds.size - respondedCount

  // Count new chats in range
  let newChatsQuery = supabase
    .from("wa_chats")
    .select("id", { count: "exact", head: true })
  if (deviceId && deviceId !== "all") {
    newChatsQuery = newChatsQuery.eq("device_id", deviceId)
  }
  if (fromDate) newChatsQuery = newChatsQuery.gte("created_at", fromDate)
  if (toDate) newChatsQuery = newChatsQuery.lte("created_at", toDate)
  const { count: newChatsCount } = await newChatsQuery

  // Calculate avg response time per chat (first inbound → first outbound)
  // Group messages by chat
  const chatMessages = new Map<string, { inbound: string[]; outbound: string[] }>()
  for (const m of msgs) {
    if (!chatMessages.has(m.chat_id)) {
      chatMessages.set(m.chat_id, { inbound: [], outbound: [] })
    }
    const entry = chatMessages.get(m.chat_id)!
    if (m.direction === "inbound") entry.inbound.push(m.sent_at)
    else if (m.direction === "outbound") entry.outbound.push(m.sent_at)
  }

  const responseTimes: number[] = []
  chatMessages.forEach((data) => {
    if (data.inbound.length > 0 && data.outbound.length > 0) {
      const firstInbound = new Date(data.inbound.sort()[0]).getTime()
      const firstOutbound = new Date(data.outbound.sort()[0]).getTime()
      if (firstOutbound > firstInbound) {
        const delta = (firstOutbound - firstInbound) / 1000
        if (delta < 86400) responseTimes.push(delta)
      }
    }
  })

  const avg_first_response_seconds = responseTimes.length > 0
    ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
    : null

  const summary = {
    inbound_count,
    outbound_count,
    active_chats_count: chatIds.size,
    new_chats_count: newChatsCount || 0,
    responded_chats_count: respondedCount,
    unanswered_chats_count: unansweredCount,
    avg_first_response_seconds,
  }

  return NextResponse.json({ summary })
}
