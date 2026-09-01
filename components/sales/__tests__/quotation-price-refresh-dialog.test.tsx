/// <reference types="@testing-library/jest-dom" />
import React from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { toast } from "sonner"
import { QuotationPriceRefreshDialog } from "../quotation-price-refresh-dialog"

jest.mock("lucide-react", () => new Proxy({ __esModule: true }, {
  get: (target, prop) => prop in target
    ? target[prop as keyof typeof target]
    : (props: any) => <svg data-icon={String(prop)} {...props} />,
}))

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
  },
}))

jest.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: any) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
}))

jest.mock("@/components/ui/radio-group", () => {
  const ReactImpl = require("react")
  const Context = ReactImpl.createContext(null)
  return {
    RadioGroup: ({ children, value, onValueChange, ...props }: any) => (
      <Context.Provider value={{ value, onValueChange }}>
        <div {...props}>{children}</div>
      </Context.Provider>
    ),
    RadioGroupItem: ({ id, value, disabled }: any) => {
      const group = ReactImpl.useContext(Context) as any
      return (
        <input
          id={id}
          type="radio"
          value={value}
          checked={group?.value === value}
          onChange={() => group?.onValueChange(value)}
          disabled={disabled}
        />
      )
    },
  }
})
jest.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ id, checked, onCheckedChange, disabled }: any) => (
    <input
      id={id}
      type="checkbox"
      checked={Boolean(checked)}
      onChange={event => onCheckedChange(event.target.checked)}
      disabled={disabled}
    />
  ),
}))

jest.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange, disabled }: any) => (
    <select
      aria-label="Alternativa"
      value={value}
      onChange={event => onValueChange(event.target.value)}
      disabled={disabled}
    >
      <option value="">Seleccionar alternativa</option>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
}))

const QUOTATION_ID = "11111111-1111-4111-8111-111111111111"
const OPTION_ID = "22222222-2222-4222-8222-222222222222"
const RUN_ID = "33333333-3333-4333-8333-333333333333"
const SOURCE_VERSION = "2026-08-29T12:00:00.000Z"
const RUN_VERSION = "2026-08-29T12:01:00.000Z"

function response(body: unknown, ok = true, status = ok ? 200 : 400) {
  return {
    ok,
    status,
    json: async () => body,
  }
}

function reviewRun(overrides: Record<string, unknown> = {}) {
  return {
    id: RUN_ID,
    quotation_id: QUOTATION_ID,
    status: "REVIEW_REQUIRED",
    source_updated_at: SOURCE_VERSION,
    updated_at: RUN_VERSION,
    requested_at: "2026-08-29T12:00:30.000Z",
    completed_at: "2026-08-29T12:01:00.000Z",
    summary: {
      currency: "USD",
      item_count: 1,
      unchanged_count: 0,
      price_changed_count: 1,
      unavailable_count: 0,
      replacement_count: 0,
      not_refreshable_count: 0,
      failed_count: 0,
      options: [{
        option_id: OPTION_ID,
        option_title: "Opción Caribe",
        current_cost_total: 1000,
        proposed_cost_total: 1100,
        current_customer_total: 1250,
        suggested_customer_total: 1350,
        current_margin: 250,
        suggested_margin: 250,
        manual_total_requires_confirmation: true,
      }],
    },
    items: [{
      line_id: "line-flight",
      option_id: OPTION_ID,
      option_title: "Opción Caribe",
      quotation_item_id: "item-flight",
      item_type: "FLIGHT",
      label: "EZE → PUJ",
      outcome: "PRICE_CHANGED",
      current: {
        cost_amount: 1000,
        sale_amount: 1250,
        currency: "USD",
      },
      refreshed: {
        cost_amount: 1100,
        currency: "USD",
      },
      delta_amount: 100,
      condition_changes: ["Equipaje despachado: 23 kg → 20 kg"],
      differences: [{
        field: "checked_baggage",
        before: true,
        after: false,
        material: true,
      }],
      allowed_actions: ["USE_REFRESHED", "KEEP_CURRENT"],
      requires_decision: true,
    }],
    ...overrides,
  }
}

