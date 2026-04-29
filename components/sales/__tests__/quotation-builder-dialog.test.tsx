/// <reference types="@testing-library/jest-dom" />
import React from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QuotationBuilderDialog } from "../quotation-builder-dialog"

jest.mock("lucide-react", () => {
  const React = require("react")

  return new Proxy(
    { __esModule: true },
    {
      get: (target, prop) => {
        if (prop in target) {
          return target[prop as keyof typeof target]
        }

        return ({ children, ...props }: any) =>
          React.createElement("svg", { ...props, "data-icon": String(prop) }, children)
      },
    }
  )
})

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

jest.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: any) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: any) => <div>{children}</div>,
}))

jest.mock("@/components/ui/button", () => {
  const React = require("react")

  return {
    Button: ({ asChild, children, className, onClick, disabled, type = "button", ...props }: any) => {
      if (asChild && React.isValidElement(children)) {
        return React.cloneElement(children, {
          className,
          onClick,
          "aria-disabled": disabled,
          ...props,
        })
      }

      return (
        <button type={type} className={className} onClick={onClick} disabled={disabled} {...props}>
          {children}
        </button>
      )
    },
  }
})

jest.mock("@/components/ui/input", () => {
  const React = require("react") as typeof import("react")
  const MockInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function MockInput(
    props,
    ref
  ) {
    return <input ref={ref} {...props} />
  })

  return { Input: MockInput }
})

jest.mock("@/components/ui/textarea", () => {
  const React = require("react") as typeof import("react")
  const MockTextarea = React.forwardRef<
    HTMLTextAreaElement,
    React.TextareaHTMLAttributes<HTMLTextAreaElement>
  >(function MockTextarea(props, ref) {
    return <textarea ref={ref} {...props} />
  })

  return { Textarea: MockTextarea }
})

jest.mock("@/components/ui/label", () => ({
  Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
}))

jest.mock("@/components/ui/badge", () => ({
  Badge: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}))

jest.mock("@/components/ui/separator", () => ({
  Separator: (props: any) => <hr {...props} />,
}))

jest.mock("@/components/ui/select", () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder || ""}</span>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children }: any) => <div>{children}</div>,
}))

