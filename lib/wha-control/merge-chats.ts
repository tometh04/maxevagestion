/**
 * Reunifica conversaciones partidas por la migración LID de WhatsApp.
 *
 * WhatsApp puede partir la conversación de UNA PERSONA en dos filas de
 * `wa_chats`: una identificada con `<id>@lid` y otra con el número
 * (`<numero>@s.whatsapp.net`). Los mensajes suelen quedar en una de las dos y
 * el preview en la otra, así que en el inbox se ve una conversación duplicada
 * y una de las mitades aparece vacía.
 *
 * Los grupos (`@g.us`) nunca se parten, por eso quedan fuera del apareo:
 * aparear solo por cercanía de tiempo, sin mirar el tipo de JID, metía los
 * mensajes privados de una persona dentro de la conversación de un grupo.
 */

export interface MergeableChat {
  id: string
  remote_jid: string
  is_group?: boolean | null
  contact_name?: string | null
  push_name?: string | null
  contact_phone?: string | null
  unread_count?: number | null
  last_message_at?: string | null
  last_message_preview?: string | null
  [key: string]: any
}

export interface DirectionStat {
  chat_id: string
  direction: string
}

/** Ventana máxima entre las dos mitades para considerarlas la misma charla. */
const MERGE_WINDOW_MS = 24 * 60 * 60 * 1000

const isLid = (chat: MergeableChat) =>
  String(chat.remote_jid || "").endsWith("@lid")

const timeOf = (value: string | null | undefined) =>
  value ? new Date(value).getTime() : 0

export function mergeConversationPairs(
  chats: MergeableChat[],
  directionStats: DirectionStat[] | null
): MergeableChat[] {
  const single = (list: MergeableChat[]) =>
    list.map((c) => ({ ...c, _chatIds: [c.id] }))

  if (chats.length < 2) return single(chats)
  if (!directionStats || directionStats.length === 0) return single(chats)

  const directions: Record<string, { inbound: number; outbound: number }> = {}
  for (const msg of directionStats) {
    if (!directions[msg.chat_id]) {
      directions[msg.chat_id] = { inbound: 0, outbound: 0 }
    }
    if (msg.direction === "inbound") directions[msg.chat_id].inbound++
    if (msg.direction === "outbound") directions[msg.chat_id].outbound++
  }
  const dirsOf = (chat: MergeableChat) =>
    directions[chat.id] || { inbound: 0, outbound: 0 }

  const lidChats = chats.filter((c) => !c.is_group && isLid(c))
  const phoneChats = chats.filter((c) => !c.is_group && !isLid(c))

  const mergedIds = new Set<string>()
  const mergedPairs: MergeableChat[] = []

  for (const lidChat of lidChats) {
    if (mergedIds.has(lidChat.id)) continue
    const lidDirs = dirsOf(lidChat)

    let bestMatch: MergeableChat | null = null
    let bestTimeDiff = Infinity

    for (const phoneChat of phoneChats) {
      if (mergedIds.has(phoneChat.id)) continue
      const phoneDirs = dirsOf(phoneChat)

      // Las mitades tienen que ser complementarias: si ambas tienen mensajes en
      // la misma dirección son conversaciones distintas, no una partida. La
      // mitad del número suele quedarse sin mensajes (solo el preview), y ese
      // caso también cuenta como complementario.
      const complementarias =
        (lidDirs.inbound === 0 || phoneDirs.inbound === 0) &&
        (lidDirs.outbound === 0 || phoneDirs.outbound === 0)
      if (!complementarias) continue

      const diff = Math.abs(
        timeOf(lidChat.last_message_at) - timeOf(phoneChat.last_message_at)
      )
      if (diff < MERGE_WINDOW_MS && diff < bestTimeDiff) {
        bestTimeDiff = diff
        bestMatch = phoneChat
      }
    }

    if (!bestMatch) continue

    mergedIds.add(lidChat.id)
    mergedIds.add(bestMatch.id)

    const lidIsNewer =
      timeOf(lidChat.last_message_at) > timeOf(bestMatch.last_message_at)

    // La fila del número manda para identificar al contacto (tiene el teléfono
    // real); del lado @lid se toma lo que falte.
    mergedPairs.push({
      ...bestMatch,
      last_message_at: lidIsNewer
        ? lidChat.last_message_at ?? bestMatch.last_message_at
        : bestMatch.last_message_at ?? lidChat.last_message_at,
      last_message_preview: lidIsNewer
        ? lidChat.last_message_preview ?? bestMatch.last_message_preview
        : bestMatch.last_message_preview ?? lidChat.last_message_preview,
      unread_count: (lidChat.unread_count || 0) + (bestMatch.unread_count || 0),
      contact_name: bestMatch.contact_name || lidChat.contact_name,
      push_name: bestMatch.push_name || lidChat.push_name,
      contact_phone: bestMatch.contact_phone || lidChat.contact_phone,
      // Ambos ids: el hilo se arma leyendo los mensajes de las dos mitades.
      _chatIds: [lidChat.id, bestMatch.id],
    })
  }

  const result = [
    ...mergedPairs,
    ...single(chats.filter((c) => !mergedIds.has(c.id))),
  ]

  result.sort(
    (a, b) => timeOf(b.last_message_at) - timeOf(a.last_message_at)
  )

  return result
}
