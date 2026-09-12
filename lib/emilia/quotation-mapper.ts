// lib/emilia/quotation-mapper.ts
/**
 * Función pura que mapea la selección de cards de Emilia
 * (alternativas de vuelos, o 1 vuelo opcional + N hoteles) al payload que espera
 * POST /api/quotations.
 *
 * Las ofertas con estadías forman una opción con un hotel por estadía.
 * Las ofertas históricas sin estadía siguen formando opciones comparables.
 *
 * Se exige una selección completa antes de generar un itinerario.
 */

import type { HotelSearchContext } from "./hotel-stays"

const MAX_OPTIONS = 4

export interface EmiliaOfferSource {
  artifact_id: string
  product: "flights" | "hotels"
  offer_id: string
  selection_id?: string
}

export interface EmiliaOfferRefreshFallback {
  product: "flights" | "hotels"
  query: Record<string, unknown>
  identity: Record<string, unknown>
}

export type EmiliaCostBasis = "AGENCY_NET" | "PROVIDER_TOTAL" | "COMMISSIONABLE_GROSS" | "UNKNOWN"

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
  stops?: number
  options?: Array<{
    segments?: Array<{
      baggage?: string
      carryOnBagInfo?: { quantity: string }
    }>
  }>
  segments?: Array<Record<string, unknown>>
}

export interface EmiliaFlight {
  id: string
  airline: { code: string; name: string }
  price: {
    amount: number
    currency: string
    // Los proveedores canónicos de Emilia entregan el total de la búsqueda,
    // no un precio unitario. Opcional para conversaciones históricas guardadas
    // antes de explicitar el contrato.
    basis?: "GROUP_TOTAL"
    cost_basis?: EmiliaCostBasis
  }
  adults: number
  // El transformer emite `childrens` (typo histórico) y ahora también `children`.
  children?: number
  childrens?: number
  departure_date: string
  return_date?: string | null
  cabin_class?: string | null
  legs: EmiliaFlightLeg[]
  provider?: string | null
  baggage?: { carry_on: boolean | null; checked: boolean | null }
  refundable?: boolean | null
  offer_source?: EmiliaOfferSource
  offer_refresh_fallback?: EmiliaOfferRefreshFallback
}

export interface EurovipsHotel {
  search_context?: HotelSearchContext
  id: string
  unique_id: string
  name: string
  category: string
  city: string
  address: string
  phone: string
  website?: string
  description?: string
  amenities?: string[]
  accessibility?: string[]
  latitude?: number | null
  longitude?: number | null
  expires_at?: string | null
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
    id?: string
    offer_source?: EmiliaOfferSource
    offer_refresh_fallback?: EmiliaOfferRefreshFallback
    cost_basis?: EmiliaCostBasis
    availability_status?: "available" | "on_request" | "unavailable"
    policy_cancellation?: string
    refundable?: boolean | null
    free_cancellation?: boolean | null
    payment_at_property?: boolean | null
    board?: string | null
    board_description?: string | null
    amenities?: string[]
    images?: string[]
    cancellation_deadline?: string | null
    nightly_prices?: Array<{ date: string; price: { amount: number; currency: string } }>
    promotion?: string | null
    cancellation_terms?: Array<{ from_date: string; to_date?: string; penalty: { amount: number; currency: string } }>
    price_breakdown?: { base?: { amount: number; currency: string }; taxes?: { amount: number; currency: string } }
    room_type_code?: string | null
    rate_plan_code?: string | null
  }>
  policy_cancellation: string
  policy_lodging: string
  room_conditions?: string | null
  observations?: string | null
  search_adults: number
  search_children: number
  provider?: string | null
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
  requiredStayIds?: string[]
  lead: LeadInfo
  selectedFlights: EmiliaFlight[]
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
  const s = String(description).toLowerCase().replace(/_/g, " ")
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
  // fallar o inventar una ruta que el proveedor no informó.
  const leg = outboundLeg(flight)
  const origin = leg?.departure?.city_code
  const destination = leg?.arrival?.city_code
  if (!origin || !destination) return null
  return `${origin} - ${destination}`
}

