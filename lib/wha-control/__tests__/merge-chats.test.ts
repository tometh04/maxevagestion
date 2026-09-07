import { mergeConversationPairs, type MergeableChat } from "../merge-chats"

function chat(
  id: string,
  remote_jid: string,
  last_message_at: string,
  extra: Partial<MergeableChat> = {}
): MergeableChat {
  return { id, remote_jid, last_message_at, is_group: false, ...extra }
}

// Pares reales tomados de producción.
const LID_GERA = "237984540586190@lid"
const TEL_GERA = "5493417417442@s.whatsapp.net"
const LID_LAUTI = "186092544380974@lid"
const TEL_LAUTI = "5493413153222@s.whatsapp.net"
const GRUPO = "120363419126710739@g.us"

const MAPA = [
  { lid_jid: LID_GERA, phone_jid: TEL_GERA },
  { lid_jid: LID_LAUTI, phone_jid: TEL_LAUTI },
]

describe("mergeConversationPairs", () => {
  it("une las dos mitades usando el mapeo real", () => {
    const chats = [
      chat("lid", LID_GERA, "2026-09-07T13:31:39Z"),
      chat("tel", TEL_GERA, "2026-09-07T13:31:00Z"),
    ]

    const result = mergeConversationPairs(chats, MAPA)

    expect(result).toHaveLength(1)
    expect(result[0]._chatIds.sort()).toEqual(["lid", "tel"])
    expect(result[0].contact_phone).toBe("5493417417442")
  })

  it("no mezcla dos conversaciones distintas aunque sean simultáneas", () => {
    // El bug que se arregla: por cercanía de tiempo, los salientes a gera
    // aparecían dentro del chat de Lauti.
    const chats = [
      chat("lid_gera", LID_GERA, "2026-09-07T13:31:39Z"),
      chat("tel_lauti", TEL_LAUTI, "2026-09-07T13:31:40Z"),
    ]

    const result = mergeConversationPairs(chats, MAPA)

    expect(result).toHaveLength(2)
    for (const c of result) expect(c._chatIds).toHaveLength(1)
  })

  it("cada mitad va con la suya cuando están las dos parejas juntas", () => {
    const chats = [
      chat("lid_gera", LID_GERA, "2026-09-07T13:31:39Z"),
      chat("tel_gera", TEL_GERA, "2026-09-07T13:31:00Z"),
      chat("lid_lauti", LID_LAUTI, "2026-09-07T13:49:24Z"),
      chat("tel_lauti", TEL_LAUTI, "2026-09-07T13:49:00Z"),
    ]

    const result = mergeConversationPairs(chats, MAPA)

    expect(result).toHaveLength(2)
    const porTelefono = Object.fromEntries(
      result.map((c) => [c.contact_phone, c._chatIds.sort()])
    )
    expect(porTelefono["5493417417442"]).toEqual(["lid_gera", "tel_gera"])
    expect(porTelefono["5493413153222"]).toEqual(["lid_lauti", "tel_lauti"])
  })

  it("nunca toca un grupo", () => {
    const chats = [
      chat("lid", LID_GERA, "2026-09-07T13:31:39Z"),
      chat("grupo", GRUPO, "2026-09-07T13:35:40Z", { is_group: true, contact_name: "Vibook" }),
    ]

    const result = mergeConversationPairs(chats, MAPA)

    expect(result).toHaveLength(2)
    const grupo = result.find((c) => c.id === "grupo")
    expect(grupo?._chatIds).toEqual(["grupo"])
  })

  it("un @lid sin su otra mitad en la página queda solo, pero muestra el teléfono", () => {
    const chats = [chat("lid", LID_GERA, "2026-09-07T13:31:39Z")]

    const result = mergeConversationPairs(chats, MAPA)

    expect(result).toHaveLength(1)
    expect(result[0]._chatIds).toEqual(["lid"])
    expect(result[0].contact_phone).toBe("5493417417442")
  })

  it("un @lid sin mapeo se deja intacto", () => {
    const chats = [chat("lid", "999999@lid", "2026-09-07T13:31:39Z")]

    const result = mergeConversationPairs(chats, MAPA)

    expect(result).toHaveLength(1)
    expect(result[0].contact_phone).toBeUndefined()
  })

  it("suma los no leídos y se queda con el preview más reciente", () => {
    const chats = [
      chat("lid", LID_GERA, "2026-09-07T13:31:39Z", {
        unread_count: 2,
        last_message_preview: "el más nuevo",
      }),
      chat("tel", TEL_GERA, "2026-09-07T13:00:00Z", {
        unread_count: 3,
        last_message_preview: "viejo",
      }),
    ]

    const [merged] = mergeConversationPairs(chats, MAPA)

    expect(merged.unread_count).toBe(5)
    expect(merged.last_message_preview).toBe("el más nuevo")
    expect(merged.last_message_at).toBe("2026-09-07T13:31:39Z")
  })

  it("sin mapeos devuelve todo tal cual", () => {
    const chats = [
      chat("a", LID_GERA, "2026-09-07T13:00:00Z"),
      chat("b", TEL_GERA, "2026-09-07T13:00:00Z"),
    ]

    const result = mergeConversationPairs(chats, [])

    expect(result).toHaveLength(2)
    expect(result[0]._chatIds).toEqual(["a"])
  })

  it("ordena por último mensaje descendente", () => {
    const chats = [
      chat("viejo", "5490000000002@s.whatsapp.net", "2026-09-01T10:00:00Z"),
      chat("nuevo", "5490000000003@s.whatsapp.net", "2026-09-07T10:00:00Z"),
    ]

    const result = mergeConversationPairs(chats, MAPA)

    expect(result.map((c) => c.id)).toEqual(["nuevo", "viejo"])
  })
})
