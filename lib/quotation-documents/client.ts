"use client"

import { downloadPdfFromHtml } from "@/lib/pdf/quote-pdf-designs"
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

async function readDocumentResponse(response: Response): Promise<QuotationDocumentPayload> {
  const json = await response.json().catch(() => ({}))
  if (!response.ok || !json?.document?.html) {
    throw new Error(json?.error || "No se pudo generar el documento de la cotización")
  }
  return json.document as QuotationDocumentPayload
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
    const quotationResponse = await fetch(`/api/quotations/${quotationId}`, { cache: "no-store" })
    const quotationJson = await quotationResponse.json().catch(() => ({}))
    expectedUpdatedAt = quotationJson?.data?.updated_at
    if (!quotationResponse.ok || typeof expectedUpdatedAt !== "string" || !expectedUpdatedAt) {
      throw new Error(quotationJson?.error || "No se pudo leer la versión actual de la cotización")
    }
  }
  const response = await fetch(`/api/quotations/${quotationId}/document`, {
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
  return readDocumentResponse(response)
}

export async function fetchQuotationDocumentForPublic(
  token: string
): Promise<QuotationDocumentPayload> {
  const response = await fetch(`/api/public/quotations/${encodeURIComponent(token)}/document`, {
    cache: "no-store",
  })
  return readDocumentResponse(response)
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
  await downloadQuotationDocumentHtml(document)
  return document
}
