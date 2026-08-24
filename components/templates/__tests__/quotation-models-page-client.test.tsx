/// <reference types="@testing-library/jest-dom" />
import React from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { toast } from "sonner"
import { QuotationModelsPageClient } from "../quotation-models-page-client"

jest.mock("lucide-react", () => new Proxy({ __esModule: true }, {
  get: (target, prop) => prop in target
    ? target[prop as keyof typeof target]
    : (props: any) => <svg data-icon={String(prop)} {...props} />,
}))

jest.mock("sonner", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}))

jest.mock("@/components/ui/badge", () => ({
  Badge: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}))
jest.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}))
jest.mock("@/components/ui/card", () => ({
  Card: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardDescription: ({ children, ...props }: any) => <p {...props}>{children}</p>,
  CardHeader: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardTitle: ({ children, ...props }: any) => <h2 {...props}>{children}</h2>,
}))
jest.mock("@/components/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}))
jest.mock("@/components/ui/label", () => ({
  Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
}))
jest.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}))
jest.mock("@/components/ui/select", () => ({
  Select: ({ children, disabled, onValueChange, value }: any) => {
    const label = !value
      ? "Seleccionar agencia"
      : value === "vibook-standard-v1"
        ? "Diseño base"
        : "Agencia seleccionada"
    return (
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={() => onValueChange?.("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")}
      >
        {children}
      </button>
    )
  },
  SelectContent: ({ children }: any) => <span>{children}</span>,
  SelectItem: ({ children }: any) => <span>{children}</span>,
  SelectTrigger: ({ children }: any) => <span>{children}</span>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
}))
jest.mock("@/components/ui/separator", () => ({
  Separator: () => <hr />,
}))
jest.mock("@/components/ui/switch", () => ({
  Switch: ({ checked, onCheckedChange, ...props }: any) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange?.(!checked)}
      {...props}
    />
  ),
}))
jest.mock("@/components/ui/textarea", () => ({
  Textarea: (props: any) => <textarea {...props} />,
}))

const AGENCY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const MODEL_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const REVISION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const VERSION = "2026-08-24T12:00:00.000Z"

const workspace = {
  agencies: [{ id: AGENCY_ID, name: "Agencia Norte" }],
  layouts: [{
    key: "vibook-standard-v1",
    version: 1,
    name: "Vibook estándar",
    description: "",
    supports: [],
  }],
  models: [],
  activeRevisionId: null,
}

describe("QuotationModelsPageClient", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("locks the agency, editor and actions while the submitted draft is saving", async () => {
    let resolveSave: ((value: unknown) => void) | undefined
    const savePending = new Promise(resolve => { resolveSave = resolve })
    const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (init?.method === "PUT") return savePending
      if (url.endsWith("/preview")) {
        return Promise.resolve({ ok: true, json: async () => ({ document: { html: "<div />", pageCount: 1 } }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({ data: workspace }) })
    })
    global.fetch = fetchMock as unknown as typeof fetch

    render(<QuotationModelsPageClient />)

    const agencySelect = await screen.findByRole("button", { name: "Seleccionar agencia" })
    fireEvent.click(agencySelect)

    const modelName = await screen.findByLabelText("Nombre interno")
    const save = screen.getByRole("button", { name: "Guardar" })
    await waitFor(() => expect(save).not.toBeDisabled())
    fireEvent.click(save)

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Agencia seleccionada" })).toBeDisabled()
      expect(modelName).toBeDisabled()
      expect(screen.getByRole("button", { name: "Diseño base" })).toBeDisabled()
      expect(screen.getAllByRole("switch")[0]).toBeDisabled()
      expect(save).toBeDisabled()
      expect(screen.getByRole("button", { name: "Publicar" })).toBeDisabled()
    })

    resolveSave?.({
      ok: true,
      json: async () => ({
        data: {
          model: { id: MODEL_ID },
          revision: { id: REVISION_ID, updated_at: VERSION },
        },
      }),
    })
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Borrador guardado"))
  })

  it("persists the agency-specific logo and contact branding in the manifest", async () => {
    let savedBody: any
    const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (init?.method === "PUT") {
        savedBody = JSON.parse(String(init.body))
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: {
              model: { id: MODEL_ID },
              revision: { id: REVISION_ID, updated_at: VERSION },
            },
          }),
        })
      }
      if (url.endsWith("/preview")) {
        return Promise.resolve({ ok: true, json: async () => ({ document: { html: "<div />", pageCount: 1 } }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({ data: workspace }) })
    })
    global.fetch = fetchMock as unknown as typeof fetch

    render(<QuotationModelsPageClient />)
    fireEvent.click(await screen.findByRole("button", { name: "Seleccionar agencia" }))

    fireEvent.change(await screen.findByLabelText("Logo del PDF"), {
      target: { value: "/quotation-models/agencia-norte/logo.png" },
    })
    fireEvent.change(screen.getByLabelText("Razón social"), {
      target: { value: "Agencia Norte Viajes SRL" },
    })
    fireEvent.change(screen.getByLabelText("Sitio web"), {
      target: { value: "https://agencianorte.example" },
    })
    fireEvent.change(screen.getByLabelText("Instagram"), {
      target: { value: "@agencianorte" },
    })
    fireEvent.change(screen.getByLabelText("Dirección"), {
      target: { value: "Av. Norte 123" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }))

    await waitFor(() => expect(savedBody).toBeDefined())
    expect(savedBody.manifest).toEqual(expect.objectContaining({
      assets: expect.objectContaining({ logoPath: "/quotation-models/agencia-norte/logo.png" }),
      branding: expect.objectContaining({
        legalName: "Agencia Norte Viajes SRL",
        website: "https://agencianorte.example",
        instagram: "@agencianorte",
        address: "Av. Norte 123",
      }),
    }))
  })
})
