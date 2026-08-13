/**
 * @jest-environment node
 *
 * WHA Control — responder mensajes.
 *
 * Lo que importa acá no es la UI sino el borde del servidor: que un chat de otro
 * tenant no se pueda usar para enviar (pre-validación por org), que sin texto
 * corte en 400, y que en el happy path se llame al connector con el remote_jid
 * y el texto correctos. Se mockean el guard, el admin client y el connector.
 */

import { POST } from "@/app/api/wha-control/chats/[chatId]/send/route"
import { whaControlAuthGuard } from "@/lib/wha-control/auth-guard"
import { createAdminClient } from "@/lib/supabase/server"
import { callConnector } from "@/lib/wha-control/connector-client"
import { NextResponse } from "next/server"

jest.mock("@/lib/wha-control/auth-guard", () => ({ whaControlAuthGuard: jest.fn() }))
jest.mock("@/lib/supabase/server", () => ({ createAdminClient: jest.fn() }))
jest.mock("@/lib/wha-control/connector-client", () => ({ callConnector: jest.fn() }))

const CHAT = {
  id: "chat-1",
  device_id: "dev-1",
  remote_jid: "5491122334455@s.whatsapp.net",
}

/** Mock del admin client: wa_chats.maybeSingle() devuelve `chat` (o null). */
function mockSupabase(chat: any) {
  const builder: any = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    maybeSingle: jest.fn(async () => ({ data: chat, error: null })),
  }
  ;(createAdminClient as jest.Mock).mockReturnValue({
    from: jest.fn(() => builder),
  })
}

function authorized(orgId = "org-1") {
  ;(whaControlAuthGuard as jest.Mock).mockResolvedValue({
    authorized: true,
    response: null,
    user: { id: "u1" },
    orgId,
  })
}

function req(body: any) {
  return { json: async () => body } as unknown as Request
}
const params = { params: Promise.resolve({ chatId: "chat-1" }) }

beforeEach(() => jest.clearAllMocks())

test("sin autorización devuelve el 403 del guard y no llama al connector", async () => {
  ;(whaControlAuthGuard as jest.Mock).mockResolvedValue({
    authorized: false,
    response: NextResponse.json({ error: "Unauthorized" }, { status: 403 }),
  })

  const res = await POST(req({ text: "hola" }), params)
  expect(res.status).toBe(403)
  expect(callConnector).not.toHaveBeenCalled()
})

test("texto vacío corta en 400 antes de tocar la base o el connector", async () => {
  authorized()
  mockSupabase(CHAT)

  const res = await POST(req({ text: "   " }), params)
  expect(res.status).toBe(400)
  expect(callConnector).not.toHaveBeenCalled()
})

test("chat de otro org (no matchea org_id) devuelve 404 y no envía", async () => {
  authorized("org-1")
  mockSupabase(null) // la pre-validación por org_id no encuentra el chat

  const res = await POST(req({ text: "hola" }), params)
  expect(res.status).toBe(404)
  expect(callConnector).not.toHaveBeenCalled()
})

test("happy path: llama al connector con remote_jid y texto, devuelve wa_message_id", async () => {
  authorized()
  mockSupabase(CHAT)
  ;(callConnector as jest.Mock).mockResolvedValue({
    ok: true,
    data: { wa_message_id: "WAMSG123" },
  })

  const res = await POST(req({ text: "hola mundo" }), params)
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ ok: true, wa_message_id: "WAMSG123" })
  expect(callConnector).toHaveBeenCalledWith(
    "/devices/dev-1/send",
    "POST",
    { to: CHAT.remote_jid, text: "hola mundo" },
    expect.any(Number)
  )
})

test("si el connector falla, devuelve 502", async () => {
  authorized()
  mockSupabase(CHAT)
  ;(callConnector as jest.Mock).mockResolvedValue({
    ok: false,
    data: null,
    error: "Device not running",
  })

  const res = await POST(req({ text: "hola" }), params)
  expect(res.status).toBe(502)
})
