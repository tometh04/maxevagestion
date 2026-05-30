// lib/emilia/__tests__/quotation-mapper.test.ts
import {
  parseStars,
  normalizeFlightClass,
  deriveMealPlan,
  buildQuotationPayload,
  type EmiliaFlight,
  type EurovipsHotel,
  type GeneralData,
  type LeadInfo,
} from "../quotation-mapper"
import { transformFlights, transformHotels } from "../transformers"

describe("parseStars", () => {
  it.each([
    ["5 estrellas", 5],
    ["3 estrellas", 3],
    ["★★★★★", 5],
    ["★★★", 3],
    ["5 star", 5],
    ["5 stars", 5],
    ["5*", 5],
    ["Boutique", null],
    ["", null],
    [null, null],
    [undefined, null],
  ])("parsea '%s' como %s", (input, expected) => {
    expect(parseStars(input as any)).toBe(expected)
  })
})

describe("normalizeFlightClass", () => {
  it.each([
    ["ECONOMY", "ECONOMY"],
    ["Economy", "ECONOMY"],
    ["Económica", "ECONOMY"],
    ["Turista", "ECONOMY"],
    ["Premium Economy", "PREMIUM_ECONOMY"],
    ["BUSINESS", "BUSINESS"],
    ["Ejecutiva", "BUSINESS"],
    ["First", "FIRST"],
    ["Primera Clase", "FIRST"],
    ["Y", "ECONOMY"],
    ["J", "BUSINESS"],
    ["F", "FIRST"],
    ["W", "PREMIUM_ECONOMY"],
    ["", null],
    [null, null],
    [undefined, null],
  ])("normaliza '%s' → %s", (input, expected) => {
    expect(normalizeFlightClass(input as any)).toBe(expected)
  })

  it("devuelve el valor original en mayúsculas si no matchea", () => {
    expect(normalizeFlightClass("rara")).toBe("RARA")
  })
})

describe("deriveMealPlan", () => {
  it.each([
    ["All Inclusive con vista al mar", "ALL_INCLUSIVE"],
    ["ALL INCLUSIVE", "ALL_INCLUSIVE"],
    ["Todo Incluido", "ALL_INCLUSIVE"],
    ["Half Board", "MEDIA_PENSION"],
    ["Media Pensión", "MEDIA_PENSION"],
    ["Full Board", "PENSION_COMPLETA"],
    ["Pensión Completa", "PENSION_COMPLETA"],
    ["Bed and Breakfast", "DESAYUNO"],
    ["Desayuno incluido", "DESAYUNO"],
    ["Room Only", "SOLO_ALOJAMIENTO"],
    ["Solo alojamiento", "SOLO_ALOJAMIENTO"],
    ["Double Room", null],
    ["", null],
    [null, null],
  ])("deriva '%s' → %s", (input, expected) => {
    expect(deriveMealPlan(input as any)).toBe(expected)
  })
})

const lead: LeadInfo = {
  id: "lead-1",
  contact_name: "Juan",
  destination: "Punta Cana",
  region: "CARIBE",
  agency_id: "agency-1",
}

const general: GeneralData = {
  departureDate: "2026-07-01",
  returnDate: "2026-07-07",
  adults: 2,
  children: 0,
  infants: 0,
}

// Shape *transformado* (output de transformFlights) — es lo que realmente
// recibe el mapper desde las cards del chat.
function makeFlight(overrides: Partial<EmiliaFlight> = {}): EmiliaFlight {
  return {
    id: "f1",
    airline: { code: "AR", name: "Aerolíneas Argentinas" },
    price: { amount: 850, currency: "USD" },
    adults: 2,
    children: 0,
    childrens: 0,
    departure_date: "2026-07-01",
    return_date: "2026-07-07",
    cabin_class: "ECONOMY",
    legs: [
      {
        departure: { city_code: "EZE", city_name: "Buenos Aires", time: "10:00" },
        arrival: { city_code: "PUJ", city_name: "Punta Cana", time: "16:00" },
        duration: "8h 00m",
        flight_type: "outbound",
        layovers: [
          { destination_city: "Panamá", destination_code: "PTY", waiting_time: "2h 00m" },
        ],
        arrival_next_day: false,
      },
      {
        departure: { city_code: "PUJ", city_name: "Punta Cana", time: "18:00" },
        arrival: { city_code: "EZE", city_name: "Buenos Aires", time: "06:00" },
        duration: "8h 00m",
        flight_type: "inbound",
        arrival_next_day: true,
      },
    ],
    ...overrides,
  }
}

