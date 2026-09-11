/// <reference types="@testing-library/jest-dom" />
import React from "react"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { toast } from "sonner"
import { QuotationPdfPriceDialog } from "../quotation-pdf-price-dialog"
import {
  QuotationDocumentDownloadError,
  fetchQuotationDocumentForUser,
  type QuotationDocumentPayload,
} from "@/lib/quotation-documents/client"

jest.mock("lucide-react", () => new Proxy({ __esModule: true }, {
  get: (target, prop) => prop in target
    ? target[prop as keyof typeof target]
    : (props: any) => <svg data-icon={String(prop)} {...props} />,
}))

jest.mock("sonner", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}))

jest.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: any) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
}))

jest.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}))
jest.mock("@/components/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}))
jest.mock("@/components/ui/label", () => ({
  Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
}))
jest.mock("@/components/ui/textarea", () => ({
  Textarea: (props: any) => <textarea {...props} />,
}))
jest.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: any) => <div>{children}</div>,
  TabsContent: ({ children }: any) => <div>{children}</div>,
  TabsList: ({ children }: any) => <div>{children}</div>,
  TabsTrigger: ({ children }: any) => <button type="button">{children}</button>,
}))
jest.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange, disabled }: any) => (
    <select value={value} onChange={(event) => onValueChange(event.target.value)} disabled={disabled}>
      <option value="">Seleccionar operador</option>
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: any) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
}))

const QUOTATION_ID = "11111111-1111-4111-8111-111111111111"
const OPTION_ID = "22222222-2222-4222-8222-222222222222"
const ITEM_ID = "33333333-3333-4333-8333-333333333333"
const OPERATOR_ID = "44444444-4444-4444-8444-444444444444"
const VERSION_1 = "2026-08-24T12:00:00.000Z"
const VERSION_2 = "2026-08-24T12:01:00.000Z"
const VERSION_3 = "2026-08-24T12:02:00.000Z"
const VERSION_4 = "2026-08-24T12:03:00.000Z"

function issuedDocument(): QuotationDocumentPayload {
  return {
    html: "<html><body>Cotización</body></html>",
    filename: "cotizacion.pdf",
    pageCount: 1,
    layoutKey: "default",
    layoutVersion: 1,
    revisionId: null,
    issuedDocumentId: "55555555-5555-4555-8555-555555555555",
    contentHash: "issued-document-hash",
    quotationStatus: "SENT",
    quotationUpdatedAt: VERSION_3,
  }
}

function quotationResponse() {
  return {
    data: {
      id: QUOTATION_ID,
      quotation_number: "COT-2026-0001",
      currency: "USD",
      updated_at: VERSION_1,
      insurance_amount: 0,
      transfer_amount: 0,
      presentation_content: {
        schemaVersion: 1,
        itinerary: [{ day: 1, title: "Llegada", description: "Recepción en destino" }],
      },
      quotation_options: [{
        id: OPTION_ID,
        option_number: 1,
        title: "Opción 1",
        calculated_total_amount: 1250,
        manual_total_amount: null,
      }],
    },
  }
}

