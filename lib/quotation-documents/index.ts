import { countRenderedPages } from "@/lib/quotation-documents/html"
import { createDefaultManifest } from "@/lib/quotation-documents/manifests"
import { parseQuotationModelManifest } from "@/lib/quotation-documents/schemas"
import { getQuotationLayout, getQuotationLayoutCatalog } from "@/lib/quotation-documents/layouts/registry"
import type {
  RenderedQuotationDocument,
  RenderQuotationDocumentInput,
} from "@/lib/quotation-documents/types"
import { cloneQuotationJson } from "@/lib/quotation-documents/clone"
import type { QuotationBlockKind, QuotationDocumentDataV1 } from "@/lib/quotation-documents/types"

export { buildQuotationDocumentData } from "@/lib/quotation-documents/model"
export { KYO_FULL_ITINERARY_FIXTURE } from "@/lib/quotation-documents/fixtures"
export { EDITORIAL_GENERIC_MANIFEST, KYO_2026_MANIFEST, VIBOOK_STANDARD_MANIFEST, createDefaultManifest } from "@/lib/quotation-documents/manifests"
export {
  quotationDocumentToPresentation,
  withSelectedQuotationOption,
} from "@/lib/quotation-documents/presentation"
export { getQuotationLayoutCatalog } from "@/lib/quotation-documents/layouts/registry"
export {
  parseQuotationModelManifest,
  parseQuotationPresentationContent,
  quotationModelManifestSchema,
  quotationPresentationContentSchema,
} from "@/lib/quotation-documents/schemas"
export type * from "@/lib/quotation-documents/types"
export { cloneQuotationJson } from "@/lib/quotation-documents/clone"

function safeFilenamePart(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
  return normalized || "presupuesto"
}

function blockHasData(model: QuotationDocumentDataV1, kind: QuotationBlockKind): boolean {
  const items = model.options.flatMap(option => option.items)
  switch (kind) {
    case "hero": return Boolean(model.identity.title)
    case "trip-summary": return Boolean(model.trip.destination && model.trip.departureDate)
    case "flight-options": return items.some(item => item.type === "FLIGHT")
    case "hotel-options": return items.some(item => item.type === "HOTEL" || item.type === "ACCOMMODATION")
    case "services-included": return model.narrative.inclusions.length > 0 || items.some(item => !["FLIGHT", "HOTEL", "ACCOMMODATION"].includes(item.type))
    case "pricing": return model.options.some(option => option.totalAmount > 0)
    case "itinerary": return model.narrative.itinerary.length > 0
    case "recommendations": return model.narrative.recommendations.length > 0
    case "restrictions": return model.narrative.restrictions.length > 0
    case "legal-terms": return model.commercial.terms.length > 0
    case "payment-schedule": return model.commercial.paymentSchedule.length > 0
      || model.commercial.paymentMethods.length > 0
      || model.commercial.depositAmount != null
      || Boolean(model.commercial.balanceDueDate)
    case "advisor-signature": return Boolean(model.advisor.displayName)
  }
}

export function renderQuotationDocument(
  input: RenderQuotationDocumentInput
): RenderedQuotationDocument {
  const manifest = input.manifest
    ? parseQuotationModelManifest(input.manifest)
    : createDefaultManifest("vibook-standard-v1")
  const layout = getQuotationLayout(manifest.layoutKey)

  if (manifest.layoutVersion !== layout.catalog.version) {
    throw new Error(
      `Versión de layout no soportada: ${manifest.layoutKey}@${manifest.layoutVersion}`
    )
  }

  const unsupportedBlock = manifest.blocks.find(block => (
    block.visible && !layout.catalog.supports.includes(block.kind)
  ))
  if (unsupportedBlock) {
    throw new Error(`El layout ${manifest.layoutKey} no soporta el bloque ${unsupportedBlock.kind}`)
  }

  const model = cloneQuotationJson(input.model)
  model.agency = {
    ...model.agency,
    name: manifest.branding.displayName || model.agency.name,
    logoUrl: manifest.assets.logoPath || model.agency.logoUrl,
    phone: manifest.branding.phone || model.agency.phone,
    email: manifest.branding.email || model.agency.email,
    website: manifest.branding.website || model.agency.website,
    instagram: manifest.branding.instagram || model.agency.instagram,
    address: manifest.branding.address || model.agency.address,
    legalName: manifest.branding.legalName || model.agency.legalName,
    taxId: manifest.branding.taxId || model.agency.taxId,
    travelLicense: manifest.branding.travelLicense || model.agency.travelLicense,
  }

  const missingRequiredBlock = manifest.blocks.find(block => (
    block.visible && block.emptyPolicy === "reject" && !blockHasData(model, block.kind)
  ))
  if (missingRequiredBlock) {
    throw new Error(`El bloque requerido ${missingRequiredBlock.kind} no tiene datos`)
  }

  const html = layout.render({ model, manifest })
  const pageCount = countRenderedPages(html)
  if (pageCount === 0) {
    throw new Error("El layout no generó páginas")
  }

  return {
    html,
    filename: `cotizacion-${safeFilenamePart(input.model.identity.quotationNumber)}.pdf`,
    layoutKey: manifest.layoutKey,
    layoutVersion: manifest.layoutVersion,
    pageCount,
    model,
    manifest,
  }
}
