import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { whaControlAuthGuard } from "@/lib/wha-control/auth-guard"
import { getOrgFeatureFlag } from "@/lib/settings/org-features"
import { FEATURE_FLAG_WHA_QUOTE_FOLLOWUP } from "@/lib/feature-flags"
import { mergeConversationPairs as mergeConversationPairsPure } from "@/lib/wha-control/merge-chats"
import { getAccessibleDevice, scopeFromAuth } from "@/lib/wha-control/access"

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

  // El device debe ser de la org y, si quien pregunta es un vendedor, suyo:
  // sin esto alcanzaba con cambiar el id en la URL para leer el WhatsApp de un
  // compañero.
  const device = await getAccessibleDevice(supabase, scopeFromAuth(auth), deviceId, "id")
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

  // Se mide contra la página cruda: el merge puede sumar la otra mitad de una
  // conversación partida o fusionar dos filas en una, así que el largo del
  // resultado no dice nada sobre si quedan más por traer.
  const hasMore = (chats?.length ?? 0) >= limit

  return NextResponse.json({ chats: mergedChats, hasMore })
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
  const individuales = chats.filter((c: any) => !c.is_group)
  const lidJids = individuales
    .filter((c: any) => String(c.remote_jid || "").endsWith("@lid"))
    .map((c: any) => c.remote_jid)
  const phoneJids = individuales
    .filter((c: any) => !String(c.remote_jid || "").endsWith("@lid"))
    .map((c: any) => c.remote_jid)

  if (lidJids.length === 0 && phoneJids.length === 0) {
    return chats.map((c: any) => ({ ...c, _chatIds: [c.id] }))
  }

  // Lookup indexado por (device_id, lid_jid) y acotado a lo que hay en la
  // página. Antes acá se leía la dirección de TODOS los mensajes de los chats
  // listados en cada refresco, que en dispositivos con miles de mensajes era la
  // consulta más cara del inbox.
  // Dos consultas en vez de un `or`: los JID traen `@` y `.`, que hay que
  // escapar a mano en el filtro compuesto de PostgREST y es fácil de romper.
  const mapQuery = () =>
    supabase.from("wa_lid_map").select("lid_jid, phone_jid").eq("device_id", deviceId)
  const [porLid, porTelefono] = await Promise.all([
    lidJids.length ? mapQuery().in("lid_jid", lidJids) : Promise.resolve({ data: [] }),
    phoneJids.length ? mapQuery().in("phone_jid", phoneJids) : Promise.resolve({ data: [] }),
  ])
  const lidMap = Array.from(
    new Map(
      [...(porLid.data ?? []), ...(porTelefono.data ?? [])].map((r: any) => [
        r.lid_jid,
        r,
      ])
    ).values()
  )

  // Las dos mitades de una conversación tienen fechas distintas, así que una
  // puede caer fuera de la página y la otra no: sin esto la conversación se
  // seguía viendo partida, con la mitad @lid mostrando un id numérico en vez
  // del contacto. Se traen las mitades faltantes por JID (índice único).
  const presentes = new Set(individuales.map((c: any) => c.remote_jid))
  const faltantes: string[] = []
  for (const row of lidMap || []) {
    if (presentes.has(row.lid_jid) && !presentes.has(row.phone_jid)) {
      faltantes.push(row.phone_jid)
    } else if (presentes.has(row.phone_jid) && !presentes.has(row.lid_jid)) {
      faltantes.push(row.lid_jid)
    }
  }

  let completos = chats
  if (faltantes.length > 0) {
    const { data: mitades } = await supabase
      .from("wa_chats")
      .select("*")
      .eq("device_id", deviceId)
      .in("remote_jid", Array.from(new Set(faltantes)))
    if (mitades?.length) completos = [...chats, ...mitades]
  }

  return mergeConversationPairsPure(completos, lidMap)
}
