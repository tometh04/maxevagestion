import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { whaControlAuthGuard } from "@/lib/wha-control/auth-guard"
import { getOrgFeatureFlag } from "@/lib/settings/org-features"
import { FEATURE_FLAG_WHA_QUOTE_FOLLOWUP } from "@/lib/feature-flags"
import { mergeConversationPairs as mergeConversationPairsPure } from "@/lib/wha-control/merge-chats"

// Cuánto sigue visible en el listado un seguimiento que ya terminó. Sin esto el
// estado desaparecía apenas se enviaba o cancelaba, y el vendedor no tenía
// forma de saber si su marca había hecho algo.
const FINISHED_BADGE_DAYS = 2

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

  // La migración LID de WhatsApp puede partir una misma conversación en dos
  // filas de wa_chats (una `@lid` y otra con el número). Se reunifican para no
  // mostrarlas duplicadas ni con el hilo vacío.
  const mergedChats = await mergeConversationPairs(supabase, chats || [], deviceId)

  // Seguimiento post-cotización: anexar el followup activo/reciente por chat
  // para pintar badge y countdown en el inbox (solo con el flag ON).
  await attachQuoteFollowups(supabase, mergedChats, auth.orgId)

  await attachUnreadCounts(supabase, mergedChats, auth.orgId)

  return NextResponse.json({ chats: mergedChats })
}

/**
 * No leídos reales: mensajes entrantes posteriores a la última vez que la
 * conversación se abrió EN VIBOOK. El `unread_count` que trae WhatsApp refleja
 * lo que el dueño del teléfono leyó en su celular, así que no sirve acá.
 */
async function attachUnreadCounts(supabase: any, chats: any[], orgId: string) {
  if (chats.length === 0) return

  const allChatIds = chats.flatMap((c: any) => c._chatIds ?? [c.id])
  const { data, error } = await supabase.rpc("wa_unread_counts", {
    p_org_id: orgId,
    p_chat_ids: allChatIds,
  })

  if (error) {
    console.error("[wha-control/chats] error contando no leídos:", error.message)
    return
  }

  const byChatId = new Map<string, number>()
  for (const row of data || []) {
    byChatId.set(row.chat_id, Number(row.unread) || 0)
  }

  for (const chat of chats) {
    const ids: string[] = chat._chatIds ?? [chat.id]
    // Las dos mitades de una conversación partida suman al mismo contador.
    chat.unread = ids.reduce((total, id) => total + (byChatId.get(id) ?? 0), 0)
  }
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
    .select(
      "id, chat_id, status, scheduled_for, sent_at, cancelled_at, cancelled_reason, created_at"
    )
    .in("chat_id", allChatIds)
    .eq("org_id", orgId)
    .in("status", ["PENDING", "PROCESSING", "SENT", "CANCELLED", "FAILED"])
    .order("created_at", { ascending: false })

  if (!followups || followups.length === 0) return

  const finishedCutoff = Date.now() - FINISHED_BADGE_DAYS * 24 * 60 * 60 * 1000
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
    // Los estados terminales caducan para no quedar eternos en el listado.
    if (best.status !== "PENDING" && best.status !== "PROCESSING") {
      const terminadoEn = best.sent_at || best.cancelled_at || best.created_at
      if (!terminadoEn || new Date(terminadoEn).getTime() < finishedCutoff) continue
    }
    chat.followup = {
      id: best.id,
      status: best.status,
      scheduled_for: best.scheduled_for,
      sent_at: best.sent_at,
      cancelled_reason: best.cancelled_reason,
    }
  }
}

async function mergeConversationPairs(supabase: any, chats: any[], deviceId: string) {
  const lidJids = chats
    .filter((c: any) => !c.is_group && String(c.remote_jid || "").endsWith("@lid"))
    .map((c: any) => c.remote_jid)

  if (lidJids.length === 0) {
    return chats.map((c: any) => ({ ...c, _chatIds: [c.id] }))
  }

  // Lookup indexado por (device_id, lid_jid) y acotado a los LID de esta página.
  // Antes acá se leía la dirección de TODOS los mensajes de los chats listados
  // en cada refresco de 30s, que en dispositivos con miles de mensajes era la
  // consulta más cara del inbox.
  const { data: lidMap } = await supabase
    .from("wa_lid_map")
    .select("lid_jid, phone_jid")
    .eq("device_id", deviceId)
    .in("lid_jid", lidJids)

  return mergeConversationPairsPure(chats, lidMap)
}
