import {
  truncateEurovipsAddress,
  truncateEurovipsPolicy,
} from "@/lib/emilia/display-text"

/**
 * Transformadores de datos de la API externa de viajes
 * Convierte la estructura de la API al formato esperado por los componentes del frontend
 */

interface ApiFlightLeg {
  legNumber: number
  options: Array<{
    optionId: string
    duration: number
    segments: Array<{
      airline: string
      flightNumber: number
      departure: {
        airportCode: string
        date: string
        time: string
      }
      arrival: {
        airportCode: string
        date: string
        time: string
      }
      duration: number
      cabinClass: string
      baggage?: string
      carryOnBagInfo?: {
        quantity: string
      }
    }>
  }>
}

interface ApiFlight {
  id: string
  airline: {
    code: string
    name: string
  }
  price: {
    amount: number
    currency: string
    basis?: "AGENCY_NET" | "PROVIDER_TOTAL" | "COMMISSIONABLE_GROSS" | "UNKNOWN" | "GROUP_TOTAL"
    cost_basis?: "AGENCY_NET" | "PROVIDER_TOTAL" | "COMMISSIONABLE_GROSS" | "UNKNOWN"
  }
  providerMeta?: {
    priceBasis?: "AGENCY_NET" | "PROVIDER_TOTAL" | "COMMISSIONABLE_GROSS" | "UNKNOWN"
  }
  adults: number
  children: number
  departure_date: string
  return_date?: string
  legs: ApiFlightLeg[]
  duration?: {
    formatted: string
  }
  offer_source?: {
    artifact_id: string
    product: "flights"
    offer_id: string
    selection_id?: string
  }
  offer_refresh_fallback?: {
    product: "flights"
    query: Record<string, unknown>
    identity: Record<string, unknown>
  }
}

function providerCostBasis(value: unknown) {
  return ["AGENCY_NET", "PROVIDER_TOTAL", "COMMISSIONABLE_GROSS"].includes(String(value))
    ? value as "AGENCY_NET" | "PROVIDER_TOTAL" | "COMMISSIONABLE_GROSS"
    : "UNKNOWN" as const
}

interface TransformedFlightLeg {
  departure: {
    city_code: string
    city_name: string
    time: string
  }
  arrival: {
    city_code: string
    city_name: string
    time: string
  }
  duration: string
  flight_type: "outbound" | "inbound"
  layovers?: Array<{
    destination_city: string
    destination_code: string
    waiting_time: string
  }>
  arrival_next_day?: boolean
  options?: Array<{
    segments?: Array<{
      baggage?: string
      carryOnBagInfo?: {
        quantity: string
      }
    }>
  }>
}

// Mapeo de códigos IATA a nombres de ciudades
const cityNames: Record<string, string> = {
  // Argentina
  EZE: "Buenos Aires",
  AEP: "Buenos Aires",
  COR: "Córdoba",
  MDZ: "Mendoza",
  BRC: "Bariloche",
  IGR: "Iguazú",
  USH: "Ushuaia",
  FTE: "El Calafate",
  TUC: "Tucumán",
  SLA: "Salta",
  ROS: "Rosario",
  
  // México y Caribe
  CUN: "Cancún",
  PUJ: "Punta Cana",
  MEX: "Ciudad de México",
  GDL: "Guadalajara",
  MTY: "Monterrey",
  CZM: "Cozumel",
  SJD: "Los Cabos",
  PVR: "Puerto Vallarta",
  
  // USA
  MIA: "Miami",
  NYC: "Nueva York",
  JFK: "Nueva York",
  EWR: "Newark",
  LAX: "Los Ángeles",
  SFO: "San Francisco",
  ORD: "Chicago",
  DFW: "Dallas",
  ATL: "Atlanta",
  MCO: "Orlando",
  
  // Sudamérica
  PTY: "Panamá",
  LIM: "Lima",
  SCL: "Santiago",
  GRU: "São Paulo",
  GIG: "Río de Janeiro",
  BOG: "Bogotá",
  UIO: "Quito",
  CCS: "Caracas",
  ASU: "Asunción",
  MVD: "Montevideo",
  
  // Europa
  MAD: "Madrid",
  BCN: "Barcelona",
  LIS: "Lisboa",
  ROM: "Roma",
  FCO: "Roma",
  PAR: "París",
  CDG: "París",
  LON: "Londres",
  LHR: "Londres",
  AMS: "Ámsterdam",
  FRA: "Frankfurt",
  MUC: "Múnich",
  
  // Otros destinos populares
  HAV: "La Habana",
  SDQ: "Santo Domingo",
  LPB: "La Paz",
}

function getCityName(code: string): string {
  return cityNames[code] || code
}

