/// <reference types="@testing-library/jest-dom" />
import React from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { toast } from "sonner"
import { QuotationPdfPriceDialog } from "../quotation-pdf-price-dialog"

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
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("reuses the CAS version returned by prepare when PDF generation must be retried", async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => quotationResponse() })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { updated_at: VERSION_2 } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { updated_at: VERSION_3 } }) })
    global.fetch = fetchMock as unknown as typeof fetch
    const onGenerate = jest.fn()
      .mockRejectedValueOnce(new Error("descarga fallida"))
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
    expect(putBodies[1].expected_updated_at).toBe(VERSION_2)
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("descarga fallida"))
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

  it("exige operador para ítems Emilia y lo envía al prepare atómico", async () => {
    const emiliaResponse = quotationResponse()
    Object.assign(emiliaResponse.data, {
      quotation_items: [{
        id: ITEM_ID,
        option_id: OPTION_ID,
        item_type: "FLIGHT",
        description: "Aerolíneas · EZE - PUJ",
        operator_id: null,
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
    fireEvent.click(generate)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(toast.error).toHaveBeenCalledWith(
      'Seleccioná un operador para "Aerolíneas · EZE - PUJ"'
    )

    fireEvent.change(screen.getByRole("combobox"), { target: { value: OPERATOR_ID } })
    fireEvent.click(generate)
    await waitFor(() => expect(onGenerate).toHaveBeenCalledWith(QUOTATION_ID, VERSION_2))

    const prepareBody = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))
    expect(prepareBody.item_operators).toEqual([{
      item_id: ITEM_ID,
      operator_id: OPERATOR_ID,
    }])
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
