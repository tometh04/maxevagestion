import type { QuotationDocumentDataV1 } from "@/lib/quotation-documents/types"
import type {
  QuotationFlightLeg,
  QuotationPresentationData,
  QuotationPresentationItem,
} from "@/lib/quotations/presentation"

/**
 * Proyección pública: la opción aceptada vive en la cotización actual, pero el
 * resto de la propuesta sigue saliendo del snapshot emitido e inmutable.
 */
export function withSelectedQuotationOption(
  model: QuotationDocumentDataV1,
  selectedOptionId: string
): QuotationDocumentDataV1 {
  if (!model.options.some(option => option.id === selectedOptionId)) return model
  return {
    ...model,
    options: model.options.map(option => ({
      ...option,
      selected: option.id === selectedOptionId,
    })),
  }
}

function presentationItem(
  item: QuotationDocumentDataV1["options"][number]["items"][number],
  index: number
): QuotationPresentationItem {
  const legs: QuotationFlightLeg[] = (item.flight?.legs || []).map(leg => ({
    departure: {
      city_code: leg.departureCode || null,
      city_name: leg.departureCity || null,
      time: leg.departureTime || null,
    },
    arrival: {
      city_code: leg.arrivalCode || null,
      city_name: leg.arrivalCity || null,
      time: leg.arrivalTime || null,
    },
    duration: leg.duration || null,
    flight_type: leg.type || null,
    layovers: leg.layovers.map(layover => ({
      destination_city: layover.city || null,
      destination_code: layover.code || null,
      waiting_time: layover.waitingTime || null,
    })),
    options: leg.baggage ? [{ segments: [{ baggage: leg.baggage }] }] : null,
  }))

  return {
    id: item.id,
    item_type: item.type,
    description: item.description,
    quantity: item.quantity,
    provider: item.provider || null,
    destination_city: item.hotel?.destination || null,
    hotel_name: item.hotel?.name || null,
    hotel_stars: item.hotel?.stars || null,
    room_type: item.hotel?.roomType || null,
    meal_plan: item.hotel?.mealPlan || null,
    checkin_date: item.hotel?.checkinDate || null,
    checkout_date: item.hotel?.checkoutDate || null,
    nights: item.hotel?.nights || null,
    hotel_address: item.hotel?.address || null,
    hotel_photo_url: item.hotel?.photoUrl || null,
    rooms: item.hotel?.rooms || null,
    airline: item.flight?.airline || null,
    flight_route: item.flight?.route || null,
    flight_class: item.flight?.cabin || null,
    flight_stops: item.flight?.stops ?? null,
    flight_date: item.flight?.departureDate || null,
    flight_return_date: item.flight?.returnDate || null,
    flight_screenshot_url: item.flight?.screenshotUrl || null,
    flight_details: legs.length > 0 ? { legs } : null,
    transfer_description: item.transfer?.description || null,
    price_per_unit: item.pricePerUnit ?? null,
    notes: item.notes || null,
    order_index: index,
  }
}

/**
 * La vista pública usa el mismo snapshot que el HTML emitido. Sólo el estado
 * se toma en vivo para reflejar aceptación, vencimiento o conversión.
 */
export function quotationDocumentToPresentation(
  model: QuotationDocumentDataV1,
  currentStatus = model.identity.status
): QuotationPresentationData {
  return {
    quotation_number: model.identity.quotationNumber,
    destination: model.trip.destination,
    origin: model.trip.origin || null,
    region: model.trip.region || null,
    departure_date: model.trip.departureDate,
    return_date: model.trip.returnDate || null,
    valid_until: model.identity.validUntil,
    adults: model.trip.adults,
    children: model.trip.children,
    infants: model.trip.infants,
    currency: model.commercial.currency,
    pricing_mode: model.commercial.pricingMode,
    insurance_amount: model.commercial.insuranceAmount,
    transfer_amount: model.commercial.transferAmount,
    status: currentStatus,
    package_description: model.narrative.overview || null,
    notes: model.narrative.publicNotes || null,
    terms_and_conditions: model.commercial.terms.join("\n") || null,
    payment_methods: model.commercial.paymentMethods,
    created_at: model.identity.createdAt,
    seller_name: model.advisor.displayName,
    agency_name: model.agency.name,
    options: model.options.map(option => ({
      id: option.id,
      option_number: option.number,
      title: option.title,
      total_amount: option.totalAmount,
      calculated_total_amount: option.totalAmount,
      manual_total_amount: null,
      is_selected: option.selected,
      items: option.items.map(presentationItem),
    })),
  }
}
