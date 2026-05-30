// lib/emilia/quotation-mapper.ts
/**
 * Función pura que mapea la selección de cards de Emilia
 * (1 vuelo opcional + N hoteles) al payload exacto que espera
 * POST /api/quotations.
 *
 * Patrón: 1 vuelo + N hoteles = N opciones de cotización, donde el
 * vuelo se replica en cada opción (alineado con el sync de vuelos
 * que ya hace QuotationBuilderDialog al editar).
 *
 * Defense: si el UI permite >4 hoteles por bug, este mapper clampea
 * a 4 silenciosamente (el UI ya muestra toast).
 */

const MAX_OPTIONS = 4

// =============================================================================
// Tipos de input — basados en EmiliaFlight (TVC) y EurovipsHotel server-side
// =============================================================================

// IMPORTANTE: este es el shape *transformado* (output de `transformFlights` en
// lib/emilia/transformers.ts), que es exactamente lo que consumen las cards del
// chat y, por ende, lo que llega a este mapper. NO es el shape crudo de la API.
export interface EmiliaFlightLeg {
  departure: { city_code: string; city_name: string; time: string }
  arrival: { city_code: string; city_name: string; time: string }
  duration: string
  flight_type: "outbound" | "inbound"
  layovers?: Array<{
    destination_city: string
    destination_code: string
    waiting_time: string
  }>
  arrival_next_day?: boolean
}

export interface EmiliaFlight {
  id: string
  airline: { code: string; name: string }
  price: { amount: number; currency: string }
  adults: number
  // El transformer emite `childrens` (typo histórico) y ahora también `children`.
  children?: number
  childrens?: number
  departure_date: string
  return_date?: string | null
  cabin_class?: string | null
  legs: EmiliaFlightLeg[]
}

export interface EurovipsHotel {
  id: string
  unique_id: string
  name: string
  category: string
  city: string
  address: string
  phone: string
  website?: string
  description?: string
  images: string[]
  check_in: string
  check_out: string
  nights: number
  rooms: Array<{
    type: string
    description: string
    price_per_night: number
    total_price: number
    currency: string
    availability: number
    occupancy_id: string
    xml_occupancy_id?: string
    fare_id_broker?: string
    adults?: number
    children?: number
    infants?: number
  }>
  policy_cancellation: string
  policy_lodging: string
  search_adults: number
  search_children: number
  provider: "EUROVIPS"
}

export interface GeneralData {
  departureDate: string
  returnDate: string | null
  adults: number
  children: number
  infants: number
}

export interface LeadInfo {
  id: string
  contact_name: string
  destination: string | null
  region: string | null
  agency_id: string
}

export interface SelectedHotel {
  hotel: EurovipsHotel
  roomIndex: number
}

