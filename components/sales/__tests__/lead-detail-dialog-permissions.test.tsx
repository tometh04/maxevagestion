import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { toast } from "sonner"
import { PermissionsProvider } from "@/components/permissions/permissions-provider"
import { buildDefaultMatrix } from "@/lib/permissions/resolved"
import { LeadDetailDialog } from "../lead-detail-dialog"
import { detectBrowserOriginCity } from "@/lib/emilia/browser-geolocation"

jest.mock("@/lib/emilia/browser-geolocation", () => ({ detectBrowserOriginCity: jest.fn() }))
jest.mock("../lead-emilia-chat", () => ({ LeadEmiliaChat: () => <div>Chat de cotización</div> }))

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }))

jest.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div role="menu">{children}</div>,
  DropdownMenuItem: ({ children, ...props }: React.HTMLAttributes<HTMLButtonElement>) => (
    <button role="menuitem" {...props}>{children}</button>
  ),
  DropdownMenuSeparator: () => <hr />,
}))

const LEAD = {
  id: "lead-1",
  contact_name: "Cliente de prueba",
  contact_phone: "+54 11 5555 5555",
  contact_email: null,
  contact_instagram: null,
  destination: "Cancún",
  region: "CARIBE",
  status: "NEW",
  source: "Manual",
  trello_url: null,
  trello_list_id: null,
  assigned_seller_id: "seller-1",
  agency_id: "agency-1",
  created_at: "2026-08-30T10:00:00.000Z",
  notes: null,
  operations: [],
}

