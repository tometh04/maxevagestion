import { getEffectiveQuotationOptionTotal, normalizeManualQuotationTotal } from "@/lib/quotations/totals"

export interface QuotationPresentationItem {
  id?: string
  item_type: string
  description: string
  quantity: number
  provider?: string | null
  destination_city?: string | null
  hotel_name?: string | null
  hotel_stars?: number | null
  room_type?: string | null
  meal_plan?: string | null
  checkin_date?: string | null
  checkout_date?: string | null
  nights?: number | null
  hotel_address?: string | null
  hotel_photo_url?: string | null
  rooms?: number | null
  airline?: string | null
  flight_route?: string | null
  flight_class?: string | null
  flight_stops?: number | null
  flight_date?: string | null
  flight_return_date?: string | null
  flight_screenshot_url?: string | null
  transfer_description?: string | null
  price_per_unit?: number | null
  notes?: string | null
  order_index?: number | null
}

export interface QuotationPresentationOption {
  id: string
  option_number: number
  title: string
  total_amount: number
  calculated_total_amount?: number | null
  manual_total_amount?: number | null
  is_selected: boolean
  items: QuotationPresentationItem[]
}

export type QuotationPricingMode = "PER_PERSON" | "GROUP_TOTAL"

export interface QuotationPresentationData {
  quotation_number: string
  destination: string
  origin?: string | null
  region?: string | null
  departure_date: string
  return_date?: string | null
  valid_until: string
  adults: number
  children: number
  infants: number
  currency: string
  pricing_mode: QuotationPricingMode
  status: string
  package_description?: string | null
  notes?: string | null
  terms_and_conditions?: string | null
  payment_methods?: string[] | null
  created_at: string
  seller_name: string
  agency_name: string
  options: QuotationPresentationOption[]
}

export interface QuotationDisplayPricing {
  pricingMode: QuotationPricingMode
  totalPassengers: number
  primaryAmount: number
  primaryLabel: "Precio por persona" | "Precio total"
  secondaryAmount: number | null
  secondaryLabel: "Precio por persona" | "Precio total" | null
}

export const QUOTATION_ITEM_LABELS: Record<string, string> = {
  FLIGHT: "Vuelo",
  HOTEL: "Hotel",
  ACCOMMODATION: "Alojamiento",
  TRANSFER: "Traslado",
  ASSISTANCE: "Asistencia",
  INSURANCE: "Asistencia",
  EXCURSION: "Excursion",
  ACTIVITY: "Excursion",
  VISA: "Visa",
  OTHER: "Otro",
}

export const QUOTATION_MEAL_PLAN_LABELS: Record<string, string> = {
  SOLO_ALOJAMIENTO: "Solo alojamiento",
  DESAYUNO: "Desayuno incluido",
  MEDIA_PENSION: "Media pension",
  PENSION_COMPLETA: "Pension completa",
  ALL_INCLUSIVE: "All Inclusive",
}

export const QUOTATION_FLIGHT_CLASS_LABELS: Record<string, string> = {
  ECONOMY: "Economica",
  PREMIUM_ECONOMY: "Premium Economy",
  BUSINESS: "Business",
  FIRST: "Primera Clase",
}

export const QUOTATION_STATUS_LABELS: Record<string, string> = {
  SENT: "Pendiente de revision",
  PENDING_APPROVAL: "Pendiente de aprobacion",
  APPROVED: "Aceptada",
  REJECTED: "Rechazada",
  EXPIRED: "Vencida",
  CONVERTED: "Confirmada",
  DRAFT: "Borrador",
}

export const QUOTATION_AVAILABILITY_NOTE = "Cotización sujeta a disponibilidad al momento de reservar"

