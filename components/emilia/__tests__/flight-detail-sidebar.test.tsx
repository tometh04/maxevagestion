import { fireEvent, render, screen, within } from "@testing-library/react"
import { FlightDetailSidebar } from "../flight-detail-sidebar"
import { transformCanonicalFlights } from "@/lib/emilia/transformers"
import fixture from "@/lib/emilia/fixtures/flight-details.real.canonical.json"

const flights = transformCanonicalFlights(fixture, { adults: 2 })

it.each(flights)("muestra todos los campos comerciales del proveedor $provider y permite seleccionar/cerrar", flight => {
  const onClose = jest.fn(), onSelectionChange = jest.fn()
  render(<FlightDetailSidebar flight={flight} selected={false} onClose={onClose} onSelectionChange={onSelectionChange} />)
  const sidebar = screen.getByRole("complementary")
  expect(screen.getByRole("button", { name: "Cerrar detalle del vuelo" })).toHaveFocus()
  for (const section of flight.provider_details) for (const field of section.fields) {
    expect(sidebar.textContent).toContain(field.label)
    expect(sidebar.textContent).toContain(field.value)
  }
  fireEvent.click(within(sidebar).getByRole("button", { name: "Seleccionar vuelo" }))
  expect(onSelectionChange).toHaveBeenCalledWith(flight.id, true)
  fireEvent.keyDown(sidebar, { key: "Escape" })
  expect(onClose).toHaveBeenCalledTimes(1)
})

it("conserva información ausente y renderiza texto del proveedor sin ejecutar HTML", () => {
  const flight = { ...flights[0], provider_details: [{ title: "Condiciones", fields: [{ label: "Política", value: '<img src=x onerror="alert(1)">' }] }] }
  const { container, rerender } = render(<FlightDetailSidebar flight={flight} onClose={jest.fn()} />)
  expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeInTheDocument()
  expect(container.querySelector('img[src="x"]')).toBeNull()
  rerender(<FlightDetailSidebar flight={{ ...flight, provider_details: undefined }} onClose={jest.fn()} />)
  expect(screen.getByText(/Volvé a buscar/)).toBeInTheDocument()
})
