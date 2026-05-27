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

export interface EmiliaFlight {
  id: string
  airline: { code: string; name: string }
  price: {
    amount: number
    currency: string
    netAmount: number
    taxAmount: number
    fareAmount: number
  }
  adults: number
  children: number
  departure_date: string
  departure_time: string
  arrival_date: string
  arrival_time: string
  return_date: string | null
  trip_type?: "one_way" | "round_trip" | "multi_city"
  duration: { total: number; formatted: string }
  stops: { count: number; direct: boolean; connections: number }
  baggage: { included: boolean; details: string; quantity: number }
  cabin: { class: string; brandName: string }
  booking: { validatingCarrier: string; lastTicketingDate: string; fareType: string }
  legs: Array<{
    legNumber: number
    options: Array<{
      optionId: string
      duration: number
      segments: Array<{
        airline: string
        flightNumber: string
        departure: { airportCode: string; date: string; time: string }
        arrival: { airportCode: string; date: string; time: string }
        duration: number
        cabinClass: string
        baggage: string
      }>
    }>
  }>
  provider: "TVC"
  transactionId: string
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

function buildFlightRoute(flight: EmiliaFlight): string | null {
  const firstLeg = flight.legs?.[0]?.options?.[0]?.segments
  if (!firstLeg || firstLeg.length === 0) return null
  const origin = firstLeg[0].departure.airportCode
  const destination = firstLeg[firstLeg.length - 1].arrival.airportCode
  return `${origin} - ${destination}`
}

function mapFlightToItem(flight: EmiliaFlight) {
  return {
    item_type: "FLIGHT" as const,
    description: "",
    provider: flight.airline.code,
    quantity: flight.adults + flight.children,
    unit_price: flight.price.amount,
    cost_amount: 0,
    cost_currency: flight.price.currency,
    admin_fee_percentage: 0,
    operator_id: null,
    generates_commission: true,
    airline: flight.airline.name,
    flight_route: buildFlightRoute(flight),
    flight_date: flight.departure_date,
    flight_return_date: flight.return_date,
    flight_stops: flight.stops.count,
    flight_class: flight.cabin.class,
  }
}

function mapHotelToItem(sel: SelectedHotel) {
  const room = sel.hotel.rooms[sel.roomIndex]
  if (!room) throw new Error(`Hotel "${sel.hotel.name}" no tiene room index ${sel.roomIndex}`)

  return {
    item_type: "HOTEL" as const,
    description: "",
    provider: sel.hotel.provider,
    quantity: 1,
    rooms: 1,
    unit_price: room.total_price,
    cost_amount: 0,
    cost_currency: room.currency,
    admin_fee_percentage: 0,
    operator_id: null,
    generates_commission: true,
    hotel_name: sel.hotel.name,
    hotel_stars: parseStars(sel.hotel.category),
    hotel_address: sel.hotel.address,
    hotel_phone: sel.hotel.phone,
    hotel_photo_url: sel.hotel.images?.[0] ?? null,
    destination_city: sel.hotel.city,
    room_type: room.type,
    meal_plan: null as string | null,
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
