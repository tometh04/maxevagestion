import { normalizeEmiliaTurnPayload, normalizeEmiliaProgress } from "../turn-result"
import { buildQuotationPayload, type EurovipsHotel } from "../quotation-mapper"
import { selectHotelForStay } from "../hotel-stays"

const segments = [
  { id: "coast", checkinDate: "2027-03-10", checkoutDate: "2027-03-14", adults: 3, destinationOptions: [
    { id: "porto", location: { name: "Porto de Galinhas", countryCode: "BR" } },
    { id: "maragogi", location: { name: "Maragogi", countryCode: "BR" } },
  ] },
  { id: "buzios", city: "Buzios", countryCode: "BR", checkinDate: "2027-03-14", checkoutDate: "2027-03-18", adults: 2 },
]
const contexts = [
  { stay_id: "coast", destination_option_id: "porto", required_stay_ids: ["coast", "buzios"] },
  { stay_id: "coast", destination_option_id: "maragogi", required_stay_ids: ["coast", "buzios"] },
  { stay_id: "buzios", destination_option_id: "destination-1", required_stay_ids: ["coast", "buzios"] },
]
function turn() {
  return {
    schema_version: "emilia.turn.v1",
    outcome: { type: "search_results", results: { status: "partial", result_sets: [{
      product: "hotels", status: "available", artifact_id: "artifact-hotels",
      query: { city: "Porto de Galinhas", adults: 3, segments },
      metadata: { hotel_segments: contexts.map((ctx, i) => ({ ...ctx, city: ["Porto de Galinhas", "Maragogi", "Buzios"][i], status: i === 1 ? "failed" : "available" })) },
      data: contexts.map((context, i) => ({
        schema_version: "emilia.hotel-offer.v1", id: `hotel-${i}`, search_context: context,
        name: `Hotel ${i}`, location: { city: ["Porto de Galinhas", "Maragogi", "Buzios"][i] },
        rooms: [{ id: `room-${i}`, name: "Doble", price: { amount: 400 + i * 100, currency: "USD", basis: "PROVIDER_TOTAL" } }],
      })),
    }] } },
  }
}
function cards(): EurovipsHotel[] { return normalizeEmiliaTurnPayload(turn()).hotels!.items }
const base = {
  lead: { id: "lead", agency_id: "agency", contact_name: "Test", destination: "Recife", region: "BRASIL" },
  generalData: { departureDate: "2027-03-10", returnDate: "2027-03-14", adults: 2, children: 0, infants: 0 },
  selectedFlight: null,
}

it("keeps dates, occupancy, countries and refresh references per stay in final and progressive cards", () => {
  const normalized = normalizeEmiliaTurnPayload(turn())
  const hotels = normalized.hotels!.items
  expect(hotels[2]).toMatchObject({ city: "Buzios", check_in: "2027-03-14", check_out: "2027-03-18", search_adults: 2, nights: 4 })
  expect(hotels[2].rooms[0]).toMatchObject({ adults: 2, offer_source: { artifact_id: "artifact-hotels", offer_id: "hotel-2", selection_id: "room-2" }, offer_refresh_fallback: { query: { city: "Buzios", countryCode: "BR", checkinDate: "2027-03-14", adults: 2 } } })
  expect(hotels[1].rooms[0].offer_refresh_fallback.query.city).toBe("Maragogi")
  expect(normalized.assistantMeta.hotelSegments[1].status).toBe("failed")
  const progress = normalizeEmiliaProgress({ attempt: 1, job_id: "job", progress: { attempt: 1, version: 101, requested_products: ["hotels"], results: turn().outcome.results } })
  expect(progress?.results.hotels?.items).toEqual(hotels)
  expect(JSON.parse(JSON.stringify(hotels))[2].search_context).toEqual(contexts[2])
})

it("replaces alternatives only within their stay", () => {
  const hotels = cards()
  const selected = selectHotelForStay(new Map([[hotels[0].id, "room-0"], [hotels[2].id, "room-2"]]), hotels[1], "room-1", hotels)
  expect(Array.from(selected.keys())).toEqual(["hotel-2", "hotel-1"])
})

it("preserves every hotel in a quotation update without replacing the active search context", () => {
  const hotelSet = turn().outcome.results.result_sets[0]
  const normalized = normalizeEmiliaTurnPayload({ schema_version: "emilia.turn.v1", request_id: "new-quote-turn", outcome: {
    type: "quotation_updated", quotation: { id: "quote", revision_id: "revision", version: 1,
      items: [hotelSet.data[0], hotelSet.data[2]].map(offer => ({ product: "hotels", offer_id: offer.id, offer })) },
  } })
  expect(normalized.assistantMeta.quotation.items).toHaveLength(2)
  expect(normalized.assistantMeta.quotation.items[1].label).toContain("Buzios")
  expect(normalized.assistantMeta.turnSemantics?.searchContextId).toBeUndefined()
})

it("builds one complete itinerary, with each hotel exactly once and the final checkout", () => {
  const hotels = cards()
  const selectedHotels = [{ hotel: hotels[2], roomIndex: 0 }, { hotel: hotels[0], roomIndex: 0 }]
  const payload = buildQuotationPayload({ ...base, selectedHotels })
  expect(payload.options).toHaveLength(1)
  expect(payload.options[0].items.map(item => item.destination_city)).toEqual(["Porto de Galinhas", "Buzios"])
  expect(payload.options[0].total_amount).toBe(1000)
  expect(payload.return_date).toBe("2027-03-18")
  expect(selectedHotels[0].hotel.city).toBe("Buzios")
})

it("rejects a missing stay, duplicate alternatives and an exceeded combined budget", () => {
  const hotels = cards()
  expect(() => buildQuotationPayload({ ...base, selectedHotels: [{ hotel: hotels[0], roomIndex: 0 }] })).toThrow("cada estadía")
  expect(() => buildQuotationPayload({ ...base, selectedHotels: hotels.map(hotel => ({ hotel, roomIndex: 0 })) })).toThrow("un solo hotel")
  hotels[0].search_context!.combined_budget = { amount: 500, currency: "USD" }
  expect(() => buildQuotationPayload({ ...base, selectedHotels: [hotels[0], hotels[2]].map(hotel => ({ hotel, roomIndex: 0 })) })).toThrow("presupuesto")
})