describe("QuotationPriceRefreshDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("consulta sin datos de proveedor y aplica las decisiones comerciales confirmadas", async () => {
    const run = reviewRun()
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(response({
        data: {
          id: QUOTATION_ID,
          quotation_number: "COT-2026-0007",
          updated_at: SOURCE_VERSION,
        },
      }))
      .mockResolvedValueOnce(response({ data: { run } }))
      .mockResolvedValueOnce(response({
        data: {
          quotation: { id: QUOTATION_ID, updated_at: "2026-08-29T12:02:00.000Z" },
          run: { ...run, status: "APPLIED" },
        },
      }))
    global.fetch = fetchMock as unknown as typeof fetch
    const onApplied = jest.fn().mockResolvedValue(undefined)
    const onClose = jest.fn()

    render(
      <QuotationPriceRefreshDialog
        quotationId={QUOTATION_ID}
        onClose={onClose}
        onApplied={onApplied}
      />
    )

    expect(await screen.findByText("Precio actualizado")).toBeInTheDocument()
    expect(screen.getByText("Equipaje despachado: sí → no")).toBeInTheDocument()

    const startCall = fetchMock.mock.calls[1]
    expect(startCall[0]).toBe("/api/quotations/" + QUOTATION_ID + "/price-refresh")
    const startBody = JSON.parse(String((startCall[1] as RequestInit).body))
    expect(startBody).toEqual(expect.objectContaining({
      expected_updated_at: SOURCE_VERSION,
      idempotency_key: expect.any(String),
    }))
    expect(JSON.stringify(startBody)).not.toMatch(/provider|offer_handle|mode/)

    const apply = screen.getByRole("button", { name: "Aplicar y emitir nueva versión" })
    expect(apply).toBeDisabled()

    const saleTotal = screen.getByLabelText("Precio final al pasajero (USD)") as HTMLInputElement
    await waitFor(() => expect(saleTotal).toHaveValue(1250))
    fireEvent.click(screen.getByLabelText("Usar actualizado"))
    await waitFor(() => expect(saleTotal).toHaveValue(1350))
    fireEvent.click(screen.getByLabelText("Mantener actual"))
    await waitFor(() => expect(saleTotal).toHaveValue(1250))
    fireEvent.click(screen.getByLabelText("Usar actualizado"))
    await waitFor(() => expect(saleTotal).toHaveValue(1350))
    fireEvent.click(screen.getByLabelText("Confirmo este precio de venta"))
    expect(apply).not.toBeDisabled()
    fireEvent.click(apply)

    await waitFor(() => expect(onApplied).toHaveBeenCalledTimes(1))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith(
      "Precios actualizados. Se generó una nueva versión del documento."
    )

    const applyBody = JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body))
    expect(applyBody).toEqual({
      expected_updated_at: SOURCE_VERSION,
      expected_run_updated_at: RUN_VERSION,
      decisions: [{
        line_id: "line-flight",
        action: "USE_REFRESHED",
      }],
      option_decisions: [{
        option_id: OPTION_ID,
        sale_total: 1350,
        confirmed: true,
      }],
    })
    expect(JSON.stringify(applyBody)).not.toMatch(/provider|offer_handle|mode/)
  })

  it("exige elegir una alternativa y la envía como decisión genérica", async () => {
    const run = reviewRun({
      summary: {
        ...reviewRun().summary,
        price_changed_count: 0,
        replacement_count: 1,
        options: [{
          ...(reviewRun().summary as any).options[0],
          manual_total_requires_confirmation: false,
        }],
      },
      items: [{
        line_id: "line-hotel",
        option_id: OPTION_ID,
        option_title: "Opción Caribe",
        quotation_item_id: "item-hotel",
        item_type: "HOTEL",
        label: "Hotel Arena",
        outcome: "REPLACEMENT_FOUND",
        current: { cost_amount: 700, sale_amount: 900, currency: "USD" },
        candidates: [{
          id: "candidate-1",
          label: "Hotel Arena · habitación superior",
          cost_amount: 760,
          currency: "USD",
        }],
        allowed_actions: ["USE_REPLACEMENT", "KEEP_CURRENT"],
        requires_decision: true,
      }],
    })
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(response({
        data: {
          quotation_number: "COT-2026-0008",
          updated_at: SOURCE_VERSION,
        },
      }))
      .mockResolvedValueOnce(response({ data: { run } }))
      .mockResolvedValueOnce(response({ data: { run: { ...run, status: "APPLIED" } } }))
    global.fetch = fetchMock as unknown as typeof fetch

    render(
      <QuotationPriceRefreshDialog
        quotationId={QUOTATION_ID}
        onClose={jest.fn()}
        onApplied={jest.fn()}
      />
    )

    const apply = await screen.findByRole("button", { name: "Aplicar y emitir nueva versión" })
    expect(apply).toBeDisabled()
    fireEvent.change(screen.getByRole("combobox", { name: "Alternativa" }), {
      target: { value: "candidate-1" },
    })
    expect(apply).not.toBeDisabled()
    fireEvent.click(apply)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    const applyBody = JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body))
    expect(applyBody.decisions).toEqual([{
      line_id: "line-hotel",
      action: "USE_REPLACEMENT",
      candidate_id: "candidate-1",
    }])
  })

  it("muestra un conflicto de versión y no informa éxito", async () => {
    const run = reviewRun({
      summary: {
        ...reviewRun().summary,
        options: [{
          ...(reviewRun().summary as any).options[0],
          manual_total_requires_confirmation: false,
        }],
      },
    })
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(response({
        data: {
          quotation_number: "COT-2026-0009",
          updated_at: SOURCE_VERSION,
        },
      }))
      .mockResolvedValueOnce(response({ data: { run } }))
      .mockResolvedValueOnce(response({
        error: "stale",
        code: "STALE_QUOTATION",
      }, false, 409))
    global.fetch = fetchMock as unknown as typeof fetch
    const onApplied = jest.fn()

    render(
      <QuotationPriceRefreshDialog
        quotationId={QUOTATION_ID}
        onClose={jest.fn()}
        onApplied={onApplied}
      />
    )

    fireEvent.click(await screen.findByLabelText("Usar actualizado"))
    fireEvent.click(screen.getByRole("button", { name: "Aplicar y emitir nueva versión" }))

    expect(await screen.findByText(
      "La cotización cambió mientras la revisabas. Volvé a consultar antes de aplicar."
    )).toBeInTheDocument()
    expect(onApplied).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("descarta el review con CAS antes de volver a consultar", async () => {
    const firstRun = reviewRun()
    const secondRun = reviewRun({
      id: "44444444-4444-4444-8444-444444444444",
      updated_at: "2026-08-29T12:03:00.000Z",
    })
    const quotationPayload = response({
      data: {
        quotation_number: "COT-2026-0010",
        updated_at: SOURCE_VERSION,
      },
    })
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(quotationPayload)
      .mockResolvedValueOnce(response({ data: { run: firstRun } }))
      .mockResolvedValueOnce(response({ data: { run: { ...firstRun, status: "STALE" } } }))
      .mockResolvedValueOnce(quotationPayload)
      .mockResolvedValueOnce(response({ data: { run: secondRun } }))
    global.fetch = fetchMock as unknown as typeof fetch

    render(
      <QuotationPriceRefreshDialog
        quotationId={QUOTATION_ID}
        onClose={jest.fn()}
        onApplied={jest.fn()}
      />
    )

    fireEvent.click(await screen.findByRole("button", { name: "Descartar y volver a consultar" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5))
    expect(fetchMock.mock.calls[2][0]).toBe(
      "/api/quotations/" + QUOTATION_ID + "/price-refresh/" + RUN_ID
    )
    expect(fetchMock.mock.calls[2][1]).toEqual(expect.objectContaining({ method: "DELETE" }))
    expect(JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body))).toEqual({
      expected_run_updated_at: RUN_VERSION,
    })
    expect(await screen.findByRole("button", { name: "Aplicar y emitir nueva versión" })).toBeInTheDocument()
  })
})
