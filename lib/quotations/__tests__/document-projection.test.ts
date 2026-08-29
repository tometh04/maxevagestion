import {
  hasReadyQuotationDocument,
  withQuotationDocumentProjection,
} from "@/lib/quotations/document-projection"

describe("quotation document projection", () => {
  it("projects NONE without changing the legacy quotation fields", () => {
    const quotation = {
      id: "quotation-1",
      status: "DRAFT",
      active_document_id: null,
      public_token: "public-token-1",
    }

    const projected = withQuotationDocumentProjection(quotation)

    expect(projected).toEqual({
      ...quotation,
      document: {
        status: "NONE",
        active_document_id: null,
      },
    })
    expect(projected).not.toBe(quotation)
    expect(quotation).not.toHaveProperty("document")
  })

  it("projects READY only from active_document_id", () => {
    const quotation = {
      id: "quotation-2",
      status: "DRAFT",
      active_document_id: "document-1",
      public_token: "public-token-2",
    }

    expect(withQuotationDocumentProjection(quotation)).toEqual({
      ...quotation,
      document: {
        status: "READY",
        active_document_id: "document-1",
      },
    })
  })

  it("detects READY from the additive projection or the legacy field", () => {
    expect(hasReadyQuotationDocument({ document: { status: "READY" } })).toBe(true)
    expect(hasReadyQuotationDocument({ active_document_id: "document-legacy" })).toBe(true)
    expect(hasReadyQuotationDocument({
      active_document_id: null,
      document: { status: "NONE" },
    })).toBe(false)
  })
})
