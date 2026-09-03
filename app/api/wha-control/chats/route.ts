import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { whaControlAuthGuard } from "@/lib/wha-control/auth-guard"
import { getOrgFeatureFlag } from "@/lib/settings/org-features"
import { FEATURE_FLAG_WHA_QUOTE_FOLLOWUP } from "@/lib/feature-flags"

const SENT_BADGE_DAYS = 7

export async function GET(request: Request) {
  const auth = await whaControlAuthGuard()
  if (!auth.authorized) return auth.response

  const { searchParams } = new URL(request.url)
  const deviceId = searchParams.get("deviceId")
  const search = searchParams.get("search")
  const limit = parseInt(searchParams.get("limit") || "100")
  const offset = parseInt(searchParams.get("offset") || "0")

  if (!deviceId) {
    return NextResponse.json({ error: "deviceId is required" }, { status: 400 })
  }

  const supabase = createAdminClient() as any

  // SaaS: el device debe pertenecer a la org del caller.
  const { data: device } = await supabase
    .from("wa_devices")
    .select("id")
    .eq("id", deviceId)
    .eq("org_id", auth.orgId)
    .maybeSingle()
  if (!device) {
    return NextResponse.json({ error: "Device no encontrado" }, { status: 404 })
  }

  let query = supabase
    .from("wa_chats")
    .select("*")
    .eq("device_id", deviceId)
    .eq("org_id", auth.orgId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1)

  if (search) {
    query = query.or(
      `contact_name.ilike.%${search}%,push_name.ilike.%${search}%,contact_phone.ilike.%${search}%,remote_jid.ilike.%${search}%`
    )
  }

  const { data: chats, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // --- Merge detection for split conversations ---
  // WhatsApp LID migration can cause the same real conversation to be split
  // into two wa_chats records with different remote_jid values.
  // One chat ends up with only outbound messages, the other with only inbound.
  // We detect and merge these pairs.
  const mergedChats = await mergeConversationPairs(supabase, chats || [], deviceId)

  // Seguimiento post-cotización: anexar el followup activo/reciente por chat
  // para pintar badge y countdown en el inbox (solo con el flag ON).
  await attachQuoteFollowups(supabase, mergedChats, auth.orgId)

  return NextResponse.json({ chats: mergedChats })
}

async function attachQuoteFollowups(supabase: any, chats: any[], orgId: string) {
  if (chats.length === 0) return
  const flagOn = await getOrgFeatureFlag(
    supabase,
    orgId,
    FEATURE_FLAG_WHA_QUOTE_FOLLOWUP
  )
  if (!flagOn) return

  const allChatIds = chats.flatMap((c: any) => c._chatIds ?? [c.id])
  const { data: followups } = await supabase
    .from("wa_quote_followups")
    .select("id, chat_id, status, scheduled_for, sent_at, created_at")
    .in("chat_id", allChatIds)
    .eq("org_id", orgId)
    .in("status", ["PENDING", "PROCESSING", "SENT"])
    .order("created_at", { ascending: false })

  if (!followups || followups.length === 0) return

  const sentCutoff = Date.now() - SENT_BADGE_DAYS * 24 * 60 * 60 * 1000
  const byChatId: Record<string, any> = {}
  for (const f of followups) {
    // El más reciente por chat gana (vienen ordenados desc).
    if (!byChatId[f.chat_id]) byChatId[f.chat_id] = f
  }

  for (const chat of chats) {
    const ids: string[] = chat._chatIds ?? [chat.id]
    let best: any = null
    for (const id of ids) {
      const f = byChatId[id]
      if (!f) continue
      if (!best || new Date(f.created_at) > new Date(best.created_at)) best = f
    }
    if (!best) continue
    // El badge de "enviado" caduca para no quedar eterno.
    if (best.status === "SENT" && (!best.sent_at || new Date(best.sent_at).getTime() < sentCutoff)) {
      continue
    }
    chat.followup = {
      id: best.id,
      status: best.status,
      scheduled_for: best.scheduled_for,
      sent_at: best.sent_at,
    }
  }
}

async function mergeConversationPairs(supabase: any, chats: any[], deviceId: string) {
  if (chats.length < 2) return chats.map((c: any) => ({ ...c, _chatIds: [c.id] }))

  // Get direction stats for all chats in a single query
  const chatIds = chats.map((c: any) => c.id)
  const { data: directionStats } = await supabase
    .from("wa_messages")
    .select("chat_id, direction")
    .in("chat_id", chatIds)

  if (!directionStats || directionStats.length === 0) {
    return chats.map((c: any) => ({ ...c, _chatIds: [c.id] }))
  }

  // Compute direction profile per chat
  const chatDirections: Record<string, { inbound: number; outbound: number }> = {}
  for (const msg of directionStats) {
    if (!chatDirections[msg.chat_id]) {
      chatDirections[msg.chat_id] = { inbound: 0, outbound: 0 }
    }
    if (msg.direction === "inbound") chatDirections[msg.chat_id].inbound++
    if (msg.direction === "outbound") chatDirections[msg.chat_id].outbound++
  }

  // Identify single-direction chats
  const outboundOnly: any[] = [] // chats with ONLY outbound messages
  const inboundOnly: any[] = []  // chats with ONLY inbound messages
  const mixed: any[] = []        // chats with both directions (already correct)

  for (const chat of chats) {
    const dirs = chatDirections[chat.id]
    if (!dirs) {
      mixed.push(chat) // no messages = keep as-is
    } else if (dirs.inbound === 0 && dirs.outbound > 0) {
      outboundOnly.push(chat)
    } else if (dirs.outbound === 0 && dirs.inbound > 0) {
      inboundOnly.push(chat)
    } else {
      mixed.push(chat)
    }
  }

  // Try to pair outbound-only with inbound-only chats
  // Match based on overlapping time windows (messages sent around the same time)
  const mergedIds = new Set<string>()
  const mergedPairs: any[] = []

  for (const outChat of outboundOnly) {
    if (mergedIds.has(outChat.id)) continue

    // Find best inbound match: closest in time, not already merged
    let bestMatch: any = null
    let bestTimeDiff = Infinity

    for (const inChat of inboundOnly) {
      if (mergedIds.has(inChat.id)) continue

      // Compare last_message_at timestamps
      const outTime = outChat.last_message_at ? new Date(outChat.last_message_at).getTime() : 0
      const inTime = inChat.last_message_at ? new Date(inChat.last_message_at).getTime() : 0
      const diff = Math.abs(outTime - inTime)

      // Only merge if messages are within 24 hours of each other
      if (diff < 24 * 60 * 60 * 1000 && diff < bestTimeDiff) {
        bestTimeDiff = diff
        bestMatch = inChat
      }
    }

    if (bestMatch) {
      mergedIds.add(outChat.id)
      mergedIds.add(bestMatch.id)

      // Build merged chat: use richer metadata (usually from inbound which has push_name)
      const mergedChat = {
        ...bestMatch, // inbound chat usually has push_name/contact info
        // Use the most recent last_message_at
        last_message_at: (outChat.last_message_at && bestMatch.last_message_at)
          ? (new Date(outChat.last_message_at) > new Date(bestMatch.last_message_at)
            ? outChat.last_message_at : bestMatch.last_message_at)
          : outChat.last_message_at || bestMatch.last_message_at,
        // Use the most recent preview
        last_message_preview: (outChat.last_message_at && bestMatch.last_message_at)
          ? (new Date(outChat.last_message_at) > new Date(bestMatch.last_message_at)
            ? outChat.last_message_preview : bestMatch.last_message_preview)
          : outChat.last_message_preview || bestMatch.last_message_preview,
        // Combine unread counts
        unread_count: (outChat.unread_count || 0) + (bestMatch.unread_count || 0),
        // Use contact_name or push_name from whichever has it
        contact_name: bestMatch.contact_name || outChat.contact_name,
        push_name: bestMatch.push_name || outChat.push_name,
        contact_phone: bestMatch.contact_phone || outChat.contact_phone,
        // Store all chat IDs for message fetching
        _chatIds: [outChat.id, bestMatch.id],
      }

      mergedPairs.push(mergedChat)
    }
  }

  // Build final result: merged pairs + unmerged single-direction + mixed
  const result = [
    ...mergedPairs,
    ...outboundOnly.filter((c: any) => !mergedIds.has(c.id)).map((c: any) => ({ ...c, _chatIds: [c.id] })),
    ...inboundOnly.filter((c: any) => !mergedIds.has(c.id)).map((c: any) => ({ ...c, _chatIds: [c.id] })),
    ...mixed.map((c: any) => ({ ...c, _chatIds: [c.id] })),
  ]

  // Re-sort by last_message_at
  result.sort((a: any, b: any) => {
    const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
    const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
    return timeB - timeA
  })

  return result
}
