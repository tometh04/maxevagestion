import { buildQuotationPayload } from "@/lib/emilia/quotation-mapper"
import { canonicalOfferCards } from "@/lib/emilia/turn-result"

function terminalResult() {
  return {
    outcome: {
      results: {
        result_sets: [
          {
            artifact_id: "11111111-1111-4111-8111-111111111111",
            product: "flights",
            query: { origin: "EZE", destination: "MAD", departureDate: "2026-09-01", adults: 2 },
            data: [{
              schema_version: "emilia.flight-offer.v1",
              id: "flight-1",
              provider: "STARLING",
              airline: { code: "IB", name: "Iberia" },
              price: { amount: 950, currency: "USD", basis: "COMMISSIONABLE_GROSS" },
              cabin: "Y",
              refundable: false,
              baggage: { carry_on: false, checked: true },
              legs: [{
                origin: "EZE",
                destination: "MAD",
                departure_at: "2026-09-01T12:00:00-03:00",
                arrival_at: "2026-09-02T05:00:00+02:00",
                duration_minutes: 720,
                stops: 0,
                segments: [{
                  marketing_airline: "IB",
                  operating_airline: "IB",
                  flight_number: "6844",
                  departure: { airport_code: "EZE", city: "Buenos Aires", date: "2026-09-01", time: "12:00" },
                  arrival: { airport_code: "MAD", city: "Madrid", date: "2026-09-02", time: "05:00" },
                  duration_minutes: 720,
                  cabin: "Y",
                }],
              }],
            }],
          },
          {
            artifact_id: "22222222-2222-4222-8222-222222222222",
            product: "hotels",
            query: { city: "Madrid", checkinDate: "2026-09-01", checkoutDate: "2026-09-04", adults: 2 },
            data: [{
              schema_version: "emilia.hotel-offer.v1",
              id: "hotel-1",
              provider: "EUROVIPS",
              name: "Hotel Central",
              stars: 4,
              location: { city: "Madrid", address: "Gran Vía 1", latitude: null, longitude: null },
              stay: { check_in: null, check_out: null, nights: null },
              minimum_price: { amount: 600, currency: "USD", basis: "COMMISSIONABLE_GROSS" },
              amenities: [],
              accessibility: [],
              rooms: [{
                id: "room-1",
                name: "Double room",
                board: "Breakfast",
                price: { amount: 600, currency: "USD", basis: "COMMISSIONABLE_GROSS" },
                refundable: true,
                free_cancellation: true,
                payment_at_property: false,
                cancellation_policy: "Free cancellation",
              }],
            }],
          },
        ],
      },
    },
  }
}

describe("canonicalOfferCards", () => {
  it("preserva precio, identidad pública, fuente y fallback hasta la cotización", () => {
    const cards = canonicalOfferCards(terminalResult())
    expect(cards.flights).toHaveLength(1)
    expect(cards.hotels).toHaveLength(1)
    expect(cards.flights![0]).toMatchObject({
      provider: "STARLING",
      price: { amount: 950, currency: "USD", cost_basis: "COMMISSIONABLE_GROSS" },
      departure_date: "2026-09-01",
      offer_source: {
        artifact_id: "11111111-1111-4111-8111-111111111111",
        product: "flights",
        offer_id: "flight-1",
      },
      offer_refresh_fallback: {
        product: "flights",
        identity: {
          checked_baggage: true,
          carry_on: false,
          refundable: false,
        },
      },
      legs: [{
        departure: { city_code: "EZE", time: "12:00" },
        arrival: { city_code: "MAD", time: "05:00" },
        baggage: { carry_on: false, checked: true },
        arrival_next_day: true,
      }],
    })
    expect(cards.hotels![0]).toMatchObject({
      provider: "EUROVIPS",
      check_in: "2026-09-01",
      check_out: "2026-09-04",
      nights: 3,
      rooms: [{
        id: "room-1",
        total_price: 600,
        cost_basis: "COMMISSIONABLE_GROSS",
        availability: 2,
        offer_source: {
          artifact_id: "22222222-2222-4222-8222-222222222222",
          product: "hotels",
          offer_id: "hotel-1",
          selection_id: "room-1",
        },
        offer_refresh_fallback: { product: "hotels" },
      }],
    })

    const payload = buildQuotationPayload({
      lead: {
        id: "33333333-3333-4333-8333-333333333333",
        contact_name: "Ada",
        destination: "Madrid",
        region: "EUROPA",
        agency_id: "44444444-4444-4444-8444-444444444444",
      },
      selectedFlight: cards.flights![0] as any,
      selectedHotels: [{ hotel: cards.hotels![0] as any, roomIndex: 0 }],
      generalData: {
        departureDate: "2026-09-01",
        returnDate: "2026-09-04",
        adults: 2,
        children: 0,
        infants: 0,
      },
    })
    expect(payload.currency).toBe("USD")
    expect(payload.options[0].items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        item_type: "FLIGHT",
        provider: "STARLING",
        cost_amount: 950,
        cost_basis: "COMMISSIONABLE_GROSS",
        cost_calculation_mode: "COMMISSIONABLE",
        flight_route: "EZE - MAD",
        offer_source: expect.objectContaining({ offer_id: "flight-1" }),
        offer_refresh_fallback: expect.objectContaining({ product: "flights" }),
      }),
      expect.objectContaining({
        item_type: "HOTEL",
        provider: "EUROVIPS",
        cost_amount: 600,
        cost_basis: "COMMISSIONABLE_GROSS",
        cost_calculation_mode: "COMMISSIONABLE",
        offer_source: expect.objectContaining({ selection_id: "room-1" }),
        offer_refresh_fallback: expect.objectContaining({ product: "hotels" }),
      }),
    ]))
  })

  it("rechaza importes canónicos inválidos y no suma monedas sin FX", () => {
    const invalid = terminalResult()
    ;(invalid.outcome.results.result_sets[0].data[0] as any).price.amount = null
    expect(canonicalOfferCards(invalid).flights).toEqual([])

    const mixed = terminalResult()
    ;(mixed.outcome.results.result_sets[1].data[0] as any).rooms[0].price.currency = "EUR"
    const cards = canonicalOfferCards(mixed)
    expect(() => buildQuotationPayload({
      lead: {
        id: "33333333-3333-4333-8333-333333333333",
        contact_name: "Ada",
        destination: "Madrid",
        region: "EUROPA",
        agency_id: "44444444-4444-4444-8444-444444444444",
      },
      selectedFlight: cards.flights![0] as any,
      selectedHotels: [{ hotel: cards.hotels![0] as any, roomIndex: 0 }],
      generalData: { departureDate: "2026-09-01", returnDate: "2026-09-04", adults: 2, children: 0, infants: 0 },
    })).toThrow("monedas distintas")
  })
})