function makeHotel(overrides: Partial<EurovipsHotel> = {}): EurovipsHotel {
  return {
    id: "hotel_h1",
    unique_id: "h1",
    name: "Riu Palace",
    category: "5 estrellas",
    city: "Punta Cana",
    address: "Playa Bávaro s/n",
    phone: "+1-809-555-1111",
    images: ["https://img.example/riu1.jpg", "https://img.example/riu2.jpg"],
    check_in: "2026-07-01",
    check_out: "2026-07-07",
    nights: 6,
    rooms: [
      {
        type: "Doble Estándar",
        description: "All Inclusive con vista al mar",
        price_per_night: 200,
        total_price: 1200,
        currency: "USD",
        availability: 3,
        occupancy_id: "1",
        xml_occupancy_id: "OC-1",
        fare_id_broker: "FB-1",
        adults: 2,
      },
    ],
    policy_cancellation: "No reembolsable",
    policy_lodging: "Check-in 15hs",
    search_adults: 2,
    search_children: 0,
    provider: "EUROVIPS",
    ...overrides,
  }
}

describe("buildQuotationPayload", () => {
  it("1 vuelo + 3 hoteles → 3 opciones, cada una con copia del vuelo", () => {
    const hotelA = makeHotel({ id: "hotel_a", unique_id: "a", name: "Riu" })
    const hotelB = makeHotel({ id: "hotel_b", unique_id: "b", name: "Iberostar" })
    const hotelC = makeHotel({ id: "hotel_c", unique_id: "c", name: "Hilton" })

    const payload = buildQuotationPayload({
      lead,
      selectedFlight: makeFlight(),
      selectedHotels: [
        { hotel: hotelA, roomIndex: 0 },
        { hotel: hotelB, roomIndex: 0 },
        { hotel: hotelC, roomIndex: 0 },
      ],
      generalData: general,
    })

    expect(payload.lead_id).toBe("lead-1")
    expect(payload.agency_id).toBe("agency-1")
    expect(payload.options).toHaveLength(3)
    for (const opt of payload.options) {
      const flightItem = opt.items.find(i => i.item_type === "FLIGHT")
      expect(flightItem).toBeDefined()
      expect(flightItem!.airline).toBe("Aerolíneas Argentinas")
      expect(flightItem!.flight_route).toBe("EZE - PUJ")
      expect(flightItem!.flight_stops).toBe(1)
      expect(flightItem!.flight_class).toBe("ECONOMY")
      expect(flightItem!.generates_commission).toBe(true)
      expect(flightItem!.cost_amount).toBe(0)
      expect(flightItem!.operator_id).toBeNull()
      expect(flightItem!.admin_fee_percentage).toBe(0)
    }
    expect(payload.options[0].items.find(i => i.item_type === "HOTEL")!.hotel_name).toBe("Riu")
    expect(payload.options[1].items.find(i => i.item_type === "HOTEL")!.hotel_name).toBe("Iberostar")
    expect(payload.options[2].items.find(i => i.item_type === "HOTEL")!.hotel_name).toBe("Hilton")
  })

  it("0 vuelos + 2 hoteles → 2 opciones sin vuelo", () => {
    const payload = buildQuotationPayload({
      lead,
      selectedFlight: null,
      selectedHotels: [
        { hotel: makeHotel(), roomIndex: 0 },
        { hotel: makeHotel({ id: "hotel_h2", unique_id: "h2", name: "Otro" }), roomIndex: 0 },
      ],
      generalData: general,
    })
    expect(payload.options).toHaveLength(2)
    for (const opt of payload.options) {
      expect(opt.items.find(i => i.item_type === "FLIGHT")).toBeUndefined()
    }
  })

  it("1 vuelo + 0 hoteles → 1 opción con solo vuelo", () => {
    const payload = buildQuotationPayload({
      lead,
      selectedFlight: makeFlight(),
      selectedHotels: [],
      generalData: general,
    })
    expect(payload.options).toHaveLength(1)
    expect(payload.options[0].items).toHaveLength(1)
    expect(payload.options[0].items[0].item_type).toBe("FLIGHT")
  })

  it("vuelo: quantity = adultos + niños (honra `childrens` del transformer)", () => {
    const payload = buildQuotationPayload({
      lead,
      selectedFlight: makeFlight({ adults: 2, children: undefined, childrens: 1 }),
      selectedHotels: [],
      generalData: general,
    })
    expect(payload.options[0].items[0].quantity).toBe(3)
  })

  it("vuelo: sin escalas → flight_stops = 0 y ruta desde el leg de ida", () => {
    const payload = buildQuotationPayload({
      lead,
      selectedFlight: makeFlight({
        legs: [
          {
            departure: { city_code: "EZE", city_name: "Buenos Aires", time: "10:00" },
            arrival: { city_code: "MIA", city_name: "Miami", time: "20:00" },
            duration: "9h 00m",
            flight_type: "outbound",
          },
        ],
      }),
      selectedHotels: [],
      generalData: general,
    })
    const flightItem = payload.options[0].items[0]
    expect(flightItem.flight_route).toBe("EZE - MIA")
    expect(flightItem.flight_stops).toBe(0)
  })

  it("hotel: mapea total_price desde el room seleccionado", () => {
    const hotel = makeHotel({
      rooms: [
        { type: "A", description: "", price_per_night: 100, total_price: 600, currency: "USD", availability: 1, occupancy_id: "1" },
        { type: "B", description: "", price_per_night: 200, total_price: 1200, currency: "USD", availability: 1, occupancy_id: "2" },
      ],
    })
    const payload = buildQuotationPayload({
      lead,
      selectedFlight: null,
      selectedHotels: [{ hotel, roomIndex: 1 }],
      generalData: general,
    })
    const hotelItem = payload.options[0].items[0]
    expect(hotelItem.unit_price).toBe(1200)
    expect(hotelItem.room_type).toBe("B")
  })

  it("vuelo: arma description legible con aerolínea, ruta y escalas", () => {
    const payload = buildQuotationPayload({
      lead,
      selectedFlight: makeFlight(),
      selectedHotels: [],
      generalData: general,
    })
    expect(payload.options[0].items[0].description).toBe(
      "Aerolíneas Argentinas · EZE - PUJ · 1 escala"
    )
    expect(payload.options[0].items[0].flight_class).toBe("ECONOMY")
  })

  it("hotel: rellena meal_plan y description desde la habitación", () => {
    const hotel = makeHotel({
      rooms: [
        {
          type: "Doble Superior",
          description: "All Inclusive con vista al mar",
          price_per_night: 200,
          total_price: 1200,
          currency: "USD",
          availability: 3,
          occupancy_id: "1",
        },
      ],
    })
    const payload = buildQuotationPayload({
      lead,
      selectedFlight: null,
      selectedHotels: [{ hotel, roomIndex: 0 }],
      generalData: general,
    })
    const hotelItem = payload.options[0].items[0]
    expect(hotelItem.meal_plan).toBe("ALL_INCLUSIVE")
    expect(hotelItem.description).toBe("All Inclusive con vista al mar")
    expect(hotelItem.room_type).toBe("Doble Superior")
  })

  it("hotel: parsea stars desde category", () => {
    const hotel = makeHotel({ category: "★★★★★" })
    const payload = buildQuotationPayload({
      lead,
      selectedFlight: null,
      selectedHotels: [{ hotel, roomIndex: 0 }],
      generalData: general,
    })
    expect(payload.options[0].items[0].hotel_stars).toBe(5)
  })

  it("hotel: usa images[0] como photo_url, null si vacío", () => {
    const hotel = makeHotel({ images: [] })
    const payload = buildQuotationPayload({
      lead,
      selectedFlight: null,
      selectedHotels: [{ hotel, roomIndex: 0 }],
      generalData: general,
    })
    expect(payload.options[0].items[0].hotel_photo_url).toBeNull()
  })

  it("defaults: currency USD, pricing_mode PER_PERSON, payment_methods []", () => {
    const payload = buildQuotationPayload({
      lead,
      selectedFlight: makeFlight(),
      selectedHotels: [{ hotel: makeHotel(), roomIndex: 0 }],
      generalData: general,
    })
    expect(payload.currency).toBe("USD")
    expect(payload.pricing_mode).toBe("PER_PERSON")
    expect(payload.payment_methods).toEqual([])
  })

  it("lanza si generalData no tiene departureDate", () => {
    expect(() =>
      buildQuotationPayload({
        lead,
        selectedFlight: makeFlight(),
        selectedHotels: [],
        generalData: { ...general, departureDate: "" },
      })
    ).toThrow("Faltan fechas")
  })

  it("lanza si no hay ni vuelo ni hoteles", () => {
    expect(() =>
      buildQuotationPayload({
        lead,
        selectedFlight: null,
        selectedHotels: [],
        generalData: general,
      })
    ).toThrow("Seleccioná al menos un vuelo o un hotel")
  })

  it("clampea más de 4 hoteles (defensa adicional al límite del UI)", () => {
    const hotels = Array.from({ length: 6 }, (_, i) =>
      ({ hotel: makeHotel({ id: `h${i}`, unique_id: `${i}`, name: `H${i}` }), roomIndex: 0 })
    )
    const payload = buildQuotationPayload({
      lead,
      selectedFlight: null,
      selectedHotels: hotels,
      generalData: general,
    })
    expect(payload.options).toHaveLength(4)
  })
})

