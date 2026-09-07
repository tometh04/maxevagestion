import { mergeConversationPairs, type MergeableChat } from "../merge-chats"

function chat(
  id: string,
  remote_jid: string,
  last_message_at: string,
  extra: Partial<MergeableChat> = {}
): MergeableChat {
  return { id, remote_jid, last_message_at, is_group: false, ...extra }
}

const LID = "237984540586190@lid"
const TEL = "5493417417442@s.whatsapp.net"
const GRUPO = "120363419126710739@g.us"

describe("mergeConversationPairs", () => {
  it("une la mitad @lid con la del número aunque esa no tenga mensajes", () => {
    // Caso real: los mensajes quedaron en la fila @lid y el preview en la fila
    // del número, que se veía en el listado con el hilo vacío.
    const chats = [
      chat("lid", LID, "2026-09-07T13:31:39Z"),
      chat("tel", TEL, "2026-09-07T13:31:00Z", { contact_phone: "5493417417442" }),
    ]
    const stats = [
      { chat_id: "lid", direction: "outbound" },
      { chat_id: "lid", direction: "outbound" },
    ]

    const result = mergeConversationPairs(chats, stats)

    expect(result).toHaveLength(1)
    expect(result[0]._chatIds.sort()).toEqual(["lid", "tel"])
    // Identidad desde la fila del número, que es la que tiene el teléfono.
    expect(result[0].contact_phone).toBe("5493417417442")
  })

  it("NUNCA aparea una conversación con un grupo", () => {
    // El bug original: el grupo era el candidato "solo entrantes" más cercano
    // en el tiempo, así que los mensajes privados terminaban dentro del grupo.
    const chats = [
      chat("lid", LID, "2026-09-07T13:31:39Z"),
      chat("grupo", GRUPO, "2026-09-07T13:35:40Z", { is_group: true, contact_name: "Vibook" }),
    ]
    const stats = [
      { chat_id: "lid", direction: "outbound" },
      { chat_id: "grupo", direction: "inbound" },
    ]

    const result = mergeConversationPairs(chats, stats)

    expect(result).toHaveLength(2)
    for (const c of result) expect(c._chatIds).toHaveLength(1)
  })

  it("no aparea dos chats con mensajes en la misma dirección", () => {
    // Ambas tienen inbound => son personas distintas, no una charla partida.
    const chats = [
      chat("lid", LID, "2026-09-07T13:31:39Z"),
      chat("tel", TEL, "2026-09-07T13:31:00Z"),
    ]
    const stats = [
      { chat_id: "lid", direction: "inbound" },
      { chat_id: "tel", direction: "inbound" },
    ]

    const result = mergeConversationPairs(chats, stats)

    expect(result).toHaveLength(2)
  })

  it("no aparea mitades separadas por más de 24 horas", () => {
    const chats = [
      chat("lid", LID, "2026-09-07T13:00:00Z"),
      chat("tel", TEL, "2026-09-05T13:00:00Z"),
    ]
    const stats = [{ chat_id: "lid", direction: "outbound" }]

    const result = mergeConversationPairs(chats, stats)

    expect(result).toHaveLength(2)
  })

  it("no aparea dos chats @lid entre sí", () => {
    const chats = [
      chat("lid1", "111@lid", "2026-09-07T13:31:00Z"),
      chat("lid2", "222@lid", "2026-09-07T13:31:30Z"),
    ]
    const stats = [
      { chat_id: "lid1", direction: "outbound" },
      { chat_id: "lid2", direction: "inbound" },
    ]

    const result = mergeConversationPairs(chats, stats)

    expect(result).toHaveLength(2)
  })

  it("elige la mitad más cercana en el tiempo cuando hay varias candidatas", () => {
    const chats = [
      chat("lid", LID, "2026-09-07T13:31:00Z"),
      chat("lejos", "5490000000001@s.whatsapp.net", "2026-09-07T05:00:00Z"),
      chat("cerca", TEL, "2026-09-07T13:30:00Z"),
    ]
    const stats = [{ chat_id: "lid", direction: "outbound" }]

    const result = mergeConversationPairs(chats, stats)

    const merged = result.find((c) => c._chatIds.length === 2)
    expect(merged?._chatIds.sort()).toEqual(["cerca", "lid"])
  })

  it("suma los no leídos y se queda con el preview más reciente", () => {
    const chats = [
      chat("lid", LID, "2026-09-07T13:31:39Z", {
        unread_count: 2,
        last_message_preview: "el más nuevo",
      }),
      chat("tel", TEL, "2026-09-07T13:00:00Z", {
        unread_count: 3,
        last_message_preview: "viejo",
      }),
    ]
    const stats = [{ chat_id: "lid", direction: "outbound" }]

    const [merged] = mergeConversationPairs(chats, stats)

    expect(merged.unread_count).toBe(5)
    expect(merged.last_message_preview).toBe("el más nuevo")
    expect(merged.last_message_at).toBe("2026-09-07T13:31:39Z")
  })

  it("sin mensajes en ningún chat, devuelve todo tal cual", () => {
    const chats = [chat("a", LID, "2026-09-07T13:00:00Z"), chat("b", TEL, "2026-09-07T13:00:00Z")]

    const result = mergeConversationPairs(chats, [])

    expect(result).toHaveLength(2)
    expect(result[0]._chatIds).toEqual(["a"])
  })

  it("ordena el resultado por último mensaje descendente", () => {
    const chats = [
      chat("viejo", "5490000000002@s.whatsapp.net", "2026-09-01T10:00:00Z"),
      chat("nuevo", "5490000000003@s.whatsapp.net", "2026-09-07T10:00:00Z"),
    ]
    const stats = [
      { chat_id: "viejo", direction: "inbound" },
      { chat_id: "nuevo", direction: "inbound" },
    ]

    const result = mergeConversationPairs(chats, stats)

    expect(result.map((c) => c.id)).toEqual(["nuevo", "viejo"])
  })
})
