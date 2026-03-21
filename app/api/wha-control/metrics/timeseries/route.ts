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

  const fromDate = dateFrom ? `${dateFrom}T00:00:00.000Z` : undefined
  const toDate = dateTo ? `${dateTo}T23:59:59.999Z` : undefined

  // Query messages directly (real-time)
  let query = supabase
    .from("wa_messages")
    .select("direction, sent_at, chat_id, message_type")
    .order("sent_at", { ascending: true })

  if (deviceId && deviceId !== "all") {
    query = query.eq("device_id", deviceId)
  }
  if (fromDate) query = query.gte("sent_at", fromDate)
  if (toDate) query = query.lte("sent_at", toDate)

  const { data: messages, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Group by date
  const byDate = new Map<string, {
    inbound: number; outbound: number; pdfs: number;
    chatFirstInbound: Map<string, string>; chatFirstOutbound: Map<string, string>;
    chatFirstMsg: Map<string, { direction: string; sent_at: string }>
  }>()

  for (const m of (messages || [])) {
    // Extract YYYY-MM-DD from sent_at
    const dateStr = m.sent_at.substring(0, 10)
    if (!byDate.has(dateStr)) {
      byDate.set(dateStr, {
        inbound: 0, outbound: 0, pdfs: 0,
        chatFirstInbound: new Map(), chatFirstOutbound: new Map(),
        chatFirstMsg: new Map()
      })
    }
    const day = byDate.get(dateStr)!

    if (m.direction === "inbound") {
      day.inbound++
      if (!day.chatFirstInbound.has(m.chat_id)) {
        day.chatFirstInbound.set(m.chat_id, m.sent_at)
      }
    } else if (m.direction === "outbound") {
      day.outbound++
      if (!day.chatFirstOutbound.has(m.chat_id)) {
        day.chatFirstOutbound.set(m.chat_id, m.sent_at)
      }
      if (m.message_type === "document") {
        day.pdfs++
      }
    }

    // Track first message per chat per day
    const existing = day.chatFirstMsg.get(m.chat_id)
    if (!existing || m.sent_at < existing.sent_at) {
      day.chatFirstMsg.set(m.chat_id, { direction: m.direction, sent_at: m.sent_at })
    }
  }

  // Build timeseries with response times
  const timeseries = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => {
      // Calculate avg response time for this day
      const responseTimes: number[] = []
      data.chatFirstInbound.forEach((inboundAt, chatId) => {
        const outboundAt = data.chatFirstOutbound.get(chatId)
        if (outboundAt) {
          const delta = (new Date(outboundAt).getTime() - new Date(inboundAt).getTime()) / 1000
          if (delta > 0 && delta < 86400) responseTimes.push(delta)
        }
      })

      // Count initiated conversations (first msg of chat is outbound)
      let initiated = 0
      data.chatFirstMsg.forEach((info) => {
        if (info.direction === "outbound") initiated++
      })

      return {
        date: date.substring(5), // "MM-DD" format for chart
        inbound: data.inbound,
        outbound: data.outbound,
        pdfs: data.pdfs,
        initiated,
        avg_response: responseTimes.length > 0
          ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
          : null,
      }
    })

  return NextResponse.json({ timeseries })
}
