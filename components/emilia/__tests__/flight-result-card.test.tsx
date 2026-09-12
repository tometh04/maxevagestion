import { render, screen } from "@testing-library/react"
import { FlightResultCard } from "../flight-result-card"
import { canonicalOfferCards } from "@/lib/emilia/turn-result"

const flight = {
  id: "flight", airline: { code: "AR", name: "Aerolíneas Argentinas" },
  price: { amount: 900, currency: "USD" }, adults: 1, departure_date: "2026-09-01",
  legs: [{
    departure: { city_code: "EZE", city_name: "Buenos Aires", time: "22:00" },
    arrival: { city_code: "MAD", city_name: "Madrid", time: "16:00" },
    duration: "13h 00m", flight_type: "outbound" as const, arrival_next_day: true,
    stops: 0,
  }],
}

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

it("no inventa equipaje ni repite la fecha de salida como llegada del día siguiente", () => {
  render(<FlightResultCard flight={flight} />)
  expect(screen.getByText("(Equipaje a confirmar)")).toBeInTheDocument()
  expect(screen.queryByText(/Mochila/)).not.toBeInTheDocument()
  expect(screen.getByText("Fecha a confirmar")).toBeInTheDocument()
  expect(screen.getByText(/Reembolso: a confirmar/)).toBeInTheDocument()
})

it("muestra fechas y números de tramo reales y condiciones confirmadas", () => {
  render(<FlightResultCard flight={{ ...flight, refundable: false, legs: [{
    ...flight.legs[0], baggage: { checked: true, carry_on: false },
    segments: [{ marketing_airline: "AR", flight_number: "1132", operating_airline: "AR",
      departure: { airport_code: "EZE", date: "2026-09-01", time: "22:00" },
      arrival: { airport_code: "MAD", date: "2026-09-02", time: "16:00" },
    }],
  }] }} />)
  expect(screen.getByText("2026-09-02")).toBeInTheDocument()
  expect(screen.getByText("AR 1132")).toBeInTheDocument()
  expect(screen.getByText(/Despachado incluido \+ Sin equipaje de mano/)).toBeInTheDocument()
  expect(screen.getByText("Tarifa no reembolsable.")).toBeInTheDocument()
})
