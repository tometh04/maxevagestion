import {
  filterFlights,
  filterHotels,
  getFlightFilterOptions,
  getHotelFilterOptions,
  normalizeHotelCategory,
  type FlightFilters,
  type HotelFilters,
} from "../result-filters"
import type { EmiliaFlight, EurovipsHotel } from "../quotation-mapper"

function makeFlight(overrides: Partial<EmiliaFlight> & { provider?: string; stops?: number } = {}): EmiliaFlight {
  return {
    id: "flight-1",
    airline: { code: "AR", name: "Aerolíneas Argentinas" },
    price: { amount: 900, currency: "USD" },
    adults: 2,
    children: 0,
    departure_date: "2026-08-20",
    return_date: "2026-08-27",
    cabin_class: "ECONOMY",
    legs: [
      {
        departure: { city_code: "EZE", city_name: "Buenos Aires", time: "10:00" },
        arrival: { city_code: "PUJ", city_name: "Punta Cana", time: "17:00" },
        duration: "8h 00m",
        flight_type: "outbound",
      },
    ],
    ...overrides,
  } as EmiliaFlight
}

function makeHotel(overrides: Partial<EurovipsHotel> = {}): EurovipsHotel {
  return {
    id: "hotel-1",
    unique_id: "hotel-1",
    name: "Riu Palace",
    category: "5EST",
    city: "PUNTA CANA",
    address: "Playa Bavaro",
    phone: "+1 555",
    images: [],
    check_in: "2026-09-10",
    check_out: "2026-09-17",
    nights: 7,
    rooms: [
      {
        type: "SGL",
        description: "SUPERIOR / ALL INCLUSIVE",
        price_per_night: 200,
        total_price: 1400,
        currency: "USD",
        availability: 3,
        occupancy_id: "room-1",
      },
    ],
    policy_cancellation: "",
    policy_lodging: "",
    search_adults: 2,
    search_children: 0,
    provider: "EUROVIPS",
    ...overrides,
  }
}

describe("filterFlights", () => {
  const flights = [
    makeFlight({ id: "direct", price: { amount: 800, currency: "USD" }, provider: "STARLING" } as any),
    makeFlight({
      id: "one-stop",
      airline: { code: "AA", name: "American Airlines" },
      price: { amount: 1200, currency: "USD" },
      provider: "STARLING",
      legs: [
        {
          departure: { city_code: "EZE", city_name: "Buenos Aires", time: "10:00" },
          arrival: { city_code: "PUJ", city_name: "Punta Cana", time: "18:00" },
          duration: "10h 00m",
          flight_type: "outbound",
          layovers: [{ destination_city: "Panama", destination_code: "PTY", waiting_time: "2h 00m" }],
        },
      ],
    } as any),
    makeFlight({
      id: "two-stop",
      airline: { code: "LA", name: "LATAM" },
      price: { amount: 1600, currency: "USD" },
      provider: "OTHER",
      stops: 2,
    } as any),
  ]

  it("filtra por precio máximo, escalas, aerolínea y proveedor", () => {
    const filters: FlightFilters = {
      maxPrice: 1300,
      stops: "one",
      airline: "American Airlines",
      provider: "STARLING",
    }

    expect(filterFlights(flights, filters).map((flight) => flight.id)).toEqual(["one-stop"])
  })

  it("conserva el vuelo seleccionado al inicio aunque no coincida con el filtro", () => {
    const result = filterFlights(flights, { maxPrice: 900 }, "two-stop")

    expect(result.map((flight) => flight.id)).toEqual(["two-stop", "direct"])
  })

  it("deriva opciones y rango desde los vuelos recibidos", () => {
    const options = getFlightFilterOptions(flights)

    expect(options.price).toEqual({ min: 800, max: 1600 })
    expect(options.providers.map((option) => option.value)).toEqual(["OTHER", "STARLING"])
    expect(options.stops).toEqual(["direct", "one", "two_plus"])
  })
})

describe("filterHotels", () => {
  const hotels = [
    makeHotel({
      id: "all-inclusive",
      category: "5EST",
      rooms: [
        {
          type: "SGL",
          description: "SUPERIOR / ALL INCLUSIVE",
          price_per_night: 200,
          total_price: 1400,
          currency: "USD",
          availability: 3,
          occupancy_id: "ai-basic",
        },
        {
          type: "SGL",
          description: "SUITE KING SIZE BED / ALL INCLUSIVE",
          price_per_night: 300,
          total_price: 2100,
          currency: "USD",
          availability: 3,
          occupancy_id: "ai-suite",
        },
      ],
    }),
    makeHotel({
      id: "breakfast",
      name: "Hotel Breakfast",
      category: "4EST",
      provider: "EUROVIPS",
      rooms: [
        {
          type: "DBL",
          description: "Standard Room / Breakfast included",
          price_per_night: 150,
          total_price: 1050,
          currency: "USD",
          availability: 3,
          occupancy_id: "breakfast-room",
        },
      ],
    }),
  ]

  it("normaliza categorías reales de Emilia", () => {
    expect(normalizeHotelCategory("4EST")).toBe("4")
    expect(normalizeHotelCategory("5LL")).toBe("5")
    expect(normalizeHotelCategory("H4_5")).toBe("4.5")
    expect(normalizeHotelCategory("★★★★★")).toBe("5")
  })

  it("filtra hoteles por categoría, régimen, proveedor y precio de habitación", () => {
    const filters: HotelFilters = {
      category: "5",
      mealPlan: "ALL_INCLUSIVE",
      provider: "EUROVIPS",
      maxRoomTotal: 1500,
    }

    const result = filterHotels(hotels, filters)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("all-inclusive")
    expect(result[0].rooms.map((room) => room.occupancy_id)).toEqual(["ai-basic"])
  })

  it("conserva el hotel y la habitación seleccionada aunque el filtro la oculte", () => {
    const selected = new Map([["all-inclusive", "ai-suite"]])
    const result = filterHotels(hotels, { maxRoomTotal: 1500 }, selected)

    expect(result[0].id).toBe("all-inclusive")
    expect(result[0].rooms.map((room) => room.occupancy_id)).toEqual(["ai-suite", "ai-basic"])
  })

  it("conserva un hotel seleccionado aunque no coincida con filtros de hotel", () => {
    const selected = new Map([["breakfast", "breakfast-room"]])
    const result = filterHotels(hotels, { category: "5" }, selected)

    expect(result[0].id).toBe("breakfast")
    expect(result[0].rooms.map((room) => room.occupancy_id)).toEqual(["breakfast-room"])
  })

  it("deriva opciones y rango desde habitaciones", () => {
    const options = getHotelFilterOptions(hotels)

    expect(options.roomTotal).toEqual({ min: 1050, max: 2100 })
    expect(options.categories.map((option) => option.value)).toEqual(["4", "5"])
    expect(options.mealPlans.map((option) => option.value)).toEqual(["ALL_INCLUSIVE", "DESAYUNO"])
    expect(options.providers.map((option) => option.value)).toEqual(["EUROVIPS"])
  })
})
