import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { whaControlAuthGuard } from "@/lib/wha-control/auth-guard"

// Message types that don't count as real messages (reactions, stickers, etc.)
const EXCLUDED_MESSAGE_TYPES = new Set(["reaction", "sticker", "unknown"])

/** Check if a document is a PDF based on mime type */
function isPdfDocument(mimeType: string | null | undefined): boolean {
  if (!mimeType) return true // If no mime type, assume it could be a PDF (backwards compat)
  const mime = mimeType.toLowerCase()
  return mime === "application/pdf" || mime.includes("pdf")
}

export async function GET(request: Request) {
  const auth = await whaControlAuthGuard()
  if (!auth.authorized) return auth.response

  const { searchParams } = new URL(request.url)
  const deviceId = searchParams.get("deviceId")
  const agencyId = searchParams.get("agencyId")
  const dateFrom = searchParams.get("dateFrom")
  const dateTo = searchParams.get("dateTo")
  const includeGroups = searchParams.get("includeGroups") === "true"

  const supabase = createAdminClient() as any

  const fromDate = dateFrom ? `${dateFrom}T00:00:00.000Z` : undefined
  const toDate = dateTo ? `${dateTo}T23:59:59.999Z` : undefined

  // Get device IDs to filter
  let deviceIds: string[] | null = null
  if (deviceId && deviceId !== "all") {
    deviceIds = [deviceId]
  } else {
    let devQuery = supabase
      .from("wa_devices")
      .select("id")
      .eq("is_active", true)
    if (agencyId && agencyId !== "all") {
      devQuery = devQuery.eq("agency_id", agencyId)
    }
    const { data: activeDevices } = await devQuery
    if (activeDevices && activeDevices.length > 0) {
      deviceIds = activeDevices.map((d: any) => d.id)
    }
  }

  // Get individual chat IDs (exclude groups unless includeGroups is true)
  let allowedChatIds: Set<string> | null = null
  if (!includeGroups) {
    let chatQuery = supabase
      .from("wa_chats")
      .select("id")
      .eq("is_group", false)
    if (deviceIds) {
      chatQuery = chatQuery.in("device_id", deviceIds)
    }
    const { data: individualChats } = await chatQuery
    allowedChatIds = new Set((individualChats || []).map((c: any) => c.id))
  }

  // Query messages directly (real-time)
  let query = supabase
    .from("wa_messages")
    .select("direction, sent_at, chat_id, message_type, media_mime_type")
    .order("sent_at", { ascending: true })

  if (deviceIds) {
    query = query.in("device_id", deviceIds)
  }
  if (fromDate) query = query.gte("sent_at", fromDate)
  if (toDate) query = query.lte("sent_at", toDate)

  const { data: messages, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Filter messages: exclude groups (unless toggled) and non-real message types
  const filteredMessages = (messages || []).filter((m: any) => {
    if (allowedChatIds && !allowedChatIds.has(m.chat_id)) return false
    if (EXCLUDED_MESSAGE_TYPES.has(m.message_type)) return false
    return true
  })

  // Get chats created in range (new contacts only) for "initiated" metric
  let newChatsQuery = supabase.from("wa_chats").select("id, created_at")
  if (deviceId && deviceId !== "all") {
    newChatsQuery = newChatsQuery.eq("device_id", deviceId)
  }
  if (!includeGroups) {
    newChatsQuery = newChatsQuery.eq("is_group", false)
  }
  if (fromDate) newChatsQuery = newChatsQuery.gte("created_at", fromDate)
  if (toDate) newChatsQuery = newChatsQuery.lte("created_at", toDate)
  const { data: newChats } = await newChatsQuery
  const newChatIds = new Set((newChats || []).map((c: any) => c.id))

  // Group by date
  const byDate = new Map<string, {
    inbound: number; outbound: number; pdfs: number;
    chatFirstInbound: Map<string, string>; chatFirstOutbound: Map<string, string>;
    chatFirstMsg: Map<string, { direction: string; sent_at: string }>
  }>()

  for (const m of filteredMessages) {
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
      // Only count actual PDF documents, not all document types
      if (m.message_type === "document" && isPdfDocument(m.media_mime_type)) {
        day.pdfs++
      }
    }

    // Track first message per chat per day
    const existing = day.chatFirstMsg.get(m.chat_id)
    if (!existing || m.sent_at < existing.sent_at) {
      day.chatFirstMsg.set(m.chat_id, { direction: m.direction, sent_at: m.sent_at })
    }
  }

  // Business hours helpers (Mon-Fri 9:00-17:00 Argentina UTC-3)
  const WORK_START_HOUR = 9
  const WORK_END_HOUR = 17
  const ARG_OFFSET_MS = -3 * 60 * 60 * 1000
  const HOUR_MS = 60 * 60 * 1000
  const BUSINESS_HOURS_PER_DAY = WORK_END_HOUR - WORK_START_HOUR

  function toArgentinaDate(iso: string): Date {
    return new Date(new Date(iso).getTime() + ARG_OFFSET_MS)
  }

  function businessSecondsBetween(startIso: string, endIso: string): number {
    const start = new Date(startIso).getTime()
    const end = new Date(endIso).getTime()
    if (end <= start) return 0

    let totalSeconds = 0
    const startArg = toArgentinaDate(startIso)
    const endArg = toArgentinaDate(endIso)
    const startDay = new Date(Date.UTC(startArg.getUTCFullYear(), startArg.getUTCMonth(), startArg.getUTCDate()))
    const endDay = new Date(Date.UTC(endArg.getUTCFullYear(), endArg.getUTCMonth(), endArg.getUTCDate()))

    const currentDay = new Date(startDay)
    while (currentDay <= endDay) {
      const dayOfWeek = currentDay.getUTCDay()
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        const bizStartUtc = currentDay.getTime() + (WORK_START_HOUR * HOUR_MS) - ARG_OFFSET_MS
        const bizEndUtc = currentDay.getTime() + (WORK_END_HOUR * HOUR_MS) - ARG_OFFSET_MS
        const overlapStart = Math.max(start, bizStartUtc)
        const overlapEnd = Math.min(end, bizEndUtc)
        if (overlapEnd > overlapStart) {
          totalSeconds += (overlapEnd - overlapStart) / 1000
        }
      }
      currentDay.setUTCDate(currentDay.getUTCDate() + 1)
    }
    return totalSeconds
  }

  // Build timeseries with response times
  const timeseries = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => {
      // Calculate avg response time for this day (business hours only)
      const responseTimes: number[] = []
      data.chatFirstInbound.forEach((inboundAt, chatId) => {
        const outboundAt = data.chatFirstOutbound.get(chatId)
        if (outboundAt) {
          const bizSeconds = businessSecondsBetween(inboundAt, outboundAt)
          if (bizSeconds > 0 && bizSeconds < BUSINESS_HOURS_PER_DAY * 5 * 3600) {
            responseTimes.push(bizSeconds)
          }
        }
      })

      // Count initiated conversations (first msg of NEW chat is outbound)
      let initiated = 0
      data.chatFirstMsg.forEach((info, chatId) => {
        if (info.direction === "outbound" && newChatIds.has(chatId)) initiated++
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
