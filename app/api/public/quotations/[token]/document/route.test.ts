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
jest.mock("@/lib/supabase/server", () => ({ createAdminClient: jest.fn(() => ({})) }))
jest.mock("@/lib/quotation-documents/server", () => ({
  QuotationDocumentServerError: class QuotationDocumentServerError extends Error {
    code = "NOT_FOUND"
  },
  renderQuotationDocumentForPublic: jest.fn(),
}))
jest.mock("@/lib/quotation-documents/presentation", () => ({
  quotationDocumentToPresentation: jest.fn(() => ({
    quotation_number: "COT-1",
    status: "SENT",
    options: [],
  })),
}))

import { renderQuotationDocumentForPublic } from "@/lib/quotation-documents/server"
import { GET } from "./route"

describe("GET /api/public/quotations/[token]/document", () => {
  it("expone sólo la proyección pública y nunca el modelo con PII", async () => {
    ;(renderQuotationDocumentForPublic as jest.Mock).mockResolvedValue({
      html: "<html>snapshot</html>",
      filename: "cotizacion.pdf",
      pageCount: 1,
      layoutKey: "editorial",
      layoutVersion: 1,
      revisionId: "revision-1",
      issuedDocumentId: "document-1",
      contentHash: "a".repeat(64),
      quotationStatus: "SENT",
      model: {
        customer: { email: "cliente@example.com", phone: "+5491111111111" },
        advisor: { email: "asesor@example.com", phone: "+5491122222222" },
        agency: { name: "Agencia", logoUrl: null },
      },
      manifest: {
        assets: { logoPath: null },
        theme: { primaryColor: "#123456" },
        branding: {},
      },
    })

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ token: "secret-token" }),
    })
    const payload = await response.json()
    const serialized = JSON.stringify(payload)

    expect(response.status).toBe(200)
    expect(payload.document.presentation).toEqual(expect.objectContaining({
      quotation_number: "COT-1",
    }))
    expect(payload.document).not.toHaveProperty("model")
    expect(serialized).not.toContain("cliente@example.com")
    expect(serialized).not.toContain("asesor@example.com")
    expect(serialized).not.toContain("customer")
  })
})
