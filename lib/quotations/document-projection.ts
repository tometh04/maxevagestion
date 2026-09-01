export type QuotationDocumentStatus = "NONE" | "READY"

export interface QuotationDocumentProjection {
  status: QuotationDocumentStatus
  active_document_id: string | null
}

export function hasReadyQuotationDocument(quotation: {
  active_document_id?: string | null
  document?: { status?: string | null } | null
}): boolean {
  return quotation.document?.status === "READY" || Boolean(quotation.active_document_id?.trim())
}

export function withQuotationDocumentProjection<
  T extends { active_document_id?: string | null },
>(quotation: T): T & { document: QuotationDocumentProjection } {
  const activeDocumentId = quotation.active_document_id?.trim() || null

  return {
    ...quotation,
    document: {
      status: activeDocumentId ? "READY" : "NONE",
      active_document_id: activeDocumentId,
    },
  }
}
