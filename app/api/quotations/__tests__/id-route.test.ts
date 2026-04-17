/**
 * @jest-environment node
 *
 * Este test importa API route handlers de Next.js que usan Request/Response
 * de fetch y ReadableStream (WHATWG Streams API). jsdom no provee
 * ReadableStream, por eso forzamos el ambiente `node` (que sí lo tiene en
 * Node 18+).
 */
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"

jest.mock("@/lib/auth", () => ({
  getCurrentUser: jest.fn(),
}))

jest.mock("@/lib/supabase/server", () => ({
  createServerClient: jest.fn(),
}))

describe("PATCH /api/quotations/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("rejects updates when the provided lead_id does not match the quotation", async () => {
    const { TextDecoder, TextEncoder } = require("util")
    global.TextDecoder = TextDecoder
    global.TextEncoder = TextEncoder

    const { Request, Response, Headers } = require("undici")
    global.Request = Request
    global.Response = Response
    global.Headers = Headers

    const { PATCH } = require("../[id]/route")
    const updateMock = jest.fn()
    const fromMock = jest.fn().mockImplementation(() => ({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: {
              id: "quote-1",
              lead_id: "lead-agustina",
              seller_id: "seller-1",
              quotation_number: "COT-2026-0001",
              status: "DRAFT",
            },
          }),
        }),
      }),
      update: updateMock,
    }))

    ;(getCurrentUser as jest.Mock).mockResolvedValue({
      user: { id: "seller-1", role: "SELLER" },
    })
    ;(createServerClient as jest.Mock).mockResolvedValue({
      from: fromMock,
    })

    const response = await PATCH(
      new Request("http://localhost/api/quotations/quote-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: "lead-sofia" }),
      }),
      { params: Promise.resolve({ id: "quote-1" }) }
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: "La cotización no pertenece al lead indicado",
    })
    expect(updateMock).not.toHaveBeenCalled()
  })
})
