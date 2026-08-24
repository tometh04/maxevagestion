import type { QuotationPricingMode } from "@/lib/quotations/presentation"

export const QUOTATION_DOCUMENT_SCHEMA_VERSION = 1 as const

export type QuotationDocumentItemType =
  | "FLIGHT"
  | "HOTEL"
  | "ACCOMMODATION"
  | "TRANSFER"
  | "ASSISTANCE"
  | "INSURANCE"
  | "EXCURSION"
  | "ACTIVITY"
  | "VISA"
  | "OTHER"

export interface QuotationDocumentFlightLeg {
  departureCode?: string
  departureCity?: string
  departureTime?: string
  arrivalCode?: string
  arrivalCity?: string
  arrivalTime?: string
  duration?: string
  type?: string
  baggage?: string
  layovers: Array<{
    city?: string
    code?: string
    waitingTime?: string
  }>
}

export interface QuotationDocumentItem {
  id?: string
  type: QuotationDocumentItemType
  description: string
  provider?: string
  quantity: number
  pricePerUnit?: number
  notes?: string
  flight?: {
    airline?: string
    route?: string
    cabin?: string
    stops?: number
    departureDate?: string
    returnDate?: string
    screenshotUrl?: string
    legs: QuotationDocumentFlightLeg[]
  }
  hotel?: {
    name?: string
    stars?: number
    roomType?: string
    mealPlan?: string
    checkinDate?: string
    checkoutDate?: string
    nights?: number
    address?: string
    photoUrl?: string
    rooms?: number
    destination?: string
  }
  transfer?: {
    description?: string
  }
}

export interface QuotationDocumentOption {
  id: string
  number: number
  title: string
  totalAmount: number
  selected: boolean
  items: QuotationDocumentItem[]
}

export interface QuotationDocumentDataV1 {
  schemaVersion: typeof QUOTATION_DOCUMENT_SCHEMA_VERSION
  identity: {
    quotationId: string
    quotationNumber: string
    title: string
    createdAt: string
    validUntil: string
    status: string
  }
  agency: {
    id: string
    name: string
    logoUrl?: string
    phone?: string
    email?: string
    website?: string
    instagram?: string
    address?: string
    legalName?: string
    taxId?: string
    travelLicense?: string
  }
  customer: {
    displayName: string
    email?: string
    phone?: string
  }
  advisor: {
    displayName: string
    email?: string
    phone?: string
  }
  trip: {
    destination: string
    origin?: string
    region?: string
    departureDate: string
    returnDate?: string
    adults: number
    children: number
    infants: number
  }
  options: QuotationDocumentOption[]
  narrative: {
    overview?: string
    publicNotes?: string
    inclusions: string[]
    exclusions: string[]
    itinerary: Array<{
      day: number
      date?: string
      title: string
      description: string
    }>
    recommendations: string[]
    restrictions: string[]
  }
  commercial: {
    currency: string
    pricingMode: QuotationPricingMode
    insuranceAmount: number
    transferAmount: number
    depositAmount?: number
    balanceDueDate?: string
    paymentMethods: string[]
    paymentSchedule: Array<{
      label: string
      amount?: number
      dueDate?: string
      notes?: string
    }>
    terms: string[]
  }
}

export const QUOTATION_BLOCK_KINDS = [
  "hero",
  "trip-summary",
  "flight-options",
  "hotel-options",
  "services-included",
  "pricing",
  "itinerary",
  "recommendations",
  "restrictions",
  "legal-terms",
  "payment-schedule",
  "advisor-signature",
] as const

export type QuotationBlockKind = (typeof QUOTATION_BLOCK_KINDS)[number]

export interface QuotationModelManifestV1 {
  schemaVersion: typeof QUOTATION_DOCUMENT_SCHEMA_VERSION
  documentKind: "quotation"
  layoutKey: string
  layoutVersion: number
  locale: "es-AR"
  theme: {
    primaryColor: string
    secondaryColor: string
    accentColor: string
    paperColor: string
    textColor: string
    fontFamily: "OPEN_SANS" | "INTER" | "SYSTEM"
  }
  assets: {
    backgroundPath?: string
    logoPath?: string
  }
  branding: {
    displayName?: string
    phone?: string
    email?: string
    website?: string
    instagram?: string
    address?: string
    legalName?: string
    taxId?: string
    travelLicense?: string
  }
  copy: {
    documentTitle: string
    availabilityNote: string
    priceDisclaimer?: string
  }
  blocks: Array<{
    kind: QuotationBlockKind
    visible: boolean
    emptyPolicy: "hide" | "placeholder" | "reject"
    pageBreakBefore?: boolean
  }>
}

export interface QuotationLayoutCatalogEntry {
  key: string
  version: number
  name: string
  description: string
  supports: readonly QuotationBlockKind[]
}

export interface QuotationLayoutRenderer {
  readonly catalog: QuotationLayoutCatalogEntry
  render(input: {
    model: QuotationDocumentDataV1
    manifest: QuotationModelManifestV1
  }): string
}

export interface RenderQuotationDocumentInput {
  model: QuotationDocumentDataV1
  manifest?: QuotationModelManifestV1 | unknown
}

export interface RenderedQuotationDocument {
  html: string
  filename: string
  layoutKey: string
  layoutVersion: number
  pageCount: number
  model: QuotationDocumentDataV1
  manifest: QuotationModelManifestV1
}
