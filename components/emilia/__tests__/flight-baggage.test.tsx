import { render, screen } from "@testing-library/react"
import { FlightResultCard } from "../flight-result-card"
import { canonicalOfferCards } from "@/lib/emilia/turn-result"

it("muestra el detalle Delfos desde el contrato del chat sin trasladarlo a otra conexión", () => {
  const cards = canonicalOfferCards({ outcome: { results: { result_sets: [{
    product: "flights", query: { adults: 1 }, data: [{
      id: "delfos", provider: "DELFOS", price: { amount: 900, currency: "USD" },
      baggage: { checked: false, carry_on: null }, legs: [{ segments: [{
        departure: { airport_code: "EZE" }, arrival: { airport_code: "GRU" },
        baggage: {
          checked: { included: true, pieces: 2, weight: { value: 23, unit: "KG" } },
          carry_on: { included: true }, personal_item: { included: true },
          by_passenger_type: [{ passenger_type: "INF", checked: { included: false } }],
        },
      }, { departure: { airport_code: "GRU" }, arrival: { airport_code: "MAD" } }] }],
    }],
  }] } } })
  render(<FlightResultCard flight={cards.flights![0]} />)
  expect(screen.getByText(/EZE → GRU: Despachado: incluido \(2 piezas, 23 kg\)/)).toBeInTheDocument()
  expect(screen.getByText(/Carry-on: incluido/)).toBeInTheDocument()
  expect(screen.getByText(/Artículo personal: incluido/)).toBeInTheDocument()
  expect(screen.getByText(/Despachado Bebé: no incluido/)).toBeInTheDocument()
  expect(screen.getByText(/GRU → MAD: Despachado: a confirmar · Carry-on: a confirmar/)).toBeInTheDocument()
})
