import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useState } from "react"
import { PermissionsProvider } from "@/components/permissions/permissions-provider"
import { SidebarProvider } from "@/components/ui/sidebar"
import { ToursProvider, useTours } from "@/components/tours/tours-provider"
import { LeadEmiliaChat } from "../lead-emilia-chat"

jest.mock("next/navigation", () => ({
  usePathname: () => "/sales/crm-manychat",
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

function ActiveTourProbe() {
  const { activeTour, availableTours, isUnseen, start } = useTours()
  return (
    <>
      <output data-testid="active-tour">{activeTour?.id ?? "none"}</output>
      <output data-testid="emilia-unseen">{isUnseen("cotizar-emilia") ? "yes" : "no"}</output>
      <output data-testid="available-tours">
        {availableTours.map(({ tour }) => tour.id).join(",")}
      </output>
      <button type="button" onClick={() => start("cotizar-emilia")}>Iniciar guía Emilia</button>
    </>
  )
}

function EmiliaChatHarness() {
  const [open, setOpen] = useState(true)
  if (!open) return <p>Detalle del lead abierto</p>
  return (
    <LeadEmiliaChat
      lead={{
        id: "lead-1",
        contact_name: "Cliente de prueba",
        destination: "Cancún",
        agency_id: "agency-1",
      }}
      initialConversation={{ id: "conversation-1" }}
      onBack={() => setOpen(false)}
    />
  )
}

describe("onboarding contextual de Emilia", () => {
  const originalFetch = global.fetch

  beforeAll(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: jest.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it("no ofrece ni inicia la guía contextual fuera del chat de Emilia", () => {
    global.fetch = jest.fn(async () => new Response("{}", { status: 200 })) as typeof fetch

    render(
      <PermissionsProvider role="SELLER" matrix={null}>
        <SidebarProvider>
          <ToursProvider
            initialUserState={null}
            initialOrgSetupState={null}
            roles={["SELLER"]}
            canRunSetup={false}
          >
            <ActiveTourProbe />
          </ToursProvider>
        </SidebarProvider>
      </PermissionsProvider>
    )

    expect(screen.getByTestId("available-tours")).not.toHaveTextContent("cotizar-emilia")
    fireEvent.click(screen.getByRole("button", { name: "Iniciar guía Emilia" }))
    expect(screen.getByTestId("active-tour")).toHaveTextContent("none")
    expect(screen.getByTestId("emilia-unseen")).toHaveTextContent("yes")
  })

  it("inicia la guía nueva en un chat autorizado y vacío aunque el CRM ya se haya recorrido", async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/suggested-prompt")) {
        return new Response(
          JSON.stringify({
            prompt: "Vuelo y hotel desde Buenos Aires a Cancún para 2 adultos",
          }),
          { status: 200 }
        )
      }
      if (url.includes("/api/emilia/conversations/conversation-1")) {
        return new Response(JSON.stringify({ messages: [] }), { status: 200 })
      }
      if (url === "/api/tours/state") {
        return new Response("{}", { status: 200 })
      }
      throw new Error(`Fetch inesperado en el test: ${url}`)
    }) as typeof fetch

    render(
      <PermissionsProvider role="SELLER" matrix={null}>
        <SidebarProvider>
          <ToursProvider
            initialUserState={{
              version: 1,
              seenTours: {
                "crm-kanban": {
                  status: "completed",
                  lastStepIndex: 4,
                  startedAt: "2026-08-01T10:00:00.000Z",
                  completedAt: "2026-08-01T10:05:00.000Z",
                  dismissedAt: null,
                },
              },
              toursDisabled: false,
            }}
            initialOrgSetupState={null}
            roles={["SELLER"]}
            canRunSetup={false}
          >
            <LeadEmiliaChat
              lead={{
                id: "lead-1",
                contact_name: "Cliente de prueba",
                destination: "Cancún",
                agency_id: "agency-1",
              }}
              initialConversation={{ id: "conversation-1" }}
              onBack={jest.fn()}
            />
            <ActiveTourProbe />
          </ToursProvider>
        </SidebarProvider>
      </PermissionsProvider>
    )

    await waitFor(
      () => expect(screen.getByTestId("active-tour")).toHaveTextContent("cotizar-emilia"),
      { timeout: 3000 }
    )
    expect(screen.getByRole("note", { name: /cómo pedirle una cotización a Emilia/i })).toBeVisible()
    expect(screen.getByLabelText("Pedido para Emilia")).toBeVisible()
  })

  it("permite volver a ver la guía desde el chat después de completarla", async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/suggested-prompt")) {
        return new Response(JSON.stringify({ prompt: "Vuelo y hotel a Cancún" }), { status: 200 })
      }
      if (url.includes("/api/emilia/conversations/conversation-1")) {
        return new Response(JSON.stringify({ messages: [] }), { status: 200 })
      }
      if (url === "/api/tours/state") return new Response("{}", { status: 200 })
      throw new Error(`Fetch inesperado en el test: ${url}`)
    }) as typeof fetch

    render(
      <PermissionsProvider role="SELLER" matrix={null}>
        <SidebarProvider>
          <ToursProvider
            initialUserState={{
              version: 1,
              seenTours: {
                "cotizar-emilia": {
                  status: "completed",
                  lastStepIndex: 2,
                  startedAt: "2026-08-01T10:00:00.000Z",
                  completedAt: "2026-08-01T10:05:00.000Z",
                  dismissedAt: null,
                },
              },
              toursDisabled: false,
            }}
            initialOrgSetupState={null}
            roles={["SELLER"]}
            canRunSetup={false}
          >
            <LeadEmiliaChat
              lead={{
                id: "lead-1",
                contact_name: "Cliente de prueba",
                destination: "Cancún",
                agency_id: "agency-1",
              }}
              initialConversation={{ id: "conversation-1" }}
              onBack={jest.fn()}
            />
            <ActiveTourProbe />
          </ToursProvider>
        </SidebarProvider>
      </PermissionsProvider>
    )

    expect(await screen.findByLabelText("Pedido para Emilia")).toBeVisible()
    expect(screen.getByTestId("active-tour")).toHaveTextContent("none")

    fireEvent.click(
      screen.getByRole("button", { name: "Ver cómo pedirle una cotización a Emilia" })
    )

    await waitFor(() =>
      expect(screen.getByTestId("active-tour")).toHaveTextContent("cotizar-emilia")
    )
  })

  it("aborta sin consumir la guía cuando el chat se desmonta", async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/suggested-prompt")) {
        return new Response(JSON.stringify({ prompt: "Vuelo y hotel a Cancún" }), { status: 200 })
      }
      if (url.includes("/api/emilia/conversations/conversation-1")) {
        return new Response(JSON.stringify({ messages: [] }), { status: 200 })
      }
      if (url === "/api/tours/state") return new Response("{}", { status: 200 })
      throw new Error(`Fetch inesperado en el test: ${url}`)
    }) as typeof fetch

    render(
      <PermissionsProvider role="SELLER" matrix={null}>
        <SidebarProvider>
          <ToursProvider
            initialUserState={null}
            initialOrgSetupState={null}
            roles={["SELLER"]}
            canRunSetup={false}
          >
            <EmiliaChatHarness />
            <ActiveTourProbe />
          </ToursProvider>
        </SidebarProvider>
      </PermissionsProvider>
    )

    await waitFor(() =>
      expect(screen.getByTestId("active-tour")).toHaveTextContent("cotizar-emilia")
    )

    fireEvent.click(screen.getByRole("button", { name: "Detalle del lead" }))

    await waitFor(() => expect(screen.getByTestId("active-tour")).toHaveTextContent("none"))
    expect(screen.getByTestId("emilia-unseen")).toHaveTextContent("yes")
  })

  it("conserva una guía completada si se desmonta durante un replay", async () => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/suggested-prompt")) {
        return new Response(JSON.stringify({ prompt: "Vuelo y hotel a Cancún" }), { status: 200 })
      }
      if (url.includes("/api/emilia/conversations/conversation-1")) {
        return new Response(JSON.stringify({ messages: [] }), { status: 200 })
      }
      if (url === "/api/tours/state") return new Response("{}", { status: 200 })
      throw new Error(`Fetch inesperado en el test: ${url}`)
    }) as typeof fetch

    render(
      <PermissionsProvider role="SELLER" matrix={null}>
        <SidebarProvider>
          <ToursProvider
            initialUserState={{
              version: 1,
              seenTours: {
                "cotizar-emilia": {
                  status: "completed",
                  lastStepIndex: 2,
                  startedAt: "2026-08-01T10:00:00.000Z",
                  completedAt: "2026-08-01T10:05:00.000Z",
                  dismissedAt: null,
                },
              },
              toursDisabled: false,
            }}
            initialOrgSetupState={null}
            roles={["SELLER"]}
            canRunSetup={false}
          >
            <EmiliaChatHarness />
            <ActiveTourProbe />
          </ToursProvider>
        </SidebarProvider>
      </PermissionsProvider>
    )

    expect(await screen.findByLabelText("Pedido para Emilia")).toBeVisible()
    fireEvent.click(
      screen.getByRole("button", { name: "Ver cómo pedirle una cotización a Emilia" })
    )
    await waitFor(() =>
      expect(screen.getByTestId("active-tour")).toHaveTextContent("cotizar-emilia")
    )

    fireEvent.click(screen.getByRole("button", { name: "Detalle del lead" }))

    await waitFor(() => expect(screen.getByTestId("active-tour")).toHaveTextContent("none"))
    expect(screen.getByTestId("emilia-unseen")).toHaveTextContent("no")
  })
})
