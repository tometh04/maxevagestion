import {
  normalizeQuotationForPresentation,
  type QuotationFlightLeg,
  type QuotationPresentationItem,
} from "@/lib/quotations/presentation"
import { parseQuotationPresentationContent } from "@/lib/quotation-documents/schemas"
import {
  QUOTATION_DOCUMENT_SCHEMA_VERSION,
  type QuotationDocumentDataV1,
  type QuotationDocumentFlightLeg,
  type QuotationDocumentItem,
  type QuotationDocumentItemType,
} from "@/lib/quotation-documents/types"

export type QuotationBrandingSettings = Record<string, string | null | undefined>

export interface BuildQuotationDocumentDataInput {
  quotation: Record<string, unknown>
  branding?: QuotationBrandingSettings
}

const ALLOWED_ITEM_TYPES = new Set<QuotationDocumentItemType>([
  "FLIGHT",
  "HOTEL",
  "ACCOMMODATION",
  "TRANSFER",
  "ASSISTANCE",
  "INSURANCE",
  "EXCURSION",
  "ACTIVITY",
  "VISA",
  "OTHER",
])

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function optionalText(value: unknown): string | undefined {
  const valueText = text(value)
  return valueText || undefined
}

function finiteNumber(value: unknown, fallback = 0): number {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : fallback
}

function positiveInteger(value: unknown, fallback = 1): number {
  const numberValue = Math.trunc(finiteNumber(value, fallback))
  return numberValue > 0 ? numberValue : fallback
}

function splitPublicTerms(value: unknown): string[] {
  return text(value)
    .split(/\r?\n+/)
    .map(line => line.replace(/^[-•]\s*/, "").trim())
    .filter(Boolean)
}

function mapFlightLeg(leg: QuotationFlightLeg): QuotationDocumentFlightLeg {
  const baggage = leg.options?.flatMap(option => option.segments || [])
    .map(segment => segment.baggage || segment.carryOnBagInfo?.quantity || "")
    .find(Boolean)

  return {
    departureCode: optionalText(leg.departure?.city_code),
    departureCity: optionalText(leg.departure?.city_name),
    departureTime: optionalText(leg.departure?.time),
    arrivalCode: optionalText(leg.arrival?.city_code),
    arrivalCity: optionalText(leg.arrival?.city_name),
    arrivalTime: optionalText(leg.arrival?.time),
    duration: optionalText(leg.duration),
    type: optionalText(leg.flight_type),
    baggage: optionalText(baggage),
    layovers: (leg.layovers || []).map(layover => ({
      city: optionalText(layover.destination_city),
      code: optionalText(layover.destination_code),
      waitingTime: optionalText(layover.waiting_time),
    })),
  }
}

function mapItem(item: QuotationPresentationItem): QuotationDocumentItem {
  const rawType = text(item.item_type).toUpperCase() as QuotationDocumentItemType
  const type: QuotationDocumentItemType = ALLOWED_ITEM_TYPES.has(rawType) ? rawType : "OTHER"

  const documentItem: QuotationDocumentItem = {
    id: optionalText(item.id),
    type,
    description: text(item.description),
    provider: optionalText(item.provider),
    quantity: positiveInteger(item.quantity),
    pricePerUnit: item.price_per_unit == null ? undefined : finiteNumber(item.price_per_unit),
    notes: optionalText(item.notes),
  }

  if (type === "FLIGHT") {
    documentItem.flight = {
      airline: optionalText(item.airline),
      route: optionalText(item.flight_route),
      cabin: optionalText(item.flight_class),
      stops: item.flight_stops == null ? undefined : finiteNumber(item.flight_stops),
      departureDate: optionalText(item.flight_date),
      returnDate: optionalText(item.flight_return_date),
      screenshotUrl: optionalText(item.flight_screenshot_url),
      legs: (item.flight_details?.legs || []).map(mapFlightLeg),
    }
  }

  if (type === "HOTEL" || type === "ACCOMMODATION") {
    documentItem.hotel = {
      name: optionalText(item.hotel_name),
      stars: item.hotel_stars == null ? undefined : finiteNumber(item.hotel_stars),
      roomType: optionalText(item.room_type),
      mealPlan: optionalText(item.meal_plan),
      checkinDate: optionalText(item.checkin_date),
      checkoutDate: optionalText(item.checkout_date),
      nights: item.nights == null ? undefined : finiteNumber(item.nights),
      address: optionalText(item.hotel_address),
      photoUrl: optionalText(item.hotel_photo_url),
      rooms: item.rooms == null ? undefined : finiteNumber(item.rooms),
      destination: optionalText(item.destination_city),
    }
  }

  if (type === "TRANSFER") {
    documentItem.transfer = {
      description: optionalText(item.transfer_description),
    }
  }

  return documentItem
}

