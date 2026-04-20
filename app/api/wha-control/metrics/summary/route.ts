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

  // Get device IDs to filter — SIEMPRE acotado al tenant del caller.
  let deviceIds: string[] | null = null
  if (deviceId && deviceId !== "all") {
    let devLookup = supabase
      .from("wa_devices")
      .select("id")
      .eq("id", deviceId)
      .eq("org_id", auth.orgId)
      .eq("is_active", true)
    if (agencyId && agencyId !== "all") {
      devLookup = devLookup.eq("agency_id", agencyId)
    }
    const { data: dev } = await devLookup.single()
    if (!dev) {
      return NextResponse.json({ summary: emptySummary() })
    }
    deviceIds = [deviceId]
  } else {
    let devQuery = supabase
      .from("wa_devices")
      .select("id")
      .eq("is_active", true)
      .eq("org_id", auth.orgId)
    if (agencyId && agencyId !== "all") {
      devQuery = devQuery.eq("agency_id", agencyId)
    }
    const { data: activeDevices } = await devQuery
    if (!activeDevices || activeDevices.length === 0) {
      return NextResponse.json({ summary: emptySummary() })
    }
    deviceIds = activeDevices.map((d: any) => d.id)
  }

  // Get individual chat IDs (exclude groups unless includeGroups is true)
  let allowedChatIds: Set<string> | null = null
  if (!includeGroups) {
    let chatQuery = supabase
      .from("wa_chats")
      .select("id")
      .eq("is_group", false)
      .order("id", { ascending: true })
    if (deviceIds) {
      chatQuery = chatQuery.in("device_id", deviceIds)
    }
    const individualChats = await fetchAllRows(chatQuery)
    allowedChatIds = new Set(individualChats.map((c: any) => c.id))
  }

  // Query all messages in range — WITHOUT raw_payload (too heavy for large datasets)
  let msgQuery = supabase
    .from("wa_messages")
    .select("id, device_id, chat_id, direction, sent_at, message_type, from_me, media_mime_type, media_file_name")
    .order("id", { ascending: true })

  if (deviceIds) {
    msgQuery = msgQuery.in("device_id", deviceIds)
  }
  if (fromDate) msgQuery = msgQuery.gte("sent_at", fromDate)
  if (toDate) msgQuery = msgQuery.lte("sent_at", toDate)

  let messages: any[]
  try {
    messages = await fetchAllRows(msgQuery)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }

  // Extract ONLY the mimetype/fileName from raw_payload JSON (not the full blob)
  // This avoids statement timeouts caused by fetching large raw_payload for 1000+ docs
  // Uses fetchAllRows to paginate past Supabase's max-rows limit (default 1000)
  let docMsgQuery = supabase
    .from("wa_messages")
    .select("id, doc_mime:raw_payload->message->documentMessage->>mimetype, doc_fname:raw_payload->message->documentMessage->>fileName, cap_mime:raw_payload->message->documentWithCaptionMessage->message->documentMessage->>mimetype, cap_fname:raw_payload->message->documentWithCaptionMessage->message->documentMessage->>fileName")
    .eq("message_type", "document")
    .order("id", { ascending: true })

  if (deviceIds) {
    docMsgQuery = docMsgQuery.in("device_id", deviceIds)
  }
  if (fromDate) docMsgQuery = docMsgQuery.gte("sent_at", fromDate)
  if (toDate) docMsgQuery = docMsgQuery.lte("sent_at", toDate)

  // Build lookup set: message IDs confirmed as PDFs via server-side JSON extraction
  const docPdfSet = new Set<string>()
  try {
    const docRows = await fetchAllRows(docMsgQuery)
    for (const d of docRows) {
      const mime = d.doc_mime || d.cap_mime
      const fname = d.doc_fname || d.cap_fname
      if (mime?.toLowerCase() === "application/pdf") { docPdfSet.add(d.id); continue }
      if (fname?.toLowerCase().endsWith(".pdf")) { docPdfSet.add(d.id); continue }
    }
  } catch {
    // Non-critical: PDF fallback detection will be incomplete
  }

  const msgs = (messages || []).filter((m: any) => {
    // Filter out group messages if not including groups
    if (allowedChatIds && !allowedChatIds.has(m.chat_id)) return false
    // Filter out non-real message types (reactions, stickers, etc.)
    if (EXCLUDED_MESSAGE_TYPES.has(m.message_type)) return false
    return true
  })

  // Count inbound/outbound + PDFs + initiated conversations
  let inbound_count = 0
  let outbound_count = 0
  let pdfs_sent_count = 0
  let pdfs_received_count = 0
  const chatIds = new Set<string>()
  const inboundChatIds = new Set<string>()
  const outboundChatIds = new Set<string>()
  // Track first message per chat to detect who initiated
  const chatFirstMessage = new Map<string, { direction: string; sent_at: string }>()

  for (const m of msgs) {
    chatIds.add(m.chat_id)

    // Count PDFs for ALL directions (both sent and received)
    if (m.message_type === "document" && isPdfDocument(m, docPdfSet)) {
      if (m.direction === "outbound") {
        pdfs_sent_count++
      } else if (m.direction === "inbound") {
        pdfs_received_count++
      }
    }

    if (m.direction === "inbound") {
      inbound_count++
      inboundChatIds.add(m.chat_id)
    } else if (m.direction === "outbound") {
      outbound_count++
      outboundChatIds.add(m.chat_id)
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
    .order("id", { ascending: true })
  if (deviceIds) {
    newChatsForInitiatedQuery = newChatsForInitiatedQuery.in("device_id", deviceIds)
  }
  if (!includeGroups) {
    newChatsForInitiatedQuery = newChatsForInitiatedQuery.eq("is_group", false)
  }
  if (fromDate) newChatsForInitiatedQuery = newChatsForInitiatedQuery.gte("created_at", fromDate)
  if (toDate) newChatsForInitiatedQuery = newChatsForInitiatedQuery.lte("created_at", toDate)
  const newChatsForInitiated = await fetchAllRows(newChatsForInitiatedQuery)
  const newChatIds = new Set(newChatsForInitiated.map((c: any) => c.id))

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

  // Calculate business seconds between two timestamps
  // Only counts time during Mon-Fri 9:00-17:00 Argentina time
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
      // Skip weekends
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
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
    pdfs_received_count,
    pdfs_total_count: pdfs_sent_count + pdfs_received_count,
  }

  return NextResponse.json({ summary })
}

