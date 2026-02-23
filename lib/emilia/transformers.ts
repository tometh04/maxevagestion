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
  }
  adults: number
  children: number
  departure_date: string
  return_date?: string
  legs: ApiFlightLeg[]
  duration?: {
    formatted: string
  }
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

  return {
    id: flight.id,
    airline: flight.airline,
    price: flight.price,
    adults: flight.adults,
    childrens: flight.children,
    departure_date: flight.departure_date,
    return_date: flight.return_date,
    legs: transformedLegs,
  }
}

export function transformFlights(flights: ApiFlight[]): any[] {
  return flights.map(transformFlight)
}

export function transformHotels(hotels: any[]): any[] {
  // Los hoteles ya vienen en el formato correcto según la especificación
  // Solo agregamos occupancy_id si no existe
  return hotels.map((hotel) => ({
    ...hotel,
    rooms: hotel.rooms?.map((room: any, idx: number) => ({
      ...room,
      occupancy_id: room.occupancy_id || `room-${hotel.id}-${idx}`,
    })),
  }))
}