// =============================================================================
// Integración: cadena real de producción (raw de Emilia → transformers →
// buildQuotationPayload). Prueba que el shape que realmente entregan los
// transformers se mapea completo, no solo el shape mockeado a mano.
// =============================================================================
describe("integración raw → transformers → buildQuotationPayload", () => {
  // Shape crudo tal como lo entrega la API de Emilia (lo que recibe transformFlights).
  const rawFlight = {
    id: "f-raw-1",
    airline: { code: "AA", name: "American Airlines" },
    price: { amount: 1320.5, currency: "USD" },
    adults: 2,
    children: 1,
    departure_date: "2026-07-01",
    return_date: "2026-07-15",
    cabin: { class: "BUSINESS", brandName: "Business" },
    legs: [
      {
        legNumber: 1,
        options: [
          {
            optionId: "o1",
            duration: 720,
            segments: [
              {
                airline: "AA",
                flightNumber: 900,
                departure: { airportCode: "EZE", date: "2026-07-01", time: "22:00" },
                arrival: { airportCode: "MIA", date: "2026-07-02", time: "06:00" },
                duration: 540,
                cabinClass: "J",
                baggage: "2",
              },
              {
                airline: "AA",
                flightNumber: 200,
                departure: { airportCode: "MIA", date: "2026-07-02", time: "09:00" },
                arrival: { airportCode: "JFK", date: "2026-07-02", time: "12:00" },
                duration: 180,
                cabinClass: "J",
                baggage: "2",
              },
            ],
          },
        ],
      },
    ],
  }

  const rawHotel = {
    id: "hotel_riu",
    unique_id: "riu",
    name: "Riu Plaza",
    category: "4 estrellas",
    city: "Nueva York",
    address: "145 W 47th St",
    phone: "+1-212-555-0000",
    images: ["https://img/riu.jpg"],
    check_in: "2026-07-02",
    check_out: "2026-07-15",
    nights: 13,
    provider: "EUROVIPS",
    search_adults: 2,
    search_children: 1,
    rooms: [
      {
        type: "Standard",
        description: "Room Only",
        price_per_night: 150,
        total_price: 1950,
        currency: "USD",
        availability: 5,
        occupancy_id: "occ-standard",
      },
      {
        type: "Deluxe",
        description: "Breakfast included",
        price_per_night: 220,
        total_price: 2860,
        currency: "USD",
        availability: 3,
        occupancy_id: "occ-deluxe",
      },
    ],
  }

  it("vuelo: ruta, clase, escalas y description salen completos tras transformar", () => {
    const [flight] = transformFlights([rawFlight as any]) as EmiliaFlight[]
    const payload = buildQuotationPayload({
      lead,
      selectedFlight: flight,
      selectedHotels: [],
      generalData: general,
    })
    const item = payload.options[0].items[0]
    expect(item.airline).toBe("American Airlines")
    expect(item.flight_route).toBe("EZE - JFK")
    expect(item.flight_stops).toBe(1) // 2 segmentos → 1 escala (MIA)
    expect(item.flight_class).toBe("BUSINESS")
    expect(item.quantity).toBe(3) // 2 adultos + 1 niño (childrens del transformer)
    expect(item.unit_price).toBe(1320.5)
    expect(item.description).toBe("American Airlines · EZE - JFK · 1 escala")
  })

  it("hotel: room elegida (occupancy_id) mapea precio, tipo y meal_plan correctos", () => {
    const [hotel] = transformHotels([rawHotel as any]) as EurovipsHotel[]
    // Simula la resolución de índice por occupancy_id que hace el chat.
    const roomIndex = hotel.rooms.findIndex(r => r.occupancy_id === "occ-deluxe")
    const payload = buildQuotationPayload({
      lead,
      selectedFlight: null,
      selectedHotels: [{ hotel, roomIndex }],
      generalData: general,
    })
    const item = payload.options[0].items[0]
    expect(item.hotel_name).toBe("Riu Plaza")
    expect(item.hotel_stars).toBe(4)
    expect(item.room_type).toBe("Deluxe")
    expect(item.unit_price).toBe(2860)
    expect(item.meal_plan).toBe("DESAYUNO")
    expect(item.description).toBe("Breakfast included")
    expect(item.destination_city).toBe("Nueva York")
    expect(item.nights).toBe(13)
    expect(item.checkin_date).toBe("2026-07-02")
    expect(item.checkout_date).toBe("2026-07-15")
  })
})
