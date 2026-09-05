/**
 * @jest-environment node
 *
 * Este test importa API route handlers de Next.js que usan Request/Response
 * de fetch y ReadableStream (WHATWG Streams API). jsdom no provee
 * ReadableStream, por eso forzamos el ambiente `node` (que sí lo tiene en
 * Node 18+).
 */
import { getCurrentUser } from "@/lib/auth"
import { createAdminClient, createServerClient } from "@/lib/supabase/server"
jest.mock("@/lib/auth", () => ({
  getCurrentUser: jest.fn(),
}))

jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: jest.fn(),
  createServerClient: jest.fn(),
}))

jest.mock("@/lib/permissions-api", () => ({
  getUserAgencyIds: jest.fn().mockResolvedValue(["agency-1"]),
  canPerformAction: jest.fn().mockReturnValue(true),
  isOwnDataOnlyResolved: jest.fn().mockReturnValue(false),
}))

jest.mock("@/lib/permissions-agency", () => ({
  resolveUserPermissions: jest.fn().mockResolvedValue({}),
}))

jest.mock("@/lib/audit", () => ({
  getClientIP: jest.fn().mockReturnValue(null),
  logAudit: jest.fn(),
}))

describe("DELETE /api/quotations/[id]", () => {
  it.each([
    { error: null, status: 200, body: { success: true } },
    { error: { code: "23503", message: "quotation parent not found" }, status: 409,
      body: { error: "La cotización tiene registros relacionados que impiden eliminarla. Contactá a soporte." } },
    { error: { code: "XX000", message: "private database diagnostic" }, status: 500,
      body: { error: "No se pudo eliminar la cotización. Intentá nuevamente." } },
  ])("handles draft deletion without inventing an issued document: $status", async ({ error, status, body }) => {
    const { TextDecoder, TextEncoder } = require("util")
    global.TextDecoder = TextDecoder
    global.TextEncoder = TextEncoder
    const { Request, Response, Headers } = require("undici")
    Object.assign(global, { Request, Response, Headers })
    const { DELETE } = require("../[id]/route")
    const quote: any = {
      select: jest.fn(() => quote), eq: jest.fn(() => quote), in: jest.fn(() => quote),
      delete: jest.fn(() => quote),
      maybeSingle: jest.fn()
        .mockResolvedValueOnce({ data: { id: "quote-1", status: "DRAFT", agency_id: "agency-1" }, error: null })
        .mockResolvedValueOnce({ data: error ? null : { id: "quote-1" }, error }),
    }
    const issued: any = {
      select: jest.fn(() => issued), eq: jest.fn(() => issued), limit: jest.fn(() => issued),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    }
    ;(getCurrentUser as jest.Mock).mockResolvedValue({ user: {
      id: "seller-1", email: "seller@example.com", role: "SELLER", roles: ["SELLER"], org_id: "org-1",
    } })
    ;(createServerClient as jest.Mock).mockResolvedValue({ from: jest.fn(() => quote) })
    ;(createAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => table === "quotations" ? quote : issued),
    })
    const response = await DELETE(new Request("http://localhost/api/quotations/quote-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "quote-1" }) })
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual(body)
    expect(quote.eq).toHaveBeenCalledWith("org_id", "org-1")
    expect(quote.eq).toHaveBeenCalledWith("agency_id", "agency-1")
    expect(quote.eq).toHaveBeenCalledWith("status", "DRAFT")
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("returns 409 instead of deleting a draft that already has an issued document", async () => {
    const { TextDecoder, TextEncoder } = require("util")
    global.TextDecoder = TextDecoder
    global.TextEncoder = TextEncoder

    const { Request, Response, Headers } = require("undici")
    global.Request = Request
    global.Response = Response
    global.Headers = Headers

    const { DELETE } = require("../[id]/route")
    const deleteMock = jest.fn()
    const quotationQuery: any = {
      select: jest.fn(() => quotationQuery),
      eq: jest.fn(() => quotationQuery),
      in: jest.fn(() => quotationQuery),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: "quote-1",
          org_id: "org-1",
          agency_id: "agency-1",
          seller_id: "seller-1",
          status: "DRAFT",
        },
        error: null,
      }),
      delete: deleteMock,
    }
    const issuedQuery: any = {
      select: jest.fn(() => issuedQuery),
      eq: jest.fn(() => issuedQuery),
      limit: jest.fn(() => issuedQuery),
      maybeSingle: jest.fn().mockResolvedValue({ data: { id: "document-1" }, error: null }),
    }

    ;(getCurrentUser as jest.Mock).mockResolvedValue({
      user: {
        id: "seller-1",
        email: "seller@example.com",
        role: "SELLER",
        roles: ["SELLER"],
        org_id: "org-1",
      },
    })
    ;(createServerClient as jest.Mock).mockResolvedValue({
      from: jest.fn().mockReturnValue(quotationQuery),
    })
    ;(createAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => table === "quotations" ? quotationQuery : issuedQuery),
    })

    const response = await DELETE(
      new Request("http://localhost/api/quotations/quote-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "quote-1" }) }
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: "La cotización ya tiene un documento emitido y debe conservarse como historial",
    })
    expect(deleteMock).not.toHaveBeenCalled()
  })
})
