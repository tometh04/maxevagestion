import { downloadPdfFromHtml } from "@/lib/pdf/quote-pdf-designs"
import {
  QuotationDocumentDownloadError,
  downloadQuotationDocumentById,
  fetchQuotationDocumentForUser,
  type QuotationDocumentPayload,
} from "@/lib/quotation-documents/client"

jest.mock("@/lib/pdf/quote-pdf-designs", () => ({
  downloadPdfFromHtml: jest.fn(),
}))

const QUOTATION_ID = "11111111-1111-4111-8111-111111111111"
const ISSUED_DOCUMENT_ID = "22222222-2222-4222-8222-222222222222"
const OTHER_DOCUMENT_ID = "33333333-3333-4333-8333-333333333333"
const ISSUED_AT = "2026-08-29T12:01:00.000Z"

function issuedDocument(): QuotationDocumentPayload {
  return {
    html: "<html><body>Cotización</body></html>",
    filename: "cotizacion.pdf",
    pageCount: 1,
    layoutKey: "default",
    layoutVersion: 1,
    revisionId: null,
    issuedDocumentId: ISSUED_DOCUMENT_ID,
    contentHash: "issued-document-hash",
    quotationStatus: "DRAFT",
  }
}

function documentResponse(document = issuedDocument()) {
  return {
    ok: true,
    json: async () => ({ document }),
  } as Response
}

function quotationResponse(activeDocumentId: string) {
  return {
    ok: true,
    json: async () => ({
      data: {
        id: QUOTATION_ID,
        active_document_id: activeDocumentId,
        updated_at: ISSUED_AT,
        status: "SENT",
      },
    }),
  } as Response
}

describe("quotation document client", () => {
  const mockedDownloadPdfFromHtml = jest.mocked(downloadPdfFromHtml)

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("returns the committed quotation version and status for the issued active document", async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(documentResponse())
      .mockResolvedValueOnce(quotationResponse(ISSUED_DOCUMENT_ID)) as unknown as typeof fetch

    const document = await fetchQuotationDocumentForUser(QUOTATION_ID, {
      issue: true,
      expectedUpdatedAt: "2026-08-29T12:00:00.000Z",
      markSent: true,
    })

    expect(document).toMatchObject({
      issuedDocumentId: ISSUED_DOCUMENT_ID,
      quotationStatus: "SENT",
      quotationUpdatedAt: ISSUED_AT,
    })
  })

  it("uses committed metadata returned by issuance without an auxiliary request", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(documentResponse({
      ...issuedDocument(),
      quotationStatus: "SENT",
      quotationUpdatedAt: ISSUED_AT,
    })) as unknown as typeof fetch

    const document = await fetchQuotationDocumentForUser(QUOTATION_ID, {
      issue: true,
      expectedUpdatedAt: "2026-08-29T12:00:00.000Z",
      markSent: true,
    })

    expect(document.quotationUpdatedAt).toBe(ISSUED_AT)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it("does not adopt quotation metadata when another document is active", async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(documentResponse())
      .mockResolvedValueOnce(quotationResponse(OTHER_DOCUMENT_ID)) as unknown as typeof fetch

    const document = await fetchQuotationDocumentForUser(QUOTATION_ID, {
      issue: true,
      expectedUpdatedAt: "2026-08-29T12:00:00.000Z",
      markSent: true,
    })

    expect(document.quotationStatus).toBe("DRAFT")
    expect(document.quotationUpdatedAt).toBeUndefined()
  })

  it("preserves the committed document when the local PDF download fails", async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(documentResponse())
      .mockResolvedValueOnce(quotationResponse(ISSUED_DOCUMENT_ID)) as unknown as typeof fetch
    mockedDownloadPdfFromHtml.mockRejectedValueOnce(new Error("descarga local fallida"))

    const error = await downloadQuotationDocumentById(
      QUOTATION_ID,
      "2026-08-29T12:00:00.000Z"
    ).then(() => null, reason => reason)

    expect(error).toBeInstanceOf(QuotationDocumentDownloadError)
    expect(error).toMatchObject({
      message: "descarga local fallida",
      document: {
        issuedDocumentId: ISSUED_DOCUMENT_ID,
        quotationStatus: "SENT",
        quotationUpdatedAt: ISSUED_AT,
      },
    })
  })

  it("retries metadata recovery after a committed emission and local download failure", async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(documentResponse())
      .mockRejectedValueOnce(new Error("refresh transitorio"))
      .mockResolvedValueOnce(quotationResponse(ISSUED_DOCUMENT_ID)) as unknown as typeof fetch
    mockedDownloadPdfFromHtml.mockRejectedValueOnce(new Error("descarga local fallida"))

    const error = await downloadQuotationDocumentById(
      QUOTATION_ID,
      "2026-08-29T12:00:00.000Z"
    ).then(() => null, reason => reason)

    expect(error).toMatchObject({
      document: {
        issuedDocumentId: ISSUED_DOCUMENT_ID,
        quotationUpdatedAt: ISSUED_AT,
      },
    })
    expect(global.fetch).toHaveBeenCalledTimes(3)
  })
})
