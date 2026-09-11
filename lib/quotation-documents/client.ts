"use client"

import { downloadPdfFromHtml } from "@/lib/pdf/quote-pdf-designs"
import { requestQuotationJson } from "./request-client"
import type { QuotationDocumentDataV1 } from "@/lib/quotation-documents/types"
import type { QuotationPresentationData } from "@/lib/quotations/presentation"

export interface QuotationDocumentPayload {
  html: string
  filename: string
  pageCount: number
  layoutKey: string
  layoutVersion: number
  revisionId: string | null
  issuedDocumentId: string | null
  contentHash: string
  quotationStatus: string
  quotationUpdatedAt?: string
  acceptanceEnabled?: boolean
  omittedRemoteAssetCount?: number
  model?: QuotationDocumentDataV1
  presentation?: QuotationPresentationData
  branding?: {
    brand_logo?: string
    brand_color?: string
    company_name?: string
    company_address?: string
    company_phone?: string
    company_email?: string
    company_website?: string
    company_instagram?: string
    company_legajo?: string
    company_tax_id?: string
  }
}

export class QuotationDocumentClientError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message)
    this.name = "QuotationDocumentClientError"
  }
}

export class QuotationDocumentDownloadError extends Error {
  constructor(
    message: string,
    public readonly document: QuotationDocumentPayload,
    public readonly causeValue?: unknown
  ) {
    super(message)
    this.name = "QuotationDocumentDownloadError"
  }
}

function readDocumentResponse(response: Response, json: {
  document?: QuotationDocumentPayload; error?: string; code?: string
}): QuotationDocumentPayload {
  if (!response.ok || !json?.document?.html) {
    throw new QuotationDocumentClientError(
      json?.error || "No se pudo generar el documento de la cotización",
      typeof json?.code === "string" ? json.code : undefined
    )
  }
  return json.document as QuotationDocumentPayload
}

async function withCommittedQuotationMetadata(
  quotationId: string,
  document: QuotationDocumentPayload
): Promise<QuotationDocumentPayload> {
  if (!document.issuedDocumentId || document.quotationUpdatedAt) return document
  try {
    const { response: quotationResponse, json: quotationJson } = await requestQuotationJson(`/api/quotations/${quotationId}`, { cache: "no-store" })
    const quotation = quotationJson?.data
    if (
      quotationResponse.ok
      && quotation?.active_document_id === document.issuedDocumentId
      && typeof quotation?.updated_at === "string"
      && quotation.updated_at
    ) {
      return {
        ...document,
        quotationStatus: typeof quotation.status === "string"
          ? quotation.status
          : document.quotationStatus,
        quotationUpdatedAt: quotation.updated_at,
      }
    }
  } catch {
    // La emisión ya terminó. Un refresh auxiliar no debe convertirla en fallo.
  }
  return document
}

export async function fetchQuotationDocumentForUser(
  quotationId: string,
  options: {
    issue?: boolean
    useCurrentTemplate?: boolean
    markSent?: boolean
    expectedUpdatedAt?: string
  } = {}
): Promise<QuotationDocumentPayload> {
  const issue = options.issue !== false
  let expectedUpdatedAt = options.expectedUpdatedAt
  if (issue && !expectedUpdatedAt) {
    const { response: quotationResponse, json: quotationJson } = await requestQuotationJson(`/api/quotations/${quotationId}`, { cache: "no-store" })
    expectedUpdatedAt = quotationJson?.data?.updated_at
    if (!quotationResponse.ok || typeof expectedUpdatedAt !== "string" || !expectedUpdatedAt) {
      throw new Error(quotationJson?.error || "No se pudo leer la versión actual de la cotización")
    }
  }
  const { response, json } = await requestQuotationJson(`/api/quotations/${quotationId}/document`, {
    method: issue ? "POST" : "GET",
    headers: issue ? { "Content-Type": "application/json" } : undefined,
    body: issue
      ? JSON.stringify({
          expected_updated_at: expectedUpdatedAt,
          use_current_template: options.useCurrentTemplate === true,
          mark_sent: options.markSent === true,
        })
      : undefined,
    cache: "no-store",
  })
  const document = readDocumentResponse(response, json)
  if (!issue || !document.issuedDocumentId) return document
  return withCommittedQuotationMetadata(quotationId, document)
}

export async function fetchQuotationDocumentForPublic(
  token: string
): Promise<QuotationDocumentPayload> {
  const { response, json } = await requestQuotationJson(`/api/public/quotations/${encodeURIComponent(token)}/document`, {
    cache: "no-store",
  })
  return readDocumentResponse(response, json)
}

export async function downloadQuotationDocumentHtml(
  document: Pick<QuotationDocumentPayload, "html" | "filename">
): Promise<void> {
  await downloadPdfFromHtml(document.html, document.filename)
}

export async function downloadQuotationDocumentById(
  quotationId: string,
  expectedUpdatedAt?: string
): Promise<QuotationDocumentPayload> {
  const document = await fetchQuotationDocumentForUser(quotationId, {
    issue: true,
    expectedUpdatedAt,
  })
  try {
    await downloadQuotationDocumentHtml(document)
  } catch (error) {
    const committedDocument = await withCommittedQuotationMetadata(quotationId, document)
    throw new QuotationDocumentDownloadError(
      error instanceof Error ? error.message : "No se pudo descargar el documento emitido",
      committedDocument,
      error
    )
  }
  return document
}
