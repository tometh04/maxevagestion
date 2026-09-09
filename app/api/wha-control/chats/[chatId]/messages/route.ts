import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { whaControlAuthGuard } from "@/lib/wha-control/auth-guard"
import { filterAccessibleChatIds, scopeFromAuth } from "@/lib/wha-control/access"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const auth = await whaControlAuthGuard()
  if (!auth.authorized) return auth.response

  const { chatId } = await params
  const { searchParams } = new URL(request.url)
  const limit = parseInt(searchParams.get("limit") || "100")
  const before = searchParams.get("before")
  // Support merged conversations: comma-separated extra chat IDs
  const extraChatIds = searchParams.get("chatIds")


  // adminDb justificado: wa_messages SÍ tiene org_id (filtramos abajo).
  // wa_chats también — pre-validamos los chatIds contra el orgId antes de
  // listar mensajes para evitar leaks por forge de URL.
  const supabase = createAdminClient() as any

  // Build list of all chat IDs to query (primary + extras from merged conversations)
  const requestedChatIds = [chatId]
  if (extraChatIds) {
    const extras = extraChatIds.split(",").map((id) => id.trim()).filter(Boolean)
    for (const id of extras) {
      if (!requestedChatIds.includes(id)) requestedChatIds.push(id)
    }
  }

  // Pre-validar que TODOS los chatIds sean de la org y, para un vendedor, de su
  // propio teléfono: los ids extra vienen de la URL y hay que tratarlos como
  // entrada del usuario.
  const allChatIds = await filterAccessibleChatIds(
    supabase,
    scopeFromAuth(auth),
    requestedChatIds
  )
  if (allChatIds.length === 0) {
    return NextResponse.json({ messages: [] })
  }

  // `sender_name` sale del pushName que viene dentro de raw_payload. Se extrae
  // en la base y no se trae la columna entera: raw_payload pesa ~2,6 kB por
  // mensaje (hasta 85 kB), así que una ventana de 100 movía ~260 kB —y en el
  // peor caso varios MB— en cada refresco, para leer un solo campo y descartar
  // todo lo demás.
  let query = supabase
    .from("wa_messages")
    .select(
      "id, direction, message_type, body_text, sent_at, from_me, participant_jid, sender_name:raw_payload->>pushName"
    )
    .eq("org_id", auth.orgId) // SaaS tenant scope

  // Use .in() for multiple chat IDs, .eq() for single
  if (allChatIds.length === 1) {
    query = query.eq("chat_id", chatId)
  } else {
    query = query.in("chat_id", allChatIds)
  }

  // Traer la ventana MÁS NUEVA primero (sent_at DESC + limit) y revertir abajo,
  // para que el hilo muestre los últimos mensajes, no los 100 más viejos. El
  // cursor `before` pagina hacia atrás (mensajes anteriores a esa fecha).
  query = query.order("sent_at", { ascending: false }).limit(limit)

  if (before) {
    query = query.lt("sent_at", before)
  }

  const { data: messages, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Si vinieron `limit` filas, probablemente hay más historial hacia atrás.
  const hasMore = (messages || []).length === limit

  // Revertimos a orden ascendente (contrato que espera la UI: más viejo → más nuevo).
  const enriched = (messages || [])
    .slice()
    .reverse()
    .map((msg: any) => ({ ...msg, sender_name: msg.sender_name || null }))

  return NextResponse.json({ messages: enriched, hasMore })
}
