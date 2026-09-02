import { fireEvent, render, screen } from "@testing-library/react"
import { PermissionsProvider } from "@/components/permissions/permissions-provider"
import { buildDefaultMatrix } from "@/lib/permissions/resolved"
import { LeadDetailDialog } from "../lead-detail-dialog"

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

    expect(screen.queryByRole("menuitem", { name: "Cotizar" })).not.toBeInTheDocument()
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

    expect(screen.getByRole("menuitem", { name: "Cotizar" })).toBeInTheDocument()
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
})