function mapFlightToItem(flight: EmiliaFlight) {
  // Acceso defensivo a campos opcionales — Emilia entrega shapes ligeramente
  // distintos según proveedor (TVC, etc.). Defaults razonables si falta algo.
  // Escalas: el shape transformado no trae `stops`; las contamos desde los
  // layovers del leg de ida.
  const outbound = outboundLeg(flight)
  const stops = outbound?.stops ?? outbound?.layovers?.length ?? 0
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
    provider: flight.provider ?? null,
    // `price.amount` ya es el total para todos los pasajeros de la búsqueda.
    // Los pax viven en el header de la cotización; quantity=1 evita volver a
    // multiplicar el total grupal en persistence/totals.
    quantity: 1,
    unit_price: flight.price?.amount ?? 0,
    // El importe del proveedor es simultáneamente el precio inicial sugerido y
    // la base de costo. El asesor puede aumentar `unit_price`, pero la deuda al
    // operador nunca debe degradarse a cero por venir desde Emilia.
    cost_amount: flight.price?.amount ?? 0,
    gross_price: flight.price?.amount ?? 0,
    cost_basis: flight.price?.cost_basis ?? "UNKNOWN",
    cost_calculation_mode: flight.price?.cost_basis === "COMMISSIONABLE_GROSS"
      ? "COMMISSIONABLE"
      : "SIMPLE",
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
      Array.isArray(flight.legs) && flight.legs.length > 0
        ? { legs: flight.legs, baggage: flight.baggage ?? null, refundable: flight.refundable ?? null }
        : null,
    offer_source: flight.offer_source ?? null,
    offer_refresh_fallback: flight.offer_refresh_fallback ?? null,
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
    cost_amount: room?.total_price ?? 0,
    gross_price: room?.total_price ?? 0,
    cost_basis: room?.cost_basis ?? "UNKNOWN",
    cost_calculation_mode: room?.cost_basis === "COMMISSIONABLE_GROSS"
      ? "COMMISSIONABLE"
      : "SIMPLE",
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
    meal_plan: deriveMealPlan(room?.board_description) || deriveMealPlan(room?.board) || deriveMealPlan(room?.description),
    checkin_date: sel.hotel.check_in,
    checkout_date: sel.hotel.check_out,
    nights: sel.hotel.nights,
    offer_source: room?.offer_source ?? null,
    offer_refresh_fallback: room?.offer_refresh_fallback ?? null,
  }
}

// =============================================================================
// Mapper principal
// =============================================================================

