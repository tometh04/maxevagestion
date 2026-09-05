import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useState } from "react"
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
  FlightResultCard: function Card({ flight, selected, onSelectionChange }: any) {
    const [expanded, setExpanded] = useState(false)
    return <div data-testid="flight-card">
      <button onClick={() => onSelectionChange(flight.id, !selected)}>{selected ? "Vuelo seleccionado" : "Seleccionar vuelo"}</button>
      <button onClick={() => setExpanded(!expanded)}>Ver detalle del vuelo</button>
      {expanded && <span>Detalle abierto</span>}
    </div>
  },
}))
jest.mock("@/components/emilia/hotel-result-card", () => ({ HotelResultCard: () => <div>Hotel disponible</div> }))

const flight = { id: "flight-1", provider: "STARLING", airline: { code: "AR", name: "Aerolíneas" },
  price: { amount: 100, currency: "USD" }, legs: [], departure_date: "2026-10-10", adults: 2 }
const flightResults = { flights: { count: 1, items: [flight] } }
const hotelResults = { hotels: { count: 1, items: [{ id: "hotel-1", name: "Hotel Cancún",
  rooms: [{ occupancy_id: "room-1", room_name: "Doble", room_price: 500, currency: "USD" }] }] } }
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
async function send() {
  await waitFor(() => expect(screen.getByLabelText("Pedido para Emilia")).toBeEnabled())
  fireEvent.change(screen.getByLabelText("Pedido para Emilia"), { target: { value: "Vuelos y hoteles a Cancún" } })
  fireEvent.click(screen.getByLabelText("Enviar pedido a Emilia"))
  await waitFor(() => expect(waitForEmiliaJob).toHaveBeenCalled())
  act(() => onProgress(partial))
}

it("hydrates hotels without remounting the flight or losing selection and filters", async () => {
  const view = chat()
  await send()
  expect(screen.getByText("Buscando hoteles…")).toBeInTheDocument()
  const flightNode = screen.getByTestId("flight-card")
  fireEvent.click(screen.getByText("Seleccionar vuelo"))
  fireEvent.click(screen.getByText("Ver detalle del vuelo"))
  fireEvent.change(screen.getByLabelText("Precio máximo de vuelo"), { target: { value: "500" } })
  expect(screen.getByRole("button", { name: /Generar cotización/ })).toBeDisabled()
  act(() => onProgress({ ...partial, progress: { ...partial.progress, version: 103,
    products: { flights: "available", hotels: "available" } }, results: { ...flightResults, ...hotelResults } }))
  expect(screen.getByText("Hotel disponible")).toBeInTheDocument()
  expect(screen.getByTestId("flight-card")).toBe(flightNode)
  await act(async () => complete({ status: "completed", job_id: "job-1", results: { ...flightResults, ...hotelResults },
    assistant_message: { content: { text: "Búsqueda lista" } } }))
  expect(screen.getByTestId("flight-card")).toBe(flightNode)
  expect(screen.getByText("Vuelo seleccionado")).toBeInTheDocument()
  expect(screen.getByText("Detalle abierto")).toBeInTheDocument()
  expect(screen.getByLabelText("Precio máximo de vuelo")).toHaveValue(500)
  expect(screen.getByRole("button", { name: /Generar cotización/ })).toBeEnabled()
  expect(view.container.querySelectorAll('[data-emilia-job="job-1"]')).toHaveLength(1)
})

it("keeps flights visible after connection loss and blocks generating an unfinished quote", async () => {
  chat()
  await send()
  fireEvent.click(screen.getByText("Seleccionar vuelo"))
  await act(async () => fail(new Error("Conexión interrumpida")))
  expect(screen.getByText("Vuelo seleccionado")).toBeInTheDocument()
  expect(screen.getByText("No pudimos completar la búsqueda de hoteles.")).toBeInTheDocument()
  expect(screen.getByRole("button", { name: /Generar cotización/ })).toBeDisabled()
})

it("resumes the persisted job on reopen without dispatching another search", async () => {
  history = [{ id: "user-1", role: "user", content: { text: "Vuelos y hoteles", metadata: {
    emilia_job: { job_id: "job-1", status: "processing" },
  } } }]
  chat()
  await waitFor(() => expect(waitForEmiliaJob).toHaveBeenCalledWith(expect.objectContaining({ jobId: "job-1", immediate: true })))
  act(() => onProgress(partial))
  expect(screen.getByTestId("flight-card")).toBeInTheDocument()
  expect(jest.mocked(global.fetch).mock.calls.some(([url]) => url === "/api/emilia/chat")).toBe(false)
})
