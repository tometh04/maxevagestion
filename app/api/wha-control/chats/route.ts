import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { whaControlAuthGuard } from "@/lib/wha-control/auth-guard"

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

  let query = supabase
    .from("wa_chats")
    .select("*")
    .eq("device_id", deviceId)
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

  return NextResponse.json({ chats: mergedChats })
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