export function buildQuotationPayload(input: BuildQuotationInput) {
  const { lead, selectedFlights, selectedHotels, generalData } = input
  const primaryFlight = selectedFlights[0]

  // Validaciones de entrada
  if (!generalData.departureDate) {
    throw new Error("Faltan fechas. Pedile a Emilia que aclare antes de generar.")
  }
  if (selectedFlights.length === 0 && selectedHotels.length === 0) {
    throw new Error("Seleccioná al menos un vuelo o un hotel.")
  }
  if (selectedFlights.length > MAX_OPTIONS) {
    throw new Error(`Seleccioná hasta ${MAX_OPTIONS} alternativas de vuelo.`)
  }
  if (selectedFlights.length > 1 && selectedHotels.length > 0) {
    throw new Error("Para combinar con hoteles, seleccioná un solo vuelo.")
  }

  const scoped = selectedHotels.some(({ hotel }) => hotel.search_context) || Boolean(input.requiredStayIds?.length)
  const hotels = scoped ? [...selectedHotels] : selectedHotels.slice(0, MAX_OPTIONS)
  if (scoped) {
    const ids = hotels.map(({ hotel }) => hotel.search_context?.stay_id)
    const required = new Set([
      ...(input.requiredStayIds || []),
      ...hotels.flatMap(({ hotel }) => hotel.search_context?.required_stay_ids || []),
    ])
    if (hotels.length > 6 || ids.some(id => !id) || new Set(ids).size !== ids.length) {
      throw new Error("Seleccioná un solo hotel por estadía.")
    }
    if (Array.from(required).some(id => !ids.includes(id))) {
      throw new Error("Seleccioná un hotel para cada estadía antes de cotizar.")
    }
    hotels.sort((a, b) => a.hotel.check_in.localeCompare(b.hotel.check_in))
    for (let i = 1; i < hotels.length; i++) {
      if (hotels[i].hotel.check_in < hotels[i - 1].hotel.check_out) throw new Error("Las fechas de las estadías se superponen.")
    }
    for (const { hotel } of hotels) {
      const budget = hotel.search_context?.combined_budget
      if (!budget) continue
      const prices = [primaryFlight?.price, ...hotels.map(({ hotel: stay, roomIndex }) => {
        const room = stay.rooms[roomIndex]
        return room ? { amount: room.total_price, currency: room.currency } : undefined
      })]
      if (!primaryFlight || prices.some(price => !price || !Number.isFinite(price.amount) || price.currency !== budget.currency)
        || prices.reduce((total, price) => total + (price?.amount || 0), 0) > budget.amount) {
        throw new Error("La selección no cumple el presupuesto del viaje. Revisá el vuelo y todas las estadías.")
      }
    }
  }
  const currencies = [
    ...selectedFlights.map(flight => flight.price?.currency),
    ...hotels.map(selection => (
      selection.hotel.rooms?.[selection.roomIndex]
      ?? selection.hotel.rooms?.[0]
    )?.currency),
  ].filter((currency): currency is string => (
    typeof currency === "string" && /^[A-Z]{3}$/.test(currency)
  ))
  const distinctCurrencies = Array.from(new Set(currencies))
  if (distinctCurrencies.length !== 1) {
    throw new Error(
      distinctCurrencies.length === 0
        ? "Las ofertas seleccionadas no tienen una moneda válida."
        : "Las ofertas seleccionadas usan monedas distintas. Convertí los importes antes de cotizar."
    )
  }
  const numOptions = scoped ? 1 : Math.max(hotels.length, selectedFlights.length, 1)

  const options = []
  for (let i = 0; i < numOptions; i++) {
    const items: any[] = []

    const selectedFlight = hotels.length > 0 ? selectedFlights[0] : selectedFlights[i]
    if (selectedFlight) {
      items.push(mapFlightToItem(selectedFlight))
    }
    if (scoped) {
      items.push(...hotels.map(mapHotelToItem))
    } else if (hotels[i]) {
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
    destination: scoped ? hotels.map(({ hotel }) => hotel.city).filter(Boolean).join(" · ") || lead.destination : lead.destination,
    region: lead.region || "OTROS",
    departure_date: primaryFlight?.departure_date || (scoped ? hotels[0]?.hotel.check_in : null) || generalData.departureDate,
    return_date: primaryFlight ? primaryFlight.return_date ?? null : (scoped ? hotels[hotels.length - 1]?.hotel.check_out : null) || generalData.returnDate,
    adults: generalData.adults,
    children: generalData.children,
    infants: generalData.infants,
    currency: distinctCurrencies[0],
    // Tanto vuelos como habitaciones llegan con un total grupal/de estadía.
    // La presentación puede derivar el valor por persona desde este total.
    pricing_mode: "GROUP_TOTAL",
    payment_methods: [] as string[],
    presentation_content: {
      schemaVersion: 1 as const,
      title: lead.destination || undefined,
      customer: { displayName: lead.contact_name },
      inclusions: [] as string[],
      exclusions: [] as string[],
      itinerary: [] as Array<{ day: number; title: string; description: string }>,
      recommendations: [] as string[],
      restrictions: [] as string[],
      paymentSchedule: [] as Array<{ label: string; amount?: number; dueDate?: string; notes?: string }>,
    },
    options,
  }
}