export function formatQuotationCurrency(amount: number, currency: string) {
  const prefix = currency === "USD" ? "US$" : "$"
  return `${prefix} ${Number(amount).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function formatQuotationDateLong(dateStr: string) {
  const date = new Date(`${dateStr}T12:00:00`)
  const day = date.getDate()
  const month = date.toLocaleDateString("es-AR", { month: "long" })
  const year = date.getFullYear()
  const capitalMonth = month.charAt(0).toUpperCase() + month.slice(1)
  return `${day} de ${capitalMonth}, ${year}`
}

export function formatQuotationDateShort(dateStr: string) {
  const date = new Date(`${dateStr}T12:00:00`)
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

export function getQuotationPassengersText(data: Pick<QuotationPresentationData, "adults" | "children" | "infants">) {
  let text = `${data.adults} adulto${data.adults > 1 ? "s" : ""}`
  if (data.children > 0) {
    text += `, ${data.children} menor${data.children > 1 ? "es" : ""}`
  }
  if (data.infants > 0) {
    text += `, ${data.infants} bebe${data.infants > 1 ? "s" : ""}`
  }
  return text
}

export function getQuotationPassengerCount(data: Pick<QuotationPresentationData, "adults" | "children" | "infants">) {
  return data.adults + data.children + data.infants
}

export function normalizeQuotationPricingMode(value: unknown): QuotationPricingMode {
  return value === "PER_PERSON" ? "PER_PERSON" : "GROUP_TOTAL"
}

export function getQuotationOptionPricing(
  option: Pick<QuotationPresentationOption, "total_amount">,
  quotation: Pick<QuotationPresentationData, "adults" | "children" | "infants"> & {
    pricing_mode?: QuotationPricingMode | null
  }
): QuotationDisplayPricing {
  const totalPassengers = getQuotationPassengerCount(quotation)
  const pricingMode = normalizeQuotationPricingMode(quotation.pricing_mode)
  const totalAmount = Number(option.total_amount || 0)
  const perPersonAmount = totalPassengers > 0 ? totalAmount / totalPassengers : totalAmount

  if (totalPassengers <= 0) {
    return {
      pricingMode: "GROUP_TOTAL",
      totalPassengers,
      primaryAmount: totalAmount,
      primaryLabel: "Precio total",
      secondaryAmount: null,
      secondaryLabel: null,
    }
  }

  if (pricingMode === "PER_PERSON") {
    return {
      pricingMode,
      totalPassengers,
      primaryAmount: perPersonAmount,
      primaryLabel: "Precio por persona",
      secondaryAmount: totalPassengers > 1 ? totalAmount : null,
      secondaryLabel: totalPassengers > 1 ? "Precio total" : null,
    }
  }

  return {
    pricingMode,
    totalPassengers,
    primaryAmount: totalAmount,
    primaryLabel: "Precio total",
    secondaryAmount: totalPassengers > 1 ? perPersonAmount : null,
    secondaryLabel: totalPassengers > 1 ? "Precio por persona" : null,
  }
}

function sortByOrderIndex(a: any, b: any) {
  return (a?.order_index ?? 0) - (b?.order_index ?? 0)
}

function normalizeQuotationItem(item: any): QuotationPresentationItem {
  return {
    id: item.id || undefined,
    item_type: item.item_type || "OTHER",
    description: item.description || "",
    quantity: Number(item.quantity || 1),
    provider: item.provider || null,
    destination_city: item.destination_city || null,
    hotel_name: item.hotel_name || null,
    hotel_stars: item.hotel_stars != null ? Number(item.hotel_stars) : null,
    room_type: item.room_type || null,
    meal_plan: item.meal_plan || null,
    checkin_date: item.checkin_date || null,
    checkout_date: item.checkout_date || null,
    nights: item.nights != null ? Number(item.nights) : null,
    hotel_address: item.hotel_address || null,
    hotel_photo_url: item.hotel_photo_url || null,
    rooms: item.rooms != null ? Number(item.rooms) : null,
    airline: item.airline || null,
    flight_route: item.flight_route || null,
    flight_class: item.flight_class || null,
    flight_stops: item.flight_stops != null ? Number(item.flight_stops) : null,
    flight_date: item.flight_date || null,
    flight_return_date: item.flight_return_date || null,
    flight_screenshot_url: item.flight_screenshot_url || null,
    transfer_description: item.transfer_description || null,
    price_per_unit: item.price_per_unit != null
      ? Number(item.price_per_unit)
      : item.unit_price != null
        ? Number(item.unit_price)
        : null,
    notes: item.notes || null,
    order_index: item.order_index != null ? Number(item.order_index) : null,
  }
}

function normalizeQuotationOptions(
  quotation: any,
  rawOptions: any[],
  rawItems: any[]
): QuotationPresentationOption[] {
  return rawOptions
    .map((option: any, index: number) => {
      const optionItems = Array.isArray(option.items)
        ? option.items
        : rawItems.filter((item: any) => item.option_id === option.id)

      return {
        id: option.id,
        option_number: Number(option.option_number ?? index + 1),
        title: option.title || `Opcion ${index + 1}`,
        total_amount: getEffectiveQuotationOptionTotal(option),
        calculated_total_amount: option.calculated_total_amount != null
          ? Number(option.calculated_total_amount)
          : null,
        manual_total_amount: normalizeManualQuotationTotal(option.manual_total_amount),
        is_selected: Boolean(option.is_selected),
        items: optionItems
          .slice()
          .sort(sortByOrderIndex)
          .map(normalizeQuotationItem),
      }
    })
    .sort((a, b) => a.option_number - b.option_number)
}

export function normalizeQuotationForPresentation(quotation: any): QuotationPresentationData {
  const rawOptions = Array.isArray(quotation.options)
    ? quotation.options
    : Array.isArray(quotation.quotation_options)
      ? quotation.quotation_options
      : []
  const rawItems = Array.isArray(quotation.quotation_items) ? quotation.quotation_items : []

  return {
    quotation_number: quotation.quotation_number || "",
    destination: quotation.destination || "",
    origin: quotation.origin || null,
    region: quotation.region || null,
    departure_date: quotation.departure_date || "",
    return_date: quotation.return_date || null,
    valid_until: quotation.valid_until || "",
    adults: Number(quotation.adults || 0),
    children: Number(quotation.children || 0),
    infants: Number(quotation.infants || 0),
    currency: quotation.currency || "USD",
    pricing_mode: normalizeQuotationPricingMode(quotation.pricing_mode),
    status: quotation.status || "DRAFT",
    package_description: quotation.package_description || null,
    notes: quotation.notes || null,
    terms_and_conditions: quotation.terms_and_conditions || null,
    payment_methods: Array.isArray(quotation.payment_methods) ? quotation.payment_methods : null,
    created_at: quotation.created_at || new Date().toISOString(),
    seller_name: quotation.seller_name || quotation.seller?.name || "",
    agency_name: quotation.agency_name || quotation.agency?.name || "",
    options: normalizeQuotationOptions(quotation, rawOptions, rawItems),
  }
}