function formatMinutesToHours(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours}h ${mins.toString().padStart(2, "0")}m`
}

function calculateLayovers(segments: ApiFlightLeg["options"][0]["segments"]) {
  const layovers: TransformedFlightLeg["layovers"] = []

  for (let i = 0; i < segments.length - 1; i++) {
    const current = segments[i]
    const next = segments[i + 1]

    const arrivalTime = new Date(`${current.arrival.date}T${current.arrival.time}`)
    const departureTime = new Date(`${next.departure.date}T${next.departure.time}`)
    const waitingMinutes = Math.round(
      (departureTime.getTime() - arrivalTime.getTime()) / (1000 * 60)
    )

    layovers.push({
      destination_city: getCityName(current.arrival.airportCode),
      destination_code: current.arrival.airportCode,
      waiting_time: formatMinutesToHours(waitingMinutes),
    })
  }

  return layovers
}

function checkArrivalNextDay(
  departureDate: string,
  departureTime: string,
  arrivalDate: string
): boolean {
  const depDate = new Date(departureDate).toISOString().split("T")[0]
  const arrDate = new Date(arrivalDate).toISOString().split("T")[0]
  return depDate !== arrDate
}

export function transformFlight(flight: ApiFlight): any {
  const transformedLegs: TransformedFlightLeg[] = []

  flight.legs.forEach((leg, index) => {
    const option = leg.options[0] // Usar primera opción
    if (!option || !option.segments || option.segments.length === 0) return

    const firstSegment = option.segments[0]
    const lastSegment = option.segments[option.segments.length - 1]

    const isOutbound = index === 0
    const layovers = option.segments.length > 1 ? calculateLayovers(option.segments) : []

    // Verificar si llega al día siguiente
    const arrivalNextDay = checkArrivalNextDay(
      firstSegment.departure.date,
      firstSegment.departure.time,
      lastSegment.arrival.date
    )

    transformedLegs.push({
      departure: {
        city_code: firstSegment.departure.airportCode,
        city_name: getCityName(firstSegment.departure.airportCode),
        time: firstSegment.departure.time,
      },
      arrival: {
        city_code: lastSegment.arrival.airportCode,
        city_name: getCityName(lastSegment.arrival.airportCode),
        time: lastSegment.arrival.time,
      },
      duration: formatMinutesToHours(option.duration),
      flight_type: isOutbound ? "outbound" : "inbound",
      layovers: layovers.length > 0 ? layovers : undefined,
      arrival_next_day: arrivalNextDay,
      options: [
        {
          segments: option.segments.map((seg) => ({
            baggage: seg.baggage,
            carryOnBagInfo: seg.carryOnBagInfo,
          })),
        },
      ],
    })
  })

  // Preservar la clase de cabina para la cotización: el shape transformado de
  // los legs la descarta, así que la rescatamos del primer segmento (o del
  // nivel de vuelo si el proveedor la trae ahí).
  const firstSegment = flight.legs?.[0]?.options?.[0]?.segments?.[0]
  const cabinClass =
    (flight as any).cabin?.class ?? firstSegment?.cabinClass ?? null

  // Mayorista de origen: los vuelos hoy no siempre lo traen. Si el proveedor lo
  // envía (bajo cualquiera de estas claves), lo preservamos para la bandera de
  // la card. Si no viene, queda null y la bandera no se muestra.
  const provider =
    (flight as any).provider ??
    (flight as any).wholesaler ??
    (flight as any).mayorista ??
    null

  return {
    id: flight.id,
    airline: flight.airline,
    // Starling `TotalAmount` y Delfos `price.total` ya incluyen a todos los
    // pasajeros solicitados. Dejamos la base explícita para que ningún
    // consumidor vuelva a tratar el monto como precio unitario por pasajero.
    price: {
      ...flight.price,
      cost_basis: providerCostBasis(
        flight.price.cost_basis ?? flight.price.basis ?? flight.providerMeta?.priceBasis
      ),
      basis: "GROUP_TOTAL" as const,
    },
    adults: flight.adults,
    childrens: flight.children,
    children: flight.children,
    departure_date: flight.departure_date,
    return_date: flight.return_date,
    cabin_class: cabinClass,
    provider,
    baggage: (flight as any).baggage,
    refundable: (flight as any).refundable ?? null,
    offer_source: flight.offer_source,
    offer_refresh_fallback: flight.offer_refresh_fallback,
    legs: transformedLegs,
  }
}

export function transformFlights(flights: ApiFlight[]): any[] {
  return flights.map(transformFlight)
}

function canonicalDate(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return ""
  return value.split("T")[0]
}

function canonicalTime(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return ""
  const time = value.includes("T") ? value.split("T")[1] : value
  return time.slice(0, 5)
}

function canonicalPassengerCount(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback
}

function canonicalLayovers(segments: any[]): TransformedFlightLeg["layovers"] {
  if (segments.length < 2) return []
  return segments.slice(0, -1).map((segment, index) => {
    const next = segments[index + 1]
    const arrivalDate = segment?.arrival?.date
    const arrivalTime = segment?.arrival?.time
    const departureDate = next?.departure?.date
    const departureTime = next?.departure?.time
    const arrival = arrivalDate && arrivalTime ? new Date(`${arrivalDate}T${arrivalTime}`) : null
    const departure = departureDate && departureTime ? new Date(`${departureDate}T${departureTime}`) : null
    const waitingMinutes = arrival && departure && !Number.isNaN(arrival.getTime()) && !Number.isNaN(departure.getTime())
      ? Math.max(0, Math.round((departure.getTime() - arrival.getTime()) / 60_000))
      : null
    const code = segment?.arrival?.airport_code || segment?.arrival?.airportCode || ""

    return {
      destination_city: segment?.arrival?.city || getCityName(code),
      destination_code: code,
      waiting_time: waitingMinutes === null ? "" : formatMinutesToHours(waitingMinutes),
    }
  })
}

/** Convierte `emilia.flight-offer.v1` al view model histórico de las cards de Maxeva. */
export function transformCanonicalFlights(flights: any[], query: any = {}): any[] {
  return flights.map((flight) => {
    const rawLegs = Array.isArray(flight?.legs) ? flight.legs : []
    const transformedLegs = rawLegs.map((leg: any, index: number) => {
      const segments = Array.isArray(leg?.segments) ? leg.segments : []
      const firstSegment = segments[0]
      const lastSegment = segments[segments.length - 1]
      const departureCode = leg?.origin || firstSegment?.departure?.airport_code || ""
      const arrivalCode = leg?.destination || lastSegment?.arrival?.airport_code || ""
      const departureDate = firstSegment?.departure?.date || canonicalDate(leg?.departure_at)
      const arrivalDate = lastSegment?.arrival?.date || canonicalDate(leg?.arrival_at)
      const duration = typeof leg?.duration_minutes === "number"
        ? formatMinutesToHours(Math.max(0, Math.round(leg.duration_minutes)))
        : ""

      return {
        departure: {
          city_code: departureCode,
          city_name: firstSegment?.departure?.city || getCityName(departureCode),
          time: firstSegment?.departure?.time || canonicalTime(leg?.departure_at),
        },
        arrival: {
          city_code: arrivalCode,
          city_name: lastSegment?.arrival?.city || getCityName(arrivalCode),
          time: lastSegment?.arrival?.time || canonicalTime(leg?.arrival_at),
        },
        duration,
        flight_type: index === 0 ? "outbound" as const : "inbound" as const,
        stops: typeof leg?.stops === "number" ? Math.max(0, leg.stops) : Math.max(0, segments.length - 1),
        layovers: canonicalLayovers(segments),
        arrival_next_day: Boolean(departureDate && arrivalDate && departureDate !== arrivalDate),
        options: [{
          segments: [{
            ...(flight?.baggage?.checked === null || flight?.baggage?.checked === undefined
              ? {}
              : { baggage: flight.baggage.checked ? "1PC" : "0PC" }),
            ...(flight?.baggage?.carry_on === null || flight?.baggage?.carry_on === undefined
              ? {}
              : { carryOnBagInfo: { quantity: flight.baggage.carry_on ? "1" : "0" } }),
          }],
        }],
      }
    })
    const firstLeg = rawLegs[0]
    const returnLeg = rawLegs[1]

    return {
      id: flight.id,
      airline: {
        code: flight?.airline?.code || firstLeg?.segments?.[0]?.marketing_airline || "",
        name: flight?.airline?.name || flight?.airline?.code || "Aerolínea",
      },
      price: {
        amount: flight?.price?.amount,
        currency: flight?.price?.currency || "USD",
        basis: "GROUP_TOTAL" as const,
      },
      adults: canonicalPassengerCount(query?.adults, 1),
      childrens: canonicalPassengerCount(query?.children, 0),
      children: canonicalPassengerCount(query?.children, 0),
      infants: canonicalPassengerCount(query?.infants, 0),
      departure_date:
        query?.departureDate || canonicalDate(firstLeg?.departure_at) || firstLeg?.segments?.[0]?.departure?.date || "",
      return_date:
        query?.returnDate || canonicalDate(returnLeg?.departure_at) || returnLeg?.segments?.[0]?.departure?.date || null,
      cabin_class: flight?.cabin || firstLeg?.segments?.[0]?.cabin || null,
      provider: flight?.provider || null,
      legs: transformedLegs,
    }
  })
}

function truncateHotelPolicyFields(hotel: any): any {
  return {
    ...hotel,
    address:
      typeof hotel?.address === "string"
        ? truncateEurovipsAddress(hotel.address)
        : hotel?.address,
    policy_cancellation:
      typeof hotel?.policy_cancellation === "string"
        ? truncateEurovipsPolicy(hotel.policy_cancellation)
        : hotel?.policy_cancellation,
    policy_lodging:
      typeof hotel?.policy_lodging === "string"
        ? truncateEurovipsPolicy(hotel.policy_lodging)
        : hotel?.policy_lodging,
  }
}

export function sanitizeEmiliaMetaForStorage(meta: any): any {
  const hotels = meta?.combinedData?.hotels
  if (!Array.isArray(hotels)) {
    return meta
  }

  return {
    ...meta,
    combinedData: {
      ...meta.combinedData,
      hotels: hotels.map(truncateHotelPolicyFields),
    },
  }
}

export function transformHotels(hotels: any[]): any[] {
  // Los hoteles ya vienen en el formato correcto según la especificación
  // Solo agregamos occupancy_id si no existe
  return hotels.map((hotel) => {
    const safeHotel = truncateHotelPolicyFields(hotel)

    return {
      ...safeHotel,
      rooms: safeHotel.rooms?.map((room: any, idx: number) => ({
        ...room,
        cost_basis: providerCostBasis(room.cost_basis ?? room.price_basis ?? room.price?.basis),
        occupancy_id: room.occupancy_id || `room-${hotel.id}-${idx}`,
      })),
    }
  })
}

function canonicalNights(checkIn: string, checkOut: string, value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value
  if (!checkIn || !checkOut) return 0
  const start = new Date(`${checkIn}T00:00:00Z`)
  const end = new Date(`${checkOut}T00:00:00Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000))
}

