import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { whaControlAuthGuard } from "@/lib/wha-control/auth-guard"

// Message types that don't count as real messages (reactions, stickers, etc.)
const EXCLUDED_MESSAGE_TYPES = new Set(["reaction", "sticker", "unknown"])

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

  // Build date filters
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

  // Query all messages in range directly (real-time, no pre-aggregation)
  let msgQuery = supabase
    .from("wa_messages")
    .select("id, device_id, chat_id, direction, sent_at, message_type, from_me, media_mime_type")

  if (deviceIds) {
    msgQuery = msgQuery.in("device_id", deviceIds)
  }
  if (fromDate) msgQuery = msgQuery.gte("sent_at", fromDate)
  if (toDate) msgQuery = msgQuery.lte("sent_at", toDate)

  const { data: messages, error } = await msgQuery

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const msgs = (messages || []).filter((m: any) => {
    // Filter out group messages if not including groups
    if (allowedChatIds && !allowedChatIds.has(m.chat_id)) return false
    // Filter out non-real message types (reactions, stickers, etc.)
    if (EXCLUDED_MESSAGE_TYPES.has(m.message_type)) return false
    return true
  })

  // Count inbound/outbound + PDFs sent + initiated conversations
  let inbound_count = 0
  let outbound_count = 0
  let pdfs_sent_count = 0
  const chatIds = new Set<string>()
  const inboundChatIds = new Set<string>()
  const outboundChatIds = new Set<string>()
  // Track first message per chat to detect who initiated
  const chatFirstMessage = new Map<string, { direction: string; sent_at: string }>()

  for (const m of msgs) {
    chatIds.add(m.chat_id)
    if (m.direction === "inbound") {
      inbound_count++
      inboundChatIds.add(m.chat_id)
    } else if (m.direction === "outbound") {
      outbound_count++
      outboundChatIds.add(m.chat_id)
      // Count PDFs sent: only actual PDF documents, not all document types
      if (m.message_type === "document" && isPdfDocument(m.media_mime_type)) {
        pdfs_sent_count++
      }
    }
    // Track first message in each chat
    const existing = chatFirstMessage.get(m.chat_id)
    if (!existing || m.sent_at < existing.sent_at) {
      chatFirstMessage.set(m.chat_id, { direction: m.direction, sent_at: m.sent_at })
    }
  }

  // Get chats created in this date range (new contacts only)
  let newChatsForInitiatedQuery = supabase
    .from("wa_chats")
    .select("id")
  if (deviceId && deviceId !== "all") {
    newChatsForInitiatedQuery = newChatsForInitiatedQuery.eq("device_id", deviceId)
  }
  if (!includeGroups) {
    newChatsForInitiatedQuery = newChatsForInitiatedQuery.eq("is_group", false)
  }
  if (fromDate) newChatsForInitiatedQuery = newChatsForInitiatedQuery.gte("created_at", fromDate)
  if (toDate) newChatsForInitiatedQuery = newChatsForInitiatedQuery.lte("created_at", toDate)
  const { data: newChatsForInitiated } = await newChatsForInitiatedQuery
  const newChatIds = new Set((newChatsForInitiated || []).map((c: any) => c.id))

  // Initiated = NEW chats where the first message was outbound (device started conversation with new contact)
  let initiated_count = 0
  chatFirstMessage.forEach((data, chatId) => {
    if (data.direction === "outbound" && newChatIds.has(chatId)) initiated_count++
  })

  // Responded = chats that have both inbound and outbound
  let respondedCount = 0
  Array.from(inboundChatIds).forEach((chatId) => {
    if (outboundChatIds.has(chatId)) {
      respondedCount++
    }
  })

  // Unanswered = inbound chats without outbound reply
  const unansweredCount = inboundChatIds.size - respondedCount

  // Count new chats in range (only from active devices)
  let newChatsQuery = supabase
    .from("wa_chats")
    .select("id", { count: "exact", head: true })
  if (deviceIds) {
    newChatsQuery = newChatsQuery.in("device_id", deviceIds)
  }
  if (!includeGroups) {
    newChatsQuery = newChatsQuery.eq("is_group", false)
  }
  if (fromDate) newChatsQuery = newChatsQuery.gte("created_at", fromDate)
  if (toDate) newChatsQuery = newChatsQuery.lte("created_at", toDate)
  const { count: newChatsCount } = await newChatsQuery

  // Calculate avg response time per chat (first inbound → first outbound)
  // Only count business hours: Mon-Fri 9:00-17:00 (Argentina timezone UTC-3)
  const WORK_START_HOUR = 9
  const WORK_END_HOUR = 17
  const ARG_OFFSET_MS = -3 * 60 * 60 * 1000 // UTC-3
  const HOUR_MS = 60 * 60 * 1000
  const BUSINESS_HOURS_PER_DAY = WORK_END_HOUR - WORK_START_HOUR

  function toArgentinaDate(iso: string): Date {
    const utc = new Date(iso)
    return new Date(utc.getTime() + ARG_OFFSET_MS)
  }

  function isBusinessHours(iso: string): boolean {
    const arg = toArgentinaDate(iso)
    const day = arg.getUTCDay() // 0=Sun, 6=Sat
    if (day === 0 || day === 6) return false
    const hour = arg.getUTCHours()
    return hour >= WORK_START_HOUR && hour < WORK_END_HOUR
  }

  // Calculate business seconds between two timestamps
  // Only counts time during Mon-Fri 9:00-17:00 Argentina time
  function businessSecondsBetween(startIso: string, endIso: string): number {
    const start = new Date(startIso).getTime()
    const end = new Date(endIso).getTime()
    if (end <= start) return 0

    let totalSeconds = 0

    // Walk through each day between start and end
    const startArg = toArgentinaDate(startIso)
    const endArg = toArgentinaDate(endIso)

    // Simple approach: iterate day by day
    const startDay = new Date(Date.UTC(startArg.getUTCFullYear(), startArg.getUTCMonth(), startArg.getUTCDate()))
    const endDay = new Date(Date.UTC(endArg.getUTCFullYear(), endArg.getUTCMonth(), endArg.getUTCDate()))

    const currentDay = new Date(startDay)
    while (currentDay <= endDay) {
      const dayOfWeek = currentDay.getUTCDay()
      // Skip weekends
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        // Business start/end for this day in UTC (adjusted for Argentina)
        const bizStartUtc = new Date(currentDay).getTime() + (WORK_START_HOUR * HOUR_MS) - ARG_OFFSET_MS
        const bizEndUtc = new Date(currentDay).getTime() + (WORK_END_HOUR * HOUR_MS) - ARG_OFFSET_MS

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
      const firstInbound = data.inbound.sort()[0]
      const firstOutbound = data.outbound.sort()[0]
      if (firstOutbound > firstInbound) {
        const bizSeconds = businessSecondsBetween(firstInbound, firstOutbound)
        // Only count if response happened within reasonable business time (max 5 business days)
        if (bizSeconds > 0 && bizSeconds < BUSINESS_HOURS_PER_DAY * 5 * 3600) {
          responseTimes.push(bizSeconds)
        }
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
    initiated_count,
    pdfs_sent_count,
  }

  return NextResponse.json({ summary })
}

/** Check if a document is a PDF based on mime type */
function isPdfDocument(mimeType: string | null | undefined): boolean {
  if (!mimeType) return true // If no mime type, assume it could be a PDF (backwards compat)
  const mime = mimeType.toLowerCase()
  return mime === "application/pdf" || mime.includes("pdf")
}
