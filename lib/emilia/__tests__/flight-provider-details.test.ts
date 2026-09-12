import fixture from "../fixtures/flight-details.real.canonical.json"
import { transformCanonicalFlights, sanitizeEmiliaMetaForStorage } from "../transformers"
import { flightProviderSections } from "../flight-provider-details"
import { canonicalOfferCards } from "../turn-result"

it("conserva todas las secciones reales en el view model y en conversaciones guardadas", () => {
  const flights = transformCanonicalFlights(fixture, { adults: 2 })
  flights.forEach((flight, i) => expect(flight.provider_details).toEqual(fixture[i].provider_details))
  const cards = canonicalOfferCards({ outcome: { results: { result_sets: [{ product: "flights", data: fixture, query: { adults: 2 } }] } } })
  expect(cards.flights).toHaveLength(fixture.length)
  cards.flights.forEach((flight: { provider_details?: unknown }, i: number) => expect(flight.provider_details).toEqual(fixture[i].provider_details))
  expect(JSON.parse(JSON.stringify(sanitizeEmiliaMetaForStorage({ flights })))).toEqual({ flights })
})

it("acepta conversaciones anteriores y descarta campos fuera del contrato público", () => {
  expect(flightProviderSections(undefined)).toBeUndefined()
  expect(flightProviderSections([{ title: "Tarifa", secret: "hidden", fields: [{ label: "Precio", value: "0", token: "hidden" }, null] }])).toEqual([{ title: "Tarifa", fields: [{ label: "Precio", value: "0" }] }])
})
