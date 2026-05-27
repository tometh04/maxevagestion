// lib/emilia/__tests__/quotation-mapper.test.ts
import {
  parseStars,
  buildQuotationPayload,
  type EmiliaFlight,
  type EurovipsHotel,
  type GeneralData,
  type LeadInfo,
} from "../quotation-mapper"

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

function makeFlight(overrides: Partial<EmiliaFlight> = {}): EmiliaFlight {
  return {
    id: "f1",
    airline: { code: "AR", name: "Aerolíneas Argentinas" },
    price: { amount: 850, currency: "USD", netAmount: 700, taxAmount: 150, fareAmount: 700 },
    adults: 2,
    children: 0,
    departure_date: "2026-07-01",
    departure_time: "10:00",
    arrival_date: "2026-07-01",
    arrival_time: "16:00",
    return_date: "2026-07-07",
    trip_type: "round_trip",
    duration: { total: 360, formatted: "6h 0m" },
    stops: { count: 1, direct: false, connections: 1 },
    baggage: { included: true, details: "23kg", quantity: 1 },
    cabin: { class: "ECONOMY", brandName: "Economy Light" },
    booking: { validatingCarrier: "AR", lastTicketingDate: "2026-06-25", fareType: "PUB" },
    legs: [{
      legNumber: 1,
      options: [{
        optionId: "o1",
        duration: 360,
        segments: [{
          airline: "AR",
          flightNumber: "1304",
          departure: { airportCode: "EZE", date: "2026-07-01", time: "10:00" },
          arrival: { airportCode: "PUJ", date: "2026-07-01", time: "16:00" },
          duration: 360,
          cabinClass: "Y",
          baggage: "23kg",
        }],
      }],
    }],
    provider: "TVC",
    transactionId: "tx-1",
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
