import { fireEvent, render, screen } from "@testing-library/react"
import { FlightResults } from "../flight-results"
import type { FlightData } from "../flight-result-card"

const connecting: FlightData = {
  id: "connecting", airline: { code: "LA", name: "LATAM" },
  price: { amount: 900, currency: "USD" }, adults: 2, departure_date: "2026-10-10",
  return_date: "2026-10-17", legs: [{
    flight_type: "outbound", duration: "28h 10m", stops: 2,
    departure: { city_code: "EZE", city_name: "Buenos Aires", time: "12:15" },
    arrival: { city_code: "PUJ", city_name: "Punta Cana", time: "15:25" },
    layovers: [
      { destination_code: "SCL", destination_city: "Santiago", waiting_time: "6h 30m" },
      { destination_code: "LIM", destination_city: "Lima", waiting_time: "10h 35m" },
    ],
    segments: [{ marketing_airline: "LA", flight_number: "100",
      departure: { airport_code: "EZE" }, arrival: { airport_code: "SCL" },
      baggage: { checked: { included: true, pieces: 2 }, carry_on: { included: true }, personal_item: { included: null } },
    }, { departure: { airport_code: "SCL" }, arrival: { airport_code: "LIM" } }],
  }],
}
const direct: FlightData = {
  ...connecting, id: "direct", airline: { code: "AR", name: "Aerolíneas Argentinas" },
  legs: [{ ...connecting.legs[0], stops: 0, duration: "8h 00m", layovers: [], segments: [] }],
}

it("abre la sidebar del chat sin cambiar la selección ni insertar paneles en el carrusel", () => {
  const onSelectionChange = jest.fn()
  const onViewDetails = jest.fn()
  const { container } = render(<FlightResults flights={[connecting, direct]} selectedFlightIds={[direct.id]} onSelectionChange={onSelectionChange} onViewDetails={onViewDetails} />)
  fireEvent.click(screen.getAllByRole("button", { name: "Ver detalle del vuelo" })[0])
  expect(onViewDetails).toHaveBeenCalledWith(connecting)
  expect(onSelectionChange).not.toHaveBeenCalled()
  expect(container.querySelector("aside")).toBeNull()
  expect(screen.queryByText("SCL · 6h 30m")).not.toBeInTheDocument()
  expect(screen.getByRole("checkbox", { name: /Aerolíneas Argentinas/ })).toBeChecked()
  fireEvent.click(screen.getByRole("checkbox", { name: /LATAM/ }))
  expect(onSelectionChange).toHaveBeenCalledWith(connecting.id, true)
})
