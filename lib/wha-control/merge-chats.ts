/**
 * Reunifica conversaciones partidas por la migración LID de WhatsApp.
 *
 * WhatsApp identifica al mismo contacto con dos JID: el del número
 * (`<numero>@s.whatsapp.net`) y un LID (`<id>@lid`). El connector canoniza los
 * mensajes ENTRANTES usando `key.senderPn`, pero los SALIENTES a un LID no
 * traen ese dato, así que quedan en un chat aparte y la conversación se ve
 * partida: una mitad con los mensajes y otra que solo muestra el preview.
 *
 * El apareo se hace con el mapeo REAL (tabla `wa_lid_map`, poblada desde el
 * `senderPn` que viene en el payload crudo de los entrantes). La versión
 * anterior lo adivinaba emparejando un chat "solo salientes" con uno "solo
 * entrantes" por cercanía de tiempo: mezclaba conversaciones de personas
 * distintas, metía mensajes privados dentro de grupos, y obligaba a leer la
 * dirección de todos los mensajes del listado en cada refresco.
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

export interface LidMapping {
  lid_jid: string
  phone_jid: string
}

const timeOf = (value: string | null | undefined) =>
  value ? new Date(value).getTime() : 0

const isLid = (chat: MergeableChat) =>
  String(chat.remote_jid || "").endsWith("@lid")

/** `5493417417442@s.whatsapp.net` → `5493417417442` */
const jidToPhone = (jid: string) => String(jid || "").split("@")[0]

export function mergeConversationPairs(
  chats: MergeableChat[],
  lidMap: LidMapping[] | null
): MergeableChat[] {
  const single = (list: MergeableChat[]) =>
    list.map((c) => ({ ...c, _chatIds: [c.id] }))

  if (chats.length === 0) return []

  const phoneByLid = new Map<string, string>()
  for (const row of lidMap || []) {
    if (row?.lid_jid && row?.phone_jid) phoneByLid.set(row.lid_jid, row.phone_jid)
  }
  if (phoneByLid.size === 0) return single(chats)

  const byJid = new Map<string, MergeableChat>()
  for (const chat of chats) {
    if (!chat.is_group) byJid.set(chat.remote_jid, chat)
  }

  const consumed = new Set<string>()
  const merged: MergeableChat[] = []

  for (const chat of chats) {
    if (chat.is_group || !isLid(chat)) continue

    const phoneJid = phoneByLid.get(chat.remote_jid)
    if (!phoneJid) continue

    const phoneChat = byJid.get(phoneJid)
    if (!phoneChat || consumed.has(phoneChat.id) || consumed.has(chat.id)) continue

    consumed.add(chat.id)
    consumed.add(phoneChat.id)

    const lidIsNewer =
      timeOf(chat.last_message_at) > timeOf(phoneChat.last_message_at)

    // La fila del número manda para identificar al contacto; del lado @lid se
    // toma lo que falte y lo que sea más reciente.
    merged.push({
      ...phoneChat,
      last_message_at: lidIsNewer
        ? chat.last_message_at ?? phoneChat.last_message_at
        : phoneChat.last_message_at ?? chat.last_message_at,
      last_message_preview: lidIsNewer
        ? chat.last_message_preview ?? phoneChat.last_message_preview
        : phoneChat.last_message_preview ?? chat.last_message_preview,
      unread_count: (chat.unread_count || 0) + (phoneChat.unread_count || 0),
      contact_name: phoneChat.contact_name || chat.contact_name,
      push_name: phoneChat.push_name || chat.push_name,
      contact_phone:
        phoneChat.contact_phone || chat.contact_phone || jidToPhone(phoneJid),
      // Ambos ids: el hilo se arma leyendo los mensajes de las dos mitades.
      _chatIds: [chat.id, phoneChat.id],
    })
  }

  const rest = chats
    .filter((c) => !consumed.has(c.id))
    .map((c) => {
      // Un @lid sin su otra mitad en la página se muestra igual, pero con el
      // teléfono real en vez del LID crudo.
      const phoneJid = !c.is_group && isLid(c) ? phoneByLid.get(c.remote_jid) : undefined
      return {
        ...c,
        ...(phoneJid && !c.contact_phone
          ? { contact_phone: jidToPhone(phoneJid) }
          : {}),
        _chatIds: [c.id],
      }
    })

  const result = [...merged, ...rest]
  result.sort((a, b) => timeOf(b.last_message_at) - timeOf(a.last_message_at))
  return result
}