describe("permisos para cotizar desde el detalle del lead", () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    // El gate de permisos es sincrónico. Dejamos las cargas laterales pendientes
    // para probar solamente la acción pública sin acoplar el test a comentarios,
    // documentos o cotizaciones.
    global.fetch = jest.fn(() => new Promise<Response>(() => {})) as typeof fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it.each([403, 500])("informa el error de Emilia sin abrir un cotizador manual: %s", async (status) => {
    global.fetch = jest.fn((url) => {
      if (String(url) === "/api/quotation-quota") return Promise.resolve({ ok: true, json: async () => ({}) })
      if (String(url) === "/api/leads/lead-1/emilia") return Promise.resolve({
        ok: false, status, json: async () => status === 403 ? { code: "emilia_plan_required" } : {},
      })
      return new Promise(() => {})
    }) as typeof fetch
    render(<PermissionsProvider role="ADMIN" matrix={buildDefaultMatrix("ADMIN")}>
      <LeadDetailDialog lead={LEAD} open onOpenChange={jest.fn()} />
    </PermissionsProvider>)
    fireEvent.click(screen.getByRole("button", { name: "Cotizar" }))
    await waitFor(() => expect(status === 403 ? toast.info : toast.error).toHaveBeenCalledWith(
      status === 403 ? "Tu plan no incluye Emilia. Consultá con el administrador de tu agencia."
        : "Emilia no está disponible en este momento. Intentá nuevamente."
    ))
    expect(screen.getAllByRole("dialog")).toHaveLength(1)
  })

  it("no muestra Cotizar cuando la matriz resuelta quita leads.write", () => {
    const matrix = buildDefaultMatrix("SELLER")
    matrix.leads = { ...matrix.leads, write: false }

    render(
      <PermissionsProvider role="SELLER" matrix={matrix}>
        <LeadDetailDialog
          lead={LEAD}
          open
          onOpenChange={jest.fn()}
        />
      </PermissionsProvider>
    )

    expect(screen.queryByRole("button", { name: "Cotizar" })).not.toBeInTheDocument()
  })

  it("muestra Cotizar cuando la matriz resuelta concede leads.write", () => {
    const matrix = buildDefaultMatrix("VIEWER")
    matrix.leads = { ...matrix.leads, read: true, write: true }

    render(
      <PermissionsProvider role="VIEWER" matrix={matrix}>
        <LeadDetailDialog
          lead={LEAD}
          open
          onOpenChange={jest.fn()}
        />
      </PermissionsProvider>
    )

    expect(screen.getByRole("button", { name: "Cotizar" })).toBeInTheDocument()
  })

  it("ofrece convertir y reservar al aprobarla o confirmar su precio", async () => {
    const matrix = buildDefaultMatrix("SELLER")
    global.fetch = jest.fn(async input => {
      const url = String(input)
      if (url.startsWith("/api/quotations?lead_id=")) {
        return {
          ok: true,
          json: async () => ({ data: [
            {
              id: "quotation-approved",
              quotation_number: "COT-APPROVED",
              status: "APPROVED",
              total_amount: 4000,
              currency: "USD",
              destination: "Cancún",
              created_at: "2026-09-01T12:00:00.000Z",
              valid_until: null,
              public_token: "approved-token",
              active_document_id: "document-approved",
              adults: 2,
              children: 0,
              infants: 0,
            },
            {
              id: "quotation-price-confirmed",
              quotation_number: "COT-PRICE-CONFIRMED",
              status: "DRAFT",
              total_amount: 4000,
              currency: "USD",
              destination: "Cancún",
              created_at: "2026-09-01T12:00:00.000Z",
              valid_until: null,
              public_token: "draft-token",
              active_document_id: "document-draft",
              adults: 2,
              children: 0,
              infants: 0,
              price_confirmation: {
                confirmed: true,
                run_id: "33333333-3333-4333-8333-333333333333",
                valid_until: "2099-09-01T12:15:00.000Z",
                applied_at: "2026-09-01T12:00:00.000Z",
              },
              quotation_options: [{ id: "44444444-4444-4444-8444-444444444444", title: "Opción 1", total_amount: 4000 }],
            },
            {
              id: "quotation-unconfirmed",
              quotation_number: "COT-UNCONFIRMED",
              status: "DRAFT",
              total_amount: 4000,
              currency: "USD",
              destination: "Cancún",
              created_at: "2026-09-01T12:00:00.000Z",
              valid_until: null,
              public_token: "unconfirmed-token",
              active_document_id: "document-unconfirmed",
              price_confirmation: { confirmed: false, run_id: null, valid_until: null, applied_at: null },
            },
          ] }),
        } as Response
      }
      return new Promise<Response>(() => {})
    }) as typeof fetch

    render(
      <PermissionsProvider role="SELLER" matrix={matrix}>
        <LeadDetailDialog
          lead={LEAD}
          open
          onOpenChange={jest.fn()}
        />
      </PermissionsProvider>
    )

    await screen.findAllByRole("button", { name: "Convertir y reservar" })
    const convert = screen.getAllByRole("button", { name: "Convertir y reservar" })
    expect(convert).toHaveLength(2)
    expect(screen.getAllByText("COT-UNCONFIRMED")).toHaveLength(1)
    fireEvent.click(convert[1])
    expect(await screen.findByRole("heading", { name: "Convertir y reservar con Delfos" })).toBeInTheDocument()
  })
  it("abre el chat sin esperar la ubicación del navegador", async () => {
    jest.mocked(detectBrowserOriginCity).mockReturnValue(new Promise(() => {}))
    global.fetch = jest.fn((url) => {
      if (String(url) === "/api/quotation-quota" || String(url).endsWith("/emilia")) {
        return Promise.resolve({ ok: true, json: async () => ({ data: null }) })
      }
      return new Promise(() => {})
    }) as typeof fetch
    render(<PermissionsProvider role="ADMIN" matrix={buildDefaultMatrix("ADMIN")}>
      <LeadDetailDialog lead={LEAD} open onOpenChange={jest.fn()} />
    </PermissionsProvider>)
    fireEvent.click(screen.getByText("Cotizar", { exact: true }))
    expect(await screen.findByText("Chat de cotización")).toBeInTheDocument()
  })

  it.each(["quota", "access"])("mantiene el bloqueo por %s y evita clics repetidos", async (blockedBy) => {
    let finishQuota!: (value: unknown) => void
    const quota = new Promise((resolve) => { finishQuota = resolve })
    global.fetch = jest.fn((url) => {
      if (String(url) === "/api/quotation-quota") return quota
      if (String(url).endsWith("/emilia")) return Promise.resolve({
        ok: blockedBy !== "access", status: blockedBy === "access" ? 403 : 200,
        json: async () => ({ error: "Sin acceso", data: null }),
      })
      return new Promise(() => {})
    }) as typeof fetch
    render(<PermissionsProvider role="ADMIN" matrix={buildDefaultMatrix("ADMIN")}>
      <LeadDetailDialog lead={LEAD} open onOpenChange={jest.fn()} />
    </PermissionsProvider>)
    fireEvent.click(screen.getByRole("button", { name: "Cotizar" }))
    // Ambos controles arrancan incluso con la cuota pendiente.
    expect(global.fetch).toHaveBeenCalledWith("/api/leads/lead-1/emilia")
    const opening = screen.getByRole("button", { name: "Abriendo..." })
    expect(opening).toBeDisabled()
    fireEvent.click(opening)
    expect(jest.mocked(global.fetch).mock.calls.filter(([url]) => url === "/api/quotation-quota")).toHaveLength(1)
    await act(async () => finishQuota({ ok: true, json: async () => ({
      usage: { enforcement_enabled: true, at_limit: blockedBy === "quota" },
    }) }))
    expect(screen.queryByText("Chat de cotización")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Cotizar" })).toBeEnabled()
  })
})

