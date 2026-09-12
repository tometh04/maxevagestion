import fixture from "../fixtures/hotel-details.synthetic.json"
import { transformCanonicalHotels, transformHotels, sanitizeEmiliaMetaForStorage } from "../transformers"
import { filterHotels, getHotelFilterOptions } from "../result-filters"
import { buildQuotationPayload, type EurovipsHotel } from "../quotation-mapper"

const [hotel] = transformCanonicalHotels([fixture], { adults: 2, children: 1 }) as EurovipsHotel[]

it("preserves room content while rejecting unsafe room photos and never copying hotel photos", () => {
  const extended = { ...fixture, room_conditions: "Cuna bajo petición", observations: "Piscina en mantenimiento", rooms: [{ ...fixture.rooms[0],
    images: ["https://images.example.com/room.jpg", "javascript:alert(1)", "https://user:secret@example.com/room.jpg", "https://images.example.com/room.jpg"],
    promotion: "Oferta anticipada", cancellation_deadline: "2027-01-03",
    nightly_prices: [{ date: "2027-01-10", price: { amount: 200, currency: "USD" } }],
    cancellation_terms: [{ from_date: "2027-01-04", penalty: { amount: 150, currency: "USD" } }],
  }] }
  const [result] = transformCanonicalHotels([extended]) as EurovipsHotel[]
  expect(result).toMatchObject({ room_conditions: extended.room_conditions, observations: extended.observations })
  expect(result.rooms[0]).toMatchObject({ images: [extended.rooms[0].images[0]], promotion: extended.rooms[0].promotion,
    cancellation_deadline: extended.rooms[0].cancellation_deadline, nightly_prices: extended.rooms[0].nightly_prices, cancellation_terms: extended.rooms[0].cancellation_terms })
  expect(sanitizeEmiliaMetaForStorage({ combinedData: { hotels: [result] } }).combinedData.hotels[0].rooms[0]).toEqual(result.rooms[0])
  expect(transformCanonicalHotels([{ ...fixture, rooms: [{ ...fixture.rooms[0], images: undefined }] }])[0].rooms[0].images).toEqual([])
})

it("preserves the tested Emilia API fixture through CRM transformation and persistence", () => {
  expect(hotel).toMatchObject({ phone: fixture.phone, website: fixture.website, description: fixture.description,
    policy_lodging: fixture.lodging_policy, policy_cancellation: fixture.cancellation_policy, expires_at: fixture.expires_at,
    room_conditions: fixture.room_conditions, observations: fixture.observations })
  expect(hotel.rooms[0]).toMatchObject({ occupancy_id: fixture.rooms[0].id, description: fixture.rooms[0].description,
    adults: 2, children: 1, infants: 0, price_per_night: 200, total_price: 1000, availability: 3,
    board_description: "Todo incluido", amenities: fixture.rooms[0].amenities, price_breakdown: fixture.rooms[0].price_breakdown,
    images: fixture.rooms[0].images, promotion: fixture.rooms[0].promotion, nightly_prices: fixture.rooms[0].nightly_prices,
    cancellation_deadline: fixture.rooms[0].cancellation_deadline, cancellation_terms: fixture.rooms[0].cancellation_terms,
    room_type_code: "DBL", rate_plan_code: "GENERAL", refundable: false, free_cancellation: false, payment_at_property: false })
  const longText = "Política completa. ".repeat(100)
  const legacy = { ...hotel, address: longText, policy_cancellation: longText, policy_lodging: longText }
  expect(transformHotels([legacy])[0]).toMatchObject(legacy)
  expect(sanitizeEmiliaMetaForStorage({ combinedData: { hotels: [legacy] } }).combinedData.hotels[0]).toEqual(legacy)
})

it("filters accents, actual meal plans, currency, confirmed cancellation and availability", () => {
  const hotels = [{ ...hotel, name: "Cancún Resort" }]
  expect(filterHotels(hotels, { name: "  cancun ", mealPlan: "ALL_INCLUSIVE", currency: "USD", availableOnly: true })).toHaveLength(1)
  expect(filterHotels(hotels, { currency: "ARS" })).toEqual([])
  expect(filterHotels(hotels, { freeCancellation: true })).toEqual([])
  expect(filterHotels([{ ...hotel, rooms: [{ ...hotel.rooms[0], total_price: NaN }] }], { maxRoomTotal: 2000 })).toEqual([])
  expect(getHotelFilterOptions(hotels).mealPlans).toEqual([{ value: "ALL_INCLUSIVE", label: "All inclusive" }])
  const unknown = { ...hotel, rooms: [{ ...hotel.rooms[0], free_cancellation: null, availability: undefined as unknown as number }] }
  expect(filterHotels([unknown], { availableOnly: true })).toEqual([])
  expect(filterHotels([unknown], { freeCancellation: true })).toEqual([])
})

it("keeps the selected tariff outside filters without modifying original rooms", () => {
  const second = { ...hotel.rooms[0], occupancy_id: "refundable-room", total_price: 1500, free_cancellation: true }
  const source = { ...hotel, rooms: [...hotel.rooms, second] }
  const filtered = filterHotels([source], { freeCancellation: true }, new Map([[hotel.id, hotel.rooms[0].occupancy_id]]))
  expect(filtered[0].rooms.map(room => room.occupancy_id)).toEqual([hotel.rooms[0].occupancy_id, second.occupancy_id])
  expect(source.rooms).toHaveLength(2)
  const quote = buildQuotationPayload({ lead: { id: "lead", contact_name: "Prueba", destination: "Cancún", region: null, agency_id: "agency" },
    selectedFlights: [], selectedHotels: [{ hotel: source, roomIndex: 1 }], generalData: { departureDate: source.check_in, returnDate: source.check_out, adults: 2, children: 1, infants: 0 } })
  expect(quote.options[0].total_amount).toBe(1500)
  expect(quote.options[0].items[0].meal_plan).toBe("ALL_INCLUSIVE")
})