export interface BuildQuotationInput {
  lead: LeadInfo
  selectedFlight: EmiliaFlight | null
  selectedHotels: SelectedHotel[]
  generalData: GeneralData
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Parsea string como "5 estrellas" / "★★★★★" / "5 star" / "5*" a número.
 * Devuelve null si no matchea ningún patrón conocido.
 */
export function parseStars(category: string | null | undefined): number | null {
  if (!category) return null
  const s = String(category).trim()
  if (!s) return null

  // Patrón 1: estrellas unicode
  const unicodeStars = (s.match(/★/g) || []).length
  if (unicodeStars >= 1 && unicodeStars <= 5) return unicodeStars

  // Patrón 2: número + "estrella(s)" / "star(s)" / "*"
  const m = s.match(/^(\d+)\s*(?:estrellas?|stars?|\*)/i)
  if (m) {
    const n = parseInt(m[1], 10)
    if (n >= 1 && n <= 5) return n
  }
  return null
}

/** Leg de ida del vuelo transformado (fallback al primer leg). */
function outboundLeg(flight: EmiliaFlight): EmiliaFlightLeg | null {
  const legs = flight.legs
  if (!Array.isArray(legs) || legs.length === 0) return null
  return legs.find((l) => l.flight_type === "outbound") ?? legs[0]
}

/**
 * Normaliza la clase de cabina a las keys de enum que usa la presentación
 * (QUOTATION_FLIGHT_CLASS_LABELS: ECONOMY / PREMIUM_ECONOMY / BUSINESS / FIRST).
 * Acepta tanto palabras ("Economy", "Económica") como códigos de booking
 * class IATA de una letra. Si no matchea nada conocido, devuelve el valor
 * original en mayúsculas (mejor mostrar algo que perderlo).
 */
export function normalizeFlightClass(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = String(raw).trim().toUpperCase()
  if (!s) return null
  if (["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"].includes(s)) return s

  if (/FIRST|PRIMERA/.test(s)) return "FIRST"
  if (/BUSINESS|EJECUTIV/.test(s)) return "BUSINESS"
  if (/PREMIUM/.test(s)) return "PREMIUM_ECONOMY"
  if (/ECON[OÓ]M|TURISTA|COACH/.test(s)) return "ECONOMY"

  // Códigos de cabina/booking class IATA de una sola letra.
  if (/^[FAP]$/.test(s)) return "FIRST"
  if (/^[CJDIZ]$/.test(s)) return "BUSINESS"
  if (/^W$/.test(s)) return "PREMIUM_ECONOMY"
  if (/^[YMBHKLQTENRSVXGUO]$/.test(s)) return "ECONOMY"

  return s
}

/**
 * Deriva el régimen de comidas (meal plan) a partir de la descripción de la
 * habitación, devolviendo las keys de enum de QUOTATION_MEAL_PLAN_LABELS.
 * Devuelve null si no se reconoce ningún patrón.
 */
export function deriveMealPlan(description: string | null | undefined): string | null {
  if (!description) return null
  const s = String(description).toLowerCase()
  if (!s.trim()) return null

  if (/all\s*-?\s*inclusive|todo\s+incluido/.test(s)) return "ALL_INCLUSIVE"
  if (/full\s*board|pensi[oó]n\s+completa/.test(s)) return "PENSION_COMPLETA"
  if (/half\s*board|media\s+pensi[oó]n/.test(s)) return "MEDIA_PENSION"
  if (/breakfast|desayuno|b\s*&\s*b/.test(s)) return "DESAYUNO"
  if (/room\s*only|solo\s+alojamiento|sin\s+comidas|only\s+room/.test(s)) return "SOLO_ALOJAMIENTO"
  return null
}

function buildFlightRoute(flight: EmiliaFlight): string | null {
  // El shape transformado expone origen/destino en cada leg como `city_code`.
  // Usamos el leg de ida. Si falta algún código devolvemos null en lugar de
  // crashear — el vendedor puede completarlo en el QuotationBuilder.
  const leg = outboundLeg(flight)
  const origin = leg?.departure?.city_code
  const destination = leg?.arrival?.city_code
  if (!origin || !destination) return null
  return `${origin} - ${destination}`
}

function mapFlightToItem(flight: EmiliaFlight) {
  // Acceso defensivo a campos opcionales — Emilia entrega shapes ligeramente
  // distintos según proveedor (TVC, etc.). Defaults razonables si falta algo.
  const adults = flight.adults ?? 0
  const children = flight.children ?? flight.childrens ?? 0
  const quantity = adults + children || 1
  // Escalas: el shape transformado no trae `stops`; las contamos desde los
  // layovers del leg de ida.
  const stops = outboundLeg(flight)?.layovers?.length ?? 0
  const route = buildFlightRoute(flight)
  const airlineName = flight.airline?.name ?? null
  // Descripción legible para el editor/PDF: aerolínea · ruta · escalas.
  const description = [
    airlineName,
    route,
    stops > 0 ? `${stops} escala${stops > 1 ? "s" : ""}` : "directo",
  ]
    .filter(Boolean)
    .join(" · ")
  return {
    item_type: "FLIGHT" as const,
    description,
    provider: flight.airline?.code ?? null,
    quantity,
    unit_price: flight.price?.amount ?? 0,
    cost_amount: 0,
    cost_currency: flight.price?.currency ?? "USD",
    admin_fee_percentage: 0,
    operator_id: null,
    generates_commission: true,
    airline: airlineName,
    flight_route: route,
    flight_date: flight.departure_date ?? null,
    flight_return_date: flight.return_date ?? null,
    flight_stops: stops,
    flight_class: normalizeFlightClass(flight.cabin_class),
    // Detalle rico por leg (horarios, duración, escalas) → se persiste en
    // quotation_items.flight_details (jsonb). Permite renderizar ida/regreso
    // con escalas y horarios en la cotización pública.
    flight_details:
      Array.isArray(flight.legs) && flight.legs.length > 0 ? { legs: flight.legs } : null,
  }
}

function mapHotelToItem(sel: SelectedHotel) {
  // Acceso defensivo: si no hay room en el index pedido, intentar room 0;
  // si tampoco hay, devolver shape mínimo con price 0 (el vendedor lo edita).
  const room = sel.hotel.rooms?.[sel.roomIndex] ?? sel.hotel.rooms?.[0] ?? null

  return {
    item_type: "HOTEL" as const,
    description: room?.description ?? "",
    provider: sel.hotel.provider ?? null,
    quantity: 1,
    rooms: 1,
    unit_price: room?.total_price ?? 0,
    cost_amount: 0,
    cost_currency: room?.currency ?? "USD",
    admin_fee_percentage: 0,
    operator_id: null,
    generates_commission: true,
    hotel_name: sel.hotel.name ?? null,
    hotel_stars: parseStars(sel.hotel.category),
    hotel_address: sel.hotel.address ?? null,
    hotel_phone: sel.hotel.phone ?? null,
    hotel_photo_url: sel.hotel.images?.[0] ?? null,
    destination_city: sel.hotel.city ?? null,
    room_type: room?.type ?? null,
    meal_plan: deriveMealPlan(room?.description),
    checkin_date: sel.hotel.check_in,
    checkout_date: sel.hotel.check_out,
    nights: sel.hotel.nights,
  }
}

// =============================================================================
// Mapper principal
// =============================================================================

export function buildQuotationPayload(input: BuildQuotationInput) {
  const { lead, selectedFlight, selectedHotels, generalData } = input

  // Validaciones de entrada
  if (!generalData.departureDate) {
    throw new Error("Faltan fechas. Pedile a Emilia que aclare antes de generar.")
  }
  if (!selectedFlight && selectedHotels.length === 0) {
    throw new Error("Seleccioná al menos un vuelo o un hotel.")
  }

  // Defensa: clampear a MAX_OPTIONS hoteles aunque el UI ya lo limita
  const hotels = selectedHotels.slice(0, MAX_OPTIONS)
  const numOptions = Math.max(hotels.length, 1)

  const options = []
  for (let i = 0; i < numOptions; i++) {
    const items: any[] = []

    if (selectedFlight) {
      items.push(mapFlightToItem(selectedFlight))
    }
    if (hotels[i]) {
      items.push(mapHotelToItem(hotels[i]))
    }

    const total = items.reduce((s, it) => s + (it.unit_price || 0) * (it.quantity || 1), 0)

    options.push({
      title: `Opción ${i + 1}`,
      total_amount: total,
      manual_total_amount: null,
      items,
    })
  }

  return {
    lead_id: lead.id,
    agency_id: lead.agency_id,
    destination: lead.destination,
    region: lead.region || "OTROS",
    departure_date: generalData.departureDate,
    return_date: generalData.returnDate,
    adults: generalData.adults,
    children: generalData.children,
    infants: generalData.infants,
    currency: "USD",
    pricing_mode: "PER_PERSON",
    payment_methods: [] as string[],
    options,
  }
}