describe("eliminar cotizaciones desde el lead", () => {
  const originalFetch = global.fetch
  const quotation = {
    id: "quote-1", quotation_number: "COT-001", status: "DRAFT",
    total_amount: 100, currency: "USD", destination: "Cancún",
    created_at: "2026-09-05T10:00:00.000Z", valid_until: null, public_token: null,
    active_document_id: null,
  }

  function setup({ canDelete = true, status = "DRAFT", documentId = null as string | null } = {}) {
    const deleteRequest = jest.fn().mockResolvedValue({ ok: true })
    global.fetch = jest.fn((url, options) => {
      if (options?.method === "DELETE") return deleteRequest()
      if (String(url).startsWith("/api/quotations?")) {
        return Promise.resolve({ ok: true, json: async () => ({
          data: [{ ...quotation, status, active_document_id: documentId }],
        }) })
      }
      return new Promise(() => {})
    }) as typeof fetch
    const matrix = buildDefaultMatrix("ADMIN")
    matrix.leads = { ...matrix.leads, delete: canDelete }
    render(
      <PermissionsProvider role="ADMIN" matrix={matrix}>
        <LeadDetailDialog lead={LEAD} open onOpenChange={jest.fn()} />
      </PermissionsProvider>
    )
    return deleteRequest
  }

  afterEach(() => {
    global.fetch = originalFetch
    jest.clearAllMocks()
  })

  it.each([
    { canDelete: false },
    { status: "SENT" },
    { status: "ACCEPTED" },
    { documentId: "document-1" },
  ])("respeta permisos y cotizaciones protegidas: %j", async (options) => {
    setup(options)
    await screen.findByText("COT-001")
    expect(screen.queryByRole("button", { name: "Eliminar cotización COT-001" })).not.toBeInTheDocument()
  })

  it("permite cancelar sin borrar", async () => {
    const deleteRequest = setup()
    await screen.findByText("COT-001")
    expect(screen.queryByRole("button", { name: "Nueva" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Subir" })).not.toBeInTheDocument()
    expect(screen.queryByTitle("Editar servicios y opciones")).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole("button", { name: "Eliminar cotización COT-001" }))
    expect(screen.getByRole("alertdialog")).toHaveTextContent("COT-001")
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(deleteRequest).not.toHaveBeenCalled()
    expect(screen.getByText("COT-001")).toBeInTheDocument()
  })

  it("confirma el borrado y actualiza el listado sin recargar", async () => {
    setup()
    fireEvent.click(await screen.findByRole("button", { name: "Eliminar cotización COT-001" }))
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }))
    await waitFor(() => expect(screen.queryByText("COT-001")).not.toBeInTheDocument())
    expect(global.fetch).toHaveBeenCalledWith("/api/quotations/quote-1", { method: "DELETE" })
    expect(screen.getByText("Cotizaciones (0)")).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith("Cotización eliminada")
  })

  it("bloquea envíos repetidos y conserva la cotización ante un conflicto", async () => {
    const deleteRequest = setup()
    let finish!: (response: unknown) => void
    deleteRequest.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    fireEvent.click(await screen.findByRole("button", { name: "Eliminar cotización COT-001" }))
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }))
    expect(screen.getByRole("button", { name: "Eliminando..." })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled()
    finish({ ok: false, json: async () => ({ error: "La cotización cambió y ya no se puede eliminar" }) })
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("La cotización cambió y ya no se puede eliminar"))
    expect(screen.getByRole("alertdialog")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Eliminar" })).toBeEnabled()
    expect(deleteRequest).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(screen.getByText("COT-001")).toBeInTheDocument()
  })
})