function getBrandingValue(settings: QuotationBrandingSettings, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = optionalText(settings[key])
    if (value) return value
  }
  return undefined
}

export function buildQuotationDocumentData(
  input: BuildQuotationDocumentDataInput
): QuotationDocumentDataV1 {
  const raw = input.quotation
  const branding = input.branding || {}
  const presentation = normalizeQuotationForPresentation(raw)
  const presentationContent = parseQuotationPresentationContent(raw.presentation_content)
  const lead = record(raw.lead)
  const seller = record(raw.seller)
  const agency = record(raw.agency)

  const quotationId = text(raw.id)
  const agencyId = text(raw.agency_id) || text(agency.id)
  if (!quotationId) throw new Error("La cotización no tiene id")
  if (!agencyId) throw new Error("La cotización no tiene agencia")

  const documentTerms = splitPublicTerms(presentation.terms_and_conditions)
  const organizationTerms = splitPublicTerms(
    getBrandingValue(branding, "pdf_terms_text", "terms_pdf")
  )

  return {
    schemaVersion: QUOTATION_DOCUMENT_SCHEMA_VERSION,
    identity: {
      quotationId,
      quotationNumber: presentation.quotation_number,
      title: presentationContent.title || presentation.destination || "Propuesta de viaje",
      createdAt: presentation.created_at,
      validUntil: presentation.valid_until,
      status: presentation.status,
    },
    agency: {
      id: agencyId,
      name: getBrandingValue(branding, "company_name") || presentation.agency_name || text(agency.name),
      logoUrl: getBrandingValue(branding, "brand_logo", "logo_url", "brand_logo_url"),
      phone: getBrandingValue(branding, "company_phone", "phone"),
      email: getBrandingValue(branding, "company_email", "email"),
      website: getBrandingValue(branding, "company_website", "website"),
      instagram: getBrandingValue(branding, "company_instagram", "instagram"),
      address: getBrandingValue(branding, "company_address", "address"),
      legalName: getBrandingValue(branding, "company_legal_name", "company_name"),
      taxId: getBrandingValue(branding, "company_cuit", "tax_id"),
      travelLicense: getBrandingValue(branding, "legajo", "company_legajo", "travel_license"),
    },
    customer: {
      displayName: presentationContent.customer.displayName || text(lead.contact_name) || "Cliente",
      email: presentationContent.customer.email || optionalText(lead.contact_email),
      phone: presentationContent.customer.phone || optionalText(lead.contact_phone),
    },
    advisor: {
      displayName: presentation.seller_name || text(seller.name) || "Asesor de viajes",
      email: optionalText(seller.email),
      phone: presentationContent.advisorPhone,
    },
    trip: {
      destination: presentation.destination,
      origin: optionalText(presentation.origin),
      region: optionalText(presentation.region),
      departureDate: presentation.departure_date,
      returnDate: optionalText(presentation.return_date),
      adults: presentation.adults,
      children: presentation.children,
      infants: presentation.infants,
    },
    options: presentation.options.map(option => ({
      id: option.id,
      number: option.option_number,
      title: option.title,
      totalAmount: option.total_amount,
      selected: option.is_selected,
      items: option.items.map(mapItem),
    })),
    narrative: {
      overview: presentationContent.overview || optionalText(presentation.package_description),
      publicNotes: optionalText(presentation.notes),
      inclusions: presentationContent.inclusions,
      exclusions: presentationContent.exclusions,
      itinerary: presentationContent.itinerary,
      recommendations: presentationContent.recommendations,
      restrictions: presentationContent.restrictions,
    },
    commercial: {
      currency: presentation.currency,
      pricingMode: presentation.pricing_mode,
      insuranceAmount: presentation.insurance_amount,
      transferAmount: presentation.transfer_amount,
      depositAmount: presentationContent.depositAmount,
      balanceDueDate: presentationContent.balanceDueDate,
      paymentMethods: presentation.payment_methods || [],
      paymentSchedule: presentationContent.paymentSchedule,
      terms: documentTerms.length > 0 ? documentTerms : organizationTerms,
    },
  }
}
