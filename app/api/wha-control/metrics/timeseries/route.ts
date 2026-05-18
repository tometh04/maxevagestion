import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { whaControlAuthGuard } from "@/lib/wha-control/auth-guard"

// Message types that don't count as real messages (reactions, stickers, etc.)
const EXCLUDED_MESSAGE_TYPES = new Set(["reaction", "sticker", "unknown"])

/** Check if a document is a PDF based on mime type, file name, OR docPdfSet (server-side JSON extraction) */
function isPdfDocument(msg: any, docPdfSet?: Set<string>): boolean {
  if (msg.media_mime_type) {
    if (msg.media_mime_type.toLowerCase() === "application/pdf") return true
  }
  if (msg.media_file_name) {
    if (msg.media_file_name.toLowerCase().endsWith(".pdf")) return true
  }
  // Fallback: check server-side extracted PDF set (from raw_payload JSON fields)
  if (docPdfSet?.has(msg.id)) return true
  return false
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

export async function GET(request: Request) {
  const auth = await whaControlAuthGuard()
  if (!auth.authorized) return auth.response

  const { searchParams } = new URL(request.url)
  const deviceId = searchParams.get("deviceId")
  const agencyId = searchParams.get("agencyId")
  const dateFrom = searchParams.get("dateFrom")
  const dateTo = searchParams.get("dateTo")
  const includeGroups = searchParams.get("includeGroups") === "true"

  // adminDb justificado: las tablas wa_devices/wa_chats/wa_messages no tienen
  // org_id en wa_chats/wa_messages — el scope cross-tenant se hace via
  // device_id (wa_devices SÍ tiene org_id, filtrado por auth.orgId arriba).
  // Defense-in-depth: cualquier query a chats/messages debe ir filtrada por
  // device_ids que ya están scopeados a auth.orgId.
  const supabase = createAdminClient() as any

  const fromDate = dateFrom ? `${dateFrom}T00:00:00.000Z` : undefined
  const toDate = dateTo ? `${dateTo}T23:59:59.999Z` : undefined

  // Get device IDs to filter — acotado al tenant del caller.
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
      return NextResponse.json({ timeseries: [] })
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
      .order("id", { ascending: true })
    if (deviceIds) {
      chatQuery = chatQuery.in("device_id", deviceIds)
    }
    const individualChats = await fetchAllRows(chatQuery)
    allowedChatIds = new Set(individualChats.map((c: any) => c.id))
  }

  // Query messages — WITHOUT raw_payload (too heavy for large datasets)
  let query = supabase
    .from("wa_messages")
    .select("id, direction, sent_at, chat_id, message_type, media_mime_type, media_file_name")
    .order("sent_at", { ascending: true })

  if (deviceIds) {
    query = query.in("device_id", deviceIds)
  }
  if (fromDate) query = query.gte("sent_at", fromDate)
  if (toDate) query = query.lte("sent_at", toDate)

  let messages: any[]
  try {
    messages = await fetchAllRows(query)
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

  // Filter messages: exclude groups (unless toggled) and non-real message types
  const filteredMessages = (messages || []).filter((m: any) => {
    if (allowedChatIds && !allowedChatIds.has(m.chat_id)) return false
    if (EXCLUDED_MESSAGE_TYPES.has(m.message_type)) return false
    return true
  })

  // Get chats created in range (new contacts only) for "initiated" metric
  let newChatsQuery = supabase.from("wa_chats").select("id, created_at").order("id", { ascending: true })
  if (deviceIds) {
    newChatsQuery = newChatsQuery.in("device_id", deviceIds)
  }
  if (!includeGroups) {
    newChatsQuery = newChatsQuery.eq("is_group", false)
  }
  if (fromDate) newChatsQuery = newChatsQuery.gte("created_at", fromDate)
  if (toDate) newChatsQuery = newChatsQuery.lte("created_at", toDate)
  const newChats = await fetchAllRows(newChatsQuery)
  const newChatIds = new Set(newChats.map((c: any) => c.id))

  // Group by date
  const byDate = new Map<string, {
    inbound: number; outbound: number; pdfs_sent: number; pdfs_received: number;
    chatFirstInbound: Map<string, string>; chatFirstOutbound: Map<string, string>;
    chatFirstMsg: Map<string, { direction: string; sent_at: string }>
  }>()

  for (const m of filteredMessages) {
    const dateStr = m.sent_at.substring(0, 10)
    if (!byDate.has(dateStr)) {
      byDate.set(dateStr, {
        inbound: 0, outbound: 0, pdfs_sent: 0, pdfs_received: 0,
        chatFirstInbound: new Map(), chatFirstOutbound: new Map(),
        chatFirstMsg: new Map()
      })
    }
    const day = byDate.get(dateStr)!

    // Count PDFs for both directions
    if (m.message_type === "document" && isPdfDocument(m, docPdfSet)) {
      if (m.direction === "outbound") {
        day.pdfs_sent++
      } else if (m.direction === "inbound") {
        day.pdfs_received++
      }
    }

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
        pdfs_sent: data.pdfs_sent,
        pdfs_received: data.pdfs_received,
        pdfs: data.pdfs_sent + data.pdfs_received,
        initiated,
        avg_response: responseTimes.length > 0
          ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
          : null,
      }
    })

  return NextResponse.json({ timeseries })
}
