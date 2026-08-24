/** @jest-environment node */

jest.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      status: init?.status ?? 200,
      headers: init?.headers,
      json: async () => data,
    }),
  },
}))

jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: jest.fn(),
}))

jest.mock("@/lib/quotation-documents/server", () => ({
  QuotationDocumentServerError: class QuotationDocumentServerError extends Error {},
  renderQuotationDocumentForPublic: jest.fn(),
}))

import { createAdminClient } from "@/lib/supabase/server"
import { POST } from "../route"

const TOKEN = "public-token"
const OPTION_ID = "11111111-1111-4111-8111-111111111111"
const DOCUMENT_ID = "22222222-2222-4222-8222-222222222222"
const CONTENT_HASH = "a".repeat(64)

function request(body: unknown) {
  return { json: async () => body } as Request
}

function adminWith(result: unknown, rpcError: unknown = null) {
  const alertInsert = jest.fn().mockResolvedValue({ error: null })
  const admin = {
    rpc: jest.fn().mockResolvedValue({ data: result, error: rpcError }),
    from: jest.fn().mockReturnValue({ insert: alertInsert }),
  }
  ;(createAdminClient as jest.Mock).mockReturnValue(admin)
  return { admin, alertInsert }
}

describe("public quotation acceptance", () => {
  beforeEach(() => jest.clearAllMocks())

  it("requires the exact issued snapshot identity", async () => {
    const response = await POST(request({ option_id: OPTION_ID }), {
      params: Promise.resolve({ token: TOKEN }),
    })
    expect(response.status).toBe(400)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it("returns a conflict when the active document changed", async () => {
    const { admin } = adminWith({ accepted: false, code: "DOCUMENT_CHANGED" })
    const response = await POST(request({
      option_id: OPTION_ID,
      issued_document_id: DOCUMENT_ID,
      content_hash: CONTENT_HASH,
    }), { params: Promise.resolve({ token: TOKEN }) })

    expect(response.status).toBe(409)
    expect(admin.rpc).toHaveBeenCalledWith("accept_issued_quotation_option", {
      p_public_token: TOKEN,
      p_document_id: DOCUMENT_ID,
      p_content_hash: CONTENT_HASH,
      p_option_id: OPTION_ID,
    })
  })

  it("reports success only after the RPC accepts and then emits a scoped alert", async () => {
    const { alertInsert } = adminWith({
      accepted: true,
      seller_id: "seller-1",
      org_id: "org-1",
      quotation_number: "COT-2026-1",
      destination: "Uyuni",
    })
    const response = await POST(request({
      option_id: OPTION_ID,
      issued_document_id: DOCUMENT_ID,
      content_hash: CONTENT_HASH,
    }), { params: Promise.resolve({ token: TOKEN }) })

    expect(response.status).toBe(200)
    expect(alertInsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "seller-1",
      org_id: "org-1",
      type: "QUOTATION_ACCEPTED",
    }))
  })
})
