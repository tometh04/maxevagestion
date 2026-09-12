import { fireEvent, render, screen, within } from "@testing-library/react"
import { HotelDetailSidebar } from "../hotel-detail-sidebar"
import { HotelResultCard } from "../hotel-result-card"
import { HotelFiltersBar } from "../hotel-filters-bar"
import { transformCanonicalHotels } from "@/lib/emilia/transformers"
import { getHotelFilterOptions } from "@/lib/emilia/result-filters"
import fixture from "@/lib/emilia/fixtures/hotel-details.synthetic.json"

const [hotel] = transformCanonicalHotels([fixture], { adults: 2, children: 1 })

it("renders commercial details from the API contract and selects the exact room", () => {
  const onRoomSelect = jest.fn()
  const onClose = jest.fn()
  render(<HotelDetailSidebar hotel={hotel} filters={{}} onRoomSelect={onRoomSelect} onClose={onClose} />)
  expect(screen.getByText(fixture.description)).toBeVisible()
  expect(screen.getByText(fixture.lodging_policy)).toBeVisible()
  expect(screen.getByText(/Impuestos: USD 100/)).toBeVisible()
  expect(screen.getByText("Desde 2027-01-08 hasta 2027-01-15: EUR 100")).toBeVisible()
  expect(screen.getByText(/Balcón · Aire acondicionado/)).toBeVisible()
  expect(screen.getByRole("link", { name: "Sitio web del hotel" })).toHaveAttribute("href", fixture.website)
  expect(screen.getByRole("button", { name: "Cerrar detalle del hotel" })).toHaveFocus()
  fireEvent.click(screen.getByRole("button", { name: "Seleccionar habitación" }))
  expect(onRoomSelect).toHaveBeenCalledWith(fixture.rooms[0].id)
  fireEvent.keyDown(screen.getByRole("complementary"), { key: "Escape" })
  expect(onClose).toHaveBeenCalledTimes(1)
})

it("keeps all room information visible outside filters and supports removing selection", () => {
  const onRoomSelect = jest.fn()
  render(<HotelDetailSidebar hotel={hotel} filters={{ freeCancellation: true }} selectedRoomId={fixture.rooms[0].id} onRoomSelect={onRoomSelect} onClose={jest.fn()} />)
  expect(screen.getByText("Esta tarifa no cumple los filtros actuales.")).toBeVisible()
  fireEvent.click(screen.getByText("Quitar selección"))
  expect(onRoomSelect).toHaveBeenCalledWith(fixture.rooms[0].id)
})

it("does not offer unavailable rooms or unsafe website links", () => {
  render(<HotelDetailSidebar hotel={{ ...hotel, website: "javascript:alert(1)", rooms: [{ ...hotel.rooms[0], availability_status: "unavailable" }] }} filters={{}} onRoomSelect={jest.fn()} onClose={jest.fn()} />)
  expect(screen.queryByRole("link", { name: "Sitio web del hotel" })).not.toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Seleccionar habitación" })).toBeDisabled()
})

it("handles missing details and broken photos", () => {
  render(<HotelDetailSidebar hotel={{ ...hotel, description: "", amenities: [], policy_lodging: "", policy_cancellation: "", rooms: [] }} filters={{}} onRoomSelect={jest.fn()} onClose={jest.fn()} />)
  fireEvent.error(screen.getByRole("img"))
  expect(screen.getByText("Sin foto")).toBeVisible()
  expect(screen.getByText(/no informó habitaciones/)).toBeVisible()
  expect(screen.getByText(/no informó descripción/)).toBeVisible()
})

it("moves room choices out of the CRM card", () => {
  const open = jest.fn()
  const view = render(<HotelResultCard hotel={hotel} onViewDetails={open} />)
  expect(within(view.container).queryByText("Habitaciones disponibles:")).not.toBeInTheDocument()
  expect(within(view.container).queryByText(fixture.rooms[0].description)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Ver hotel y habitaciones" }))
  expect(open).toHaveBeenCalledTimes(1)
})

it("shows room-specific photos, nightly prices and cancellation charges without borrowing hotel photos", () => {
  const room = { ...hotel.rooms[0], images: ["https://images.example.com/room.jpg"],
    promotion: "Descuento por reserva anticipada", cancellation_deadline: "2027-01-03",
    nightly_prices: [{ date: "2027-01-10", price: { amount: 200, currency: "USD" } }],
    cancellation_terms: [{ from_date: "2027-01-04", to_date: "2027-01-10", penalty: { amount: 150, currency: "USD" } }] }
  const { rerender } = render(<HotelDetailSidebar hotel={{ ...hotel, room_conditions: "Cama extra bajo petición", observations: "Obras en piscina", rooms: [room] }} filters={{}} onRoomSelect={jest.fn()} onClose={jest.fn()} />)
  expect(screen.getByText("Cama extra bajo petición")).toBeVisible()
  expect(screen.getByText("Obras en piscina")).toBeVisible()
  expect(screen.getByText(room.promotion)).toBeVisible()
  expect(screen.getByText(room.cancellation_deadline)).toBeVisible()
  expect(screen.getByText("Desde 2027-01-04 hasta 2027-01-10: USD 150")).toBeVisible()
  expect(screen.getByRole("img", { name: `${room.type} · habitación en ${hotel.name}` })).toHaveAttribute("src", room.images[0])
  expect(screen.getByText("Ver precios por noche").parentElement).toHaveTextContent("2027-01-10USD 200")
  rerender(<HotelDetailSidebar hotel={{ ...hotel, rooms: [{ ...hotel.rooms[0], images: [] }] }} filters={{}} onRoomSelect={jest.fn()} onClose={jest.fn()} />)
  expect(within(screen.getByRole("region", { name: "Habitaciones y tarifas" })).queryByRole("img")).not.toBeInTheDocument()
})

it("requires a currency before filtering mixed prices and resets filters", () => {
  const options = getHotelFilterOptions([hotel, { ...hotel, rooms: [{ ...hotel.rooms[0], currency: "ARS" }] }])
  const clear = jest.fn()
  const onChange = jest.fn()
  render(<HotelFiltersBar options={options} filters={{ name: "prueba" }} visibleCount={1} totalCount={2} onChange={onChange} onClear={clear} />)
  expect(screen.getByLabelText("Precio máximo de hotel")).toBeDisabled()
  fireEvent.click(screen.getByLabelText("Cancelación gratuita"))
  expect(onChange).toHaveBeenCalledWith({ name: "prueba", freeCancellation: true })
  fireEvent.click(screen.getByText("Limpiar filtros"))
  expect(clear).toHaveBeenCalledTimes(1)
})