describe("QuotationPdfPriceDialog", () => {
  it.each(["Generar PDF", "Guardar y enviar"])("unlocks %s when issuance stops responding", async label => {
    const sendWindow = { opener: null, closed: false, close: jest.fn() } as unknown as Window
    const openSpy = jest.spyOn(window, "open").mockReturnValue(sendWindow)
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => quotationResponse() })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { updated_at: VERSION_2 } }) })
      .mockImplementation(() => new Promise(() => {}))
    const issue = () => fetchQuotationDocumentForUser(QUOTATION_ID, { expectedUpdatedAt: VERSION_2 })
    const onClose = jest.fn()
    render(<QuotationPdfPriceDialog quotationId={QUOTATION_ID} onClose={onClose} onGenerate={issue} onSend={issue} />)
    const button = await screen.findByRole("button", { name: label })
    await waitFor(() => expect(button).not.toBeDisabled())
    jest.useFakeTimers()
    try {
      fireEvent.click(button)
      await act(async () => { await jest.advanceTimersByTimeAsync(45_001) })
      expect(button).not.toBeDisabled()
      expect(onClose).not.toHaveBeenCalled()
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("comprobar si se guardó"))
      if (label === "Guardar y enviar") expect(sendWindow.close).toHaveBeenCalled()
    } finally { jest.useRealTimers(); openSpy.mockRestore() }
  })

  it("previews the saved content without issuing, downloading or closing", async () => {
    const document = { ...issuedDocument(), issuedDocumentId: null, quotationStatus: "DRAFT" }
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => quotationResponse() })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { updated_at: VERSION_2 } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ document }) })
    global.fetch = fetchMock as unknown as typeof fetch
    const onGenerate = jest.fn()
    const onClose = jest.fn()
    render(<QuotationPdfPriceDialog quotationId={QUOTATION_ID} onClose={onClose} onGenerate={onGenerate} />)
    const previewButton = await screen.findByRole("button", { name: "Guardar y ver vista previa" })
    await waitFor(() => expect(previewButton).not.toBeDisabled())
    fireEvent.click(previewButton)
    const frame = await screen.findByTitle("Vista previa de la cotización")
    expect(frame).toHaveAttribute("srcDoc", document.html)
    expect(fetchMock.mock.calls[1][1].method).toBe("PUT")
    expect(fetchMock.mock.calls[2][1].method).toBe("GET")
    expect(onGenerate).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.change(screen.getByDisplayValue("1250"), { target: { value: "1300" } })
    expect(screen.queryByTitle("Vista previa de la cotización")).not.toBeInTheDocument()
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("retries with the committed quotation version preserved by a download error", async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => quotationResponse() })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { updated_at: VERSION_2 } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { updated_at: VERSION_4 } }) })
    global.fetch = fetchMock as unknown as typeof fetch
    const onGenerate = jest.fn()
      .mockRejectedValueOnce(new QuotationDocumentDownloadError(
        "descarga fallida",
        issuedDocument()
      ))
      .mockResolvedValueOnce(undefined)
    const onClose = jest.fn()

    render(
      <QuotationPdfPriceDialog
        quotationId={QUOTATION_ID}
        onClose={onClose}
        onGenerate={onGenerate}
      />
    )

    const generate = await screen.findByRole("button", { name: "Generar PDF" })
    await waitFor(() => expect(generate).not.toBeDisabled())
    fireEvent.click(generate)
    await waitFor(() => expect(onGenerate).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(generate).not.toBeDisabled())

    fireEvent.click(generate)
    await waitFor(() => expect(onGenerate).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))

    const putBodies = fetchMock.mock.calls
      .filter(([, init]) => (init as RequestInit | undefined)?.method === "PUT")
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)))
    expect(putBodies).toHaveLength(2)
    expect(putBodies[0].expected_updated_at).toBe(VERSION_1)
    expect(putBodies[1].expected_updated_at).toBe(VERSION_3)
    expect(toast.error).toHaveBeenCalledWith(
      "La cotización quedó guardada, pero no se pudo completar la emisión o descarga: descarga fallida"
    )
  })

  it("fails send preflight before preparing or opening a WhatsApp window", async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({ ok: true, json: async () => quotationResponse() })
    global.fetch = fetchMock as unknown as typeof fetch
    const openSpy = jest.spyOn(window, "open").mockReturnValue(null)
    const onSend = jest.fn()

    render(
      <QuotationPdfPriceDialog
        quotationId={QUOTATION_ID}
        onClose={jest.fn()}
        onGenerate={jest.fn()}
        onSend={onSend}
        sendValidationError="El lead no tiene un teléfono para WhatsApp"
      />
    )

    const send = await screen.findByRole("button", { name: "Guardar y enviar" })
    await waitFor(() => expect(send).not.toBeDisabled())
    fireEvent.click(send)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(openSpy).not.toHaveBeenCalled()
    expect(onSend).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith("El lead no tiene un teléfono para WhatsApp")
    openSpy.mockRestore()
  })

  it("distinguishes a save failure from a later document failure", async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => quotationResponse() })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "La cotización cambió mientras la editabas" }),
      })
    global.fetch = fetchMock as unknown as typeof fetch
    const onGenerate = jest.fn()

    render(
      <QuotationPdfPriceDialog
        quotationId={QUOTATION_ID}
        onClose={jest.fn()}
        onGenerate={onGenerate}
      />
    )

    const generate = await screen.findByRole("button", { name: "Generar PDF" })
    await waitFor(() => expect(generate).not.toBeDisabled())
    fireEvent.click(generate)

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      "No se pudieron guardar los cambios de la cotización: La cotización cambió mientras la editabas"
    ))
    expect(onGenerate).not.toHaveBeenCalled()
  })

  it.each([null, OPERATOR_ID])("genera sin selectores ni cambios de operador (operador actual: %s)", async (operatorId) => {
    const emiliaResponse = quotationResponse()
    Object.assign(emiliaResponse.data, {
      quotation_items: [{
        id: ITEM_ID,
        option_id: OPTION_ID,
        item_type: "FLIGHT",
        description: "Aerolíneas · EZE - PUJ",
        operator_id: operatorId,
      }],
      available_operators: [{ id: OPERATOR_ID, name: "Delfos" }],
    })
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => emiliaResponse })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { updated_at: VERSION_2 } }) })
    global.fetch = fetchMock as unknown as typeof fetch
    const onGenerate = jest.fn().mockResolvedValue(undefined)

    render(
      <QuotationPdfPriceDialog
        quotationId={QUOTATION_ID}
        onClose={jest.fn()}
        onGenerate={onGenerate}
      />
    )

    const generate = await screen.findByRole("button", { name: "Generar PDF" })
    await waitFor(() => expect(generate).not.toBeDisabled())
    expect(screen.queryByText("Operadores de esta opción")).not.toBeInTheDocument()
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
    fireEvent.click(generate)
    await waitFor(() => expect(onGenerate).toHaveBeenCalledWith(QUOTATION_ID, VERSION_2))

    const prepareBody = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))
    expect(prepareBody).not.toHaveProperty("item_operators")
  })

  it("locks every itinerary control while the document snapshot is being prepared", async () => {
    let resolvePrepare: ((value: unknown) => void) | undefined
    const preparePending = new Promise(resolve => { resolvePrepare = resolve })
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => quotationResponse() })
      .mockReturnValueOnce(preparePending)
    global.fetch = fetchMock as unknown as typeof fetch
    const onGenerate = jest.fn().mockResolvedValue(undefined)

    render(
      <QuotationPdfPriceDialog
        quotationId={QUOTATION_ID}
        onClose={jest.fn()}
        onGenerate={onGenerate}
      />
    )

    const generate = await screen.findByRole("button", { name: "Generar PDF" })
    const addDay = await screen.findByRole("button", { name: "Día" })
    const day = screen.getByLabelText("Día")
    const title = screen.getByLabelText("Título del día")
    const description = screen.getByLabelText("Descripción del día")
    const removeDay = screen.getByRole("button", { name: "Eliminar día" })

    fireEvent.click(generate)

    await waitFor(() => {
      expect(addDay).toBeDisabled()
      expect(day).toBeDisabled()
      expect(title).toBeDisabled()
      expect(description).toBeDisabled()
      expect(removeDay).toBeDisabled()
    })

    resolvePrepare?.({ ok: true, json: async () => ({ data: { updated_at: VERSION_2 } }) })
    await waitFor(() => expect(onGenerate).toHaveBeenCalledWith(QUOTATION_ID, VERSION_2))
  })
})
