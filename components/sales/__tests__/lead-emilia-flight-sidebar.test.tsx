import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { LeadEmiliaChat } from "../lead-emilia-chat"
import { waitForEmiliaJob } from "@/lib/emilia/async-turn"

jest.mock("@/lib/emilia/async-turn", () => {
  const actual = jest.requireActual("@/lib/emilia/async-turn")
  return { ...actual, waitForEmiliaJob: jest.fn() }
})
jest.mock("@/components/tours/tours-provider", () => ({ useTours: () => ({
  abort: jest.fn(), activeTour: null, isUnseen: () => false, start: jest.fn(), toursDisabled: true,
}) }))
jest.mock("@/components/sales/quotation-pdf-price-dialog", () => ({ QuotationPdfPriceDialog: () => null }))
jest.mock("@/lib/pdf/quotation-pdf-html", () => ({ downloadQuotationPdfFromPriceDialog: jest.fn() }))
jest.mock("@/components/sales/emilia-prompt-guide", () => ({ EmiliaPromptGuide: () => null }))
jest.mock("@/components/emilia/flight-result-card", () => ({
  ...jest.requireActual("@/components/emilia/flight-result-card"),
  FlightResultCard: function Card({ flight, selected, onSelectionChange, details }: any) {
    return <div data-testid="flight-card">
      <button onClick={() => onSelectionChange(flight.id, !selected)}>{selected ? "Vuelo seleccionado" : "Seleccionar vuelo"}</button>
      <button onClick={details.onToggle}>Ver detalle del vuelo</button>
    </div>
  },
}))
jest.mock("@/components/emilia/hotel-result-card", () => ({ ...jest.requireActual("@/components/emilia/hotel-result-card"), HotelResultCard: ({ selected, onSelectionChange }: any) => <button onClick={onSelectionChange}>{selected ? "Hotel seleccionado" : "Hotel disponible"}</button> }))

const flight = { id: "flight-1", provider: "STARLING", airline: { code: "AR", name: "Aerolíneas" },
  price: { amount: 100, currency: "USD" }, legs: [], departure_date: "2026-10-10", adults: 2 }
const flightResults = { flights: { count: 1, items: [flight] } }
const hotelResults = { hotels: { count: 1, items: [{ id: "hotel-1", name: "Hotel Cancún",
  rooms: [{ occupancy_id: "room-1", room_name: "Doble", total_price: 500, currency: "USD" }] }] } }
const partial = { status: "processing", job_id: "job-1", attempt: 1, requestType: "combined",
  progress: { version: 102, attempt: 1, products: { flights: "available", hotels: "searching" } }, results: flightResults }
let complete: (value: any) => void
let fail: (error: Error) => void
let onProgress: (value: any) => void
let history: any[]

beforeEach(() => {
  history = []
  window.HTMLElement.prototype.scrollIntoView = jest.fn()
  window.HTMLElement.prototype.scrollTo = jest.fn()
  jest.mocked(waitForEmiliaJob).mockImplementation(args => {
    onProgress = args.onProgress!
    return new Promise((resolve, reject) => { complete = resolve; fail = reject })
  })
  global.fetch = jest.fn(async url => ({ ok: true, json: async () => String(url).includes("/conversations/")
    ? { messages: history }
    : String(url).includes("suggested-prompt") ? { prompt: "Buscá vuelos y hoteles" }
    : { status: "queued", job_id: "job-1", attempt: 1 },
  })) as jest.Mock
})
afterEach(() => jest.clearAllMocks())

function chat() {
  return render(<LeadEmiliaChat lead={{ id: "lead-1", agency_id: "agency-1", contact_name: "Cliente" }}
    initialConversation={{ id: "conversation-1" }} onBack={jest.fn()} />)
}
it("usa una sola sidebar para vuelos y hoteles y devuelve el foco al cerrar", async () => {
  history = [{ id: "results", role: "assistant", content: { text: "Resultados", cards: { ...flightResults, ...hotelResults } } }]
  chat()
  const trigger = await screen.findByText("Ver detalle del vuelo")
  trigger.focus()
  fireEvent.click(trigger)
  expect(screen.getAllByRole("complementary")).toHaveLength(1)
  expect(screen.getByRole("complementary")).toHaveAccessibleName("Detalle del vuelo de Aerolíneas")
  expect(screen.queryByText("Vuelo seleccionado")).not.toBeInTheDocument()
  fireEvent.keyDown(screen.getByRole("complementary"), { key: "Escape" })
  await waitFor(() => expect(trigger).toHaveFocus())
  fireEvent.click(trigger)
  fireEvent.click(screen.getByText("Hotel disponible"))
  expect(screen.getAllByRole("complementary")).toHaveLength(1)
  expect(screen.getByRole("complementary")).toHaveAccessibleName("Detalle de Hotel Cancún")
  fireEvent.click(trigger)
  expect(screen.getAllByRole("complementary")).toHaveLength(1)
  expect(screen.getByRole("complementary")).toHaveAccessibleName("Detalle del vuelo de Aerolíneas")
})
