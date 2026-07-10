import { fireEvent, render, screen } from "@testing-library/react"
import { RoomGroupSelector } from "../room-group-selector"

function makeRoom(index: number) {
  return {
    type: `TYPE-${index}`,
    description: `Habitación ${index}`,
    price_per_night: 100 + index,
    total_price: 700 + index,
    currency: "USD",
    availability: 3,
    occupancy_id: `room-${index}`,
  }
}

describe("RoomGroupSelector", () => {
  const rooms = [1, 2, 3, 4, 5].map(makeRoom)

  it("permite expandir y comprimir habitaciones", () => {
    render(<RoomGroupSelector rooms={rooms} nights={7} maxInitialRooms={3} />)

    const expand = screen.getByRole("button", { name: "Ver 2 habitaciones más" })
    fireEvent.click(expand)

    expect(screen.getByRole("button", { name: "Ver menos" })).toBeInTheDocument()
    expect(screen.getByText("Habitación 5")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Ver menos" }))

    expect(screen.getByRole("button", { name: "Ver 2 habitaciones más" })).toBeInTheDocument()
  })

  it("mantiene visible la habitación seleccionada al comprimir", () => {
    render(
      <RoomGroupSelector
        rooms={rooms}
        nights={7}
        maxInitialRooms={3}
        selectedRoomId="room-5"
      />
    )

    expect(screen.getByText("Habitación 5")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Ver 1 habitación más" })).toBeInTheDocument()
  })
})