/** Check if a document is a PDF based on mime type, file name, OR docPdfSet (server-side JSON extraction) */
function isPdfDocument(msg: any, docPdfSet?: Set<string>): boolean {
  // 1. Check direct columns
  if (msg.media_mime_type) {
    if (msg.media_mime_type.toLowerCase() === "application/pdf") return true
  }
  if (msg.media_file_name) {
    if (msg.media_file_name.toLowerCase().endsWith(".pdf")) return true
  }

  // 2. Fallback: check server-side extracted PDF set (from raw_payload JSON fields)
  if (docPdfSet?.has(msg.id)) return true

  return false
}

/** Return an empty summary object */
function emptySummary() {
  return {
    inbound_count: 0,
    outbound_count: 0,
    active_chats_count: 0,
    new_chats_count: 0,
    responded_chats_count: 0,
    unanswered_chats_count: 0,
    avg_first_response_seconds: null,
    initiated_count: 0,
    pdfs_sent_count: 0,
    pdfs_received_count: 0,
    pdfs_total_count: 0,
  }
}

/**
 * Fetch all rows from a Supabase query, paginating past the 1000-row default limit.
 */
async function fetchAllRows<T = any>(queryBuilder: any): Promise<T[]> {
  const PAGE_SIZE = 1000
  const allData: T[] = []
  let offset = 0
  while (true) {
    const { data, error } = await queryBuilder.range(offset, offset + PAGE_SIZE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    allData.push(...data)
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return allData
}