/** Convierte `emilia.hotel-offer.v1` al view model cotizable de las cards de Maxeva. */
export function transformCanonicalHotels(hotels: any[], query: any = {}): any[] {
  return hotels.map((hotel) => {
    const checkIn = hotel?.stay?.check_in || query?.checkinDate || ""
    const checkOut = hotel?.stay?.check_out || query?.checkoutDate || ""
    const nights = canonicalNights(checkIn, checkOut, hotel?.stay?.nights)
    const rooms = (Array.isArray(hotel?.rooms) ? hotel.rooms : []).map((room: any, index: number) => {
      const totalPrice = room?.price?.amount
      const board = typeof room?.board === "string" ? room.board.trim() : ""
      const name = typeof room?.name === "string" && room.name.trim() ? room.name.trim() : "Habitación"
      return {
        type: name,
        description: [name, board].filter(Boolean).join(" · "),
        price_per_night: typeof totalPrice === "number" && nights > 0 ? totalPrice / nights : totalPrice,
        total_price: totalPrice,
        currency: room?.price?.currency || hotel?.minimum_price?.currency || "USD",
        // El contrato público no publica cupo numérico. `2` representa "consultar",
        // evitando prometer disponibilidad que el proveedor no expuso.
        availability: 2,
        occupancy_id: room?.id || `room-${hotel?.id || "hotel"}-${index}`,
        adults: canonicalPassengerCount(query?.adults, 1),
        children: canonicalPassengerCount(query?.children, 0),
        infants: canonicalPassengerCount(query?.infants, 0),
        policy_cancellation: room?.cancellation_policy || "",
        refundable: room?.refundable ?? null,
        free_cancellation: room?.free_cancellation ?? null,
        payment_at_property: room?.payment_at_property ?? null,
      }
    })

    return {
      id: hotel.id,
      unique_id: hotel.id,
      name: hotel.name,
      category: typeof hotel?.stars === "number" ? `${hotel.stars} estrellas` : "",
      city: hotel?.location?.city || query?.city || query?.destination || "",
      address: hotel?.location?.address || "",
      phone: "",
      images: Array.isArray(hotel?.images)
        ? [...new Set(hotel.images.filter((src: unknown): src is string => {
            if (typeof src !== "string") return false
            try { return ["https:", "http:"].includes(new URL(src).protocol) } catch { return false }
          }).map((src: string) => src.trim()))]
        : [],
      check_in: checkIn,
      check_out: checkOut,
      nights,
      rooms,
      policy_cancellation: rooms[0]?.policy_cancellation || "",
      policy_lodging: "",
      search_adults: canonicalPassengerCount(query?.adults, 1),
      search_children: canonicalPassengerCount(query?.children, 0),
      provider: hotel?.provider || "",
      amenities: Array.isArray(hotel?.amenities) ? hotel.amenities : [],
      accessibility: Array.isArray(hotel?.accessibility) ? hotel.accessibility : [],
      latitude: hotel?.location?.latitude ?? null,
      longitude: hotel?.location?.longitude ?? null,
    }
  })
}