jest.mock("@/components/ui/searchable-combobox", () => ({
  SearchableCombobox: ({ value, onChange, placeholder }: any) => (
    <input
      value={value || ""}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}))

jest.mock("@/components/ui/date-input-with-calendar", () => ({
  DateInputWithCalendar: ({ value, onChange, disabled }: any) => (
    <input
      type="date"
      disabled={disabled}
      value={value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString().split("T")[0] : ""}
      onChange={(event) => onChange(event.target.value ? new Date(`${event.target.value}T00:00:00`) : undefined)}
    />
  ),
}))

const baseLead = {
  contact_phone: "+5491111111111",
  contact_email: "test@example.com",
  agency_id: "agency-1",
}

describe("QuotationBuilderDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
    window.open = jest.fn()
  })

  it("resets the form between leads and keeps creating new quotations with POST", async () => {
    const user = userEvent.setup()
    const fetchMock = global.fetch as jest.Mock

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: "quote-1", public_token: "token-1", status: "DRAFT" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: "quote-2", public_token: "token-2", status: "DRAFT" } }),
      })

    const leadA = {
      ...baseLead,
      id: "lead-a",
      contact_name: "Agustina",
      destination: "Miami",
      region: "CARIBE",
    }

    const leadB = {
      ...baseLead,
      id: "lead-b",
      contact_name: "Sofia",
      destination: "Cancun",
      region: "CARIBE",
    }

    const { container, rerender } = render(
      <QuotationBuilderDialog
        open
        onOpenChange={jest.fn()}
        lead={leadA}
        operators={[]}
        existingQuotationId={null}
      />
    )

    const titleInput = screen.getByPlaceholderText("Nombre del cliente")
    const destinationInput = screen.getByPlaceholderText("Buscar destino...")
    const descriptionInput = screen.getByPlaceholderText("Ej: Vuelo directo Buenos Aires - Miami")

    expect(titleInput).toHaveValue("Agustina")
    expect(destinationInput).toHaveValue("Miami")

    await user.type(descriptionInput, "Vuelo Agustina")
    fireEvent.change(container.querySelectorAll('input[type="date"]')[0], {
      target: { value: "2026-06-10" },
    })

    await user.click(screen.getByRole("button", { name: /guardar borrador/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/quotations",
      expect.objectContaining({ method: "POST" })
    )
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(
      expect.objectContaining({ lead_id: "lead-a", destination: "Miami" })
    )

    rerender(
      <QuotationBuilderDialog
        open={false}
        onOpenChange={jest.fn()}
        lead={leadA}
        operators={[]}
        existingQuotationId={null}
      />
    )

    rerender(
      <QuotationBuilderDialog
        open
        onOpenChange={jest.fn()}
        lead={leadB}
        operators={[]}
        existingQuotationId={null}
      />
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Nombre del cliente")).toHaveValue("Sofia")
      expect(screen.getByPlaceholderText("Buscar destino...")).toHaveValue("Cancun")
      expect(screen.getByPlaceholderText("Ej: Vuelo directo Buenos Aires - Miami")).toHaveValue("")
    })

    await user.type(screen.getByPlaceholderText("Ej: Vuelo directo Buenos Aires - Miami"), "Vuelo Sofia")
    fireEvent.change(container.querySelectorAll('input[type="date"]')[0], {
      target: { value: "2026-07-15" },
    })

    await user.click(screen.getByRole("button", { name: /guardar borrador/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/quotations",
      expect.objectContaining({ method: "POST" })
    )
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(
      expect.objectContaining({ lead_id: "lead-b", destination: "Cancun" })
    )
  })

  it("loads an existing quotation and updates it with PATCH", async () => {
    const user = userEvent.setup()
    const fetchMock = global.fetch as jest.Mock

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            id: "quote-existing",
            destination: "Punta Cana",
            origin: "Buenos Aires",
            region: "CARIBE",
            departure_date: "2026-08-01",
            return_date: "2026-08-10",
            adults: 2,
            children: 0,
            infants: 0,
            currency: "USD",
            pricing_mode: "PER_PERSON",
            notes: "nota",
            public_token: "existing-token",
            quotation_options: [
              {
                id: "option-1",
                option_number: 1,
                title: "Opcion 1",
                total_amount: 3200,
                calculated_total_amount: 3200,
                manual_total_amount: null,
              },
            ],
            quotation_items: [
              {
                id: "item-1",
                option_id: "option-1",
                order_index: 0,
                item_type: "FLIGHT",
                description: "Vuelo existente",
                quantity: 1,
                sale_amount: 3200,
                cost_amount: 2800,
                cost_currency: "USD",
                generates_commission: false,
                flight_stops: 0,
              },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: "quote-existing", public_token: "existing-token", status: "DRAFT" } }),
      })

    render(
      <QuotationBuilderDialog
        open
        onOpenChange={jest.fn()}
        lead={{
          ...baseLead,
          id: "lead-existing",
          contact_name: "Agustina",
          destination: "Punta Cana",
          region: "CARIBE",
        }}
        operators={[]}
        existingQuotationId="quote-existing"
      />
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Buscar destino...")).toHaveValue("Punta Cana")
      expect(screen.getByPlaceholderText("Ej: Vuelo directo Buenos Aires - Miami")).toHaveValue("Vuelo existente")
    })

    await user.click(screen.getByRole("button", { name: /actualizar borrador/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/quotations/quote-existing",
      expect.objectContaining({ cache: "no-store" })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/quotations/quote-existing",
      expect.objectContaining({ method: "PATCH" })
    )
  })

  it("uploads a replacement flight screenshot and includes it in the PATCH payload", async () => {
    const user = userEvent.setup()
    const fetchMock = global.fetch as jest.Mock

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            id: "quote-existing",
            destination: "Punta Cana",
            origin: "Buenos Aires",
            region: "CARIBE",
            departure_date: "2026-08-01",
            return_date: "2026-08-10",
            adults: 2,
            children: 0,
            infants: 0,
            currency: "USD",
            pricing_mode: "PER_PERSON",
            notes: "nota",
            public_token: "existing-token",
            quotation_options: [
              {
                id: "option-1",
                option_number: 1,
                title: "Opcion 1",
                total_amount: 3200,
                calculated_total_amount: 3200,
                manual_total_amount: null,
              },
            ],
            quotation_items: [
              {
                id: "item-1",
                option_id: "option-1",
                order_index: 0,
                item_type: "FLIGHT",
                description: "Vuelo existente",
                quantity: 1,
                sale_amount: 3200,
                cost_amount: 2800,
                cost_currency: "USD",
                generates_commission: false,
                flight_stops: 0,
              },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: "https://example.com/quotation-flight.png" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: "quote-existing", public_token: "existing-token", status: "DRAFT" } }),
      })

    const { container } = render(
      <QuotationBuilderDialog
        open
        onOpenChange={jest.fn()}
        lead={{
          ...baseLead,
          id: "lead-existing",
          contact_name: "Agustina",
          destination: "Punta Cana",
          region: "CARIBE",
        }}
        operators={[]}
        existingQuotationId="quote-existing"
      />
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Ej: Vuelo directo Buenos Aires - Miami")).toHaveValue("Vuelo existente")
    })

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(["flight"], "flight.png", { type: "image/png" })

    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        "/api/quotations/upload-flight-screenshot",
        expect.objectContaining({ method: "POST" })
      )
    })

    await user.click(screen.getByRole("button", { name: /actualizar borrador/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    const patchPayload = JSON.parse(fetchMock.mock.calls[2][1].body)
    expect(patchPayload.options[0].items[0].flight_screenshot_url).toBe("https://example.com/quotation-flight.png")
  })

  it("disables saving while a flight screenshot upload is still in progress", async () => {
    const fetchMock = global.fetch as jest.Mock
    let resolveUpload: (value: any) => void = () => {}

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            id: "quote-existing",
            destination: "Punta Cana",
            origin: "Buenos Aires",
            region: "CARIBE",
            departure_date: "2026-08-01",
            return_date: "2026-08-10",
            adults: 2,
            children: 0,
            infants: 0,
            currency: "USD",
            pricing_mode: "PER_PERSON",
            notes: "nota",
            public_token: "existing-token",
            quotation_options: [
              {
                id: "option-1",
                option_number: 1,
                title: "Opcion 1",
                total_amount: 3200,
                calculated_total_amount: 3200,
                manual_total_amount: null,
              },
            ],
            quotation_items: [
              {
                id: "item-1",
                option_id: "option-1",
                order_index: 0,
                item_type: "FLIGHT",
                description: "Vuelo existente",
                quantity: 1,
                sale_amount: 3200,
                cost_amount: 2800,
                cost_currency: "USD",
                generates_commission: false,
                flight_stops: 0,
              },
            ],
          },
        }),
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveUpload = resolve
          })
      )

    const { container } = render(
      <QuotationBuilderDialog
        open
        onOpenChange={jest.fn()}
        lead={{
          ...baseLead,
          id: "lead-existing",
          contact_name: "Agustina",
          destination: "Punta Cana",
          region: "CARIBE",
        }}
        operators={[]}
        existingQuotationId="quote-existing"
      />
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Ej: Vuelo directo Buenos Aires - Miami")).toHaveValue("Vuelo existente")
    })

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(["flight"], "flight.png", { type: "image/png" })

    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /actualizar borrador/i })).toBeDisabled()
      expect(screen.getByRole("button", { name: /guardar y enviar por whatsapp/i })).toBeDisabled()
    })

    resolveUpload({
      ok: true,
      json: async () => ({ url: "https://example.com/quotation-flight.png" }),
    })

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /actualizar borrador/i })).not.toBeDisabled()
      expect(screen.getByRole("button", { name: /guardar y enviar por whatsapp/i })).not.toBeDisabled()
    })
  })
})
