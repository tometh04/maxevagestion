import { render, screen, waitFor } from "@testing-library/react"
import { PermissionsProvider } from "@/components/permissions/permissions-provider"
import { SidebarProvider } from "@/components/ui/sidebar"
import { ToursProvider, useTours } from "@/components/tours/tours-provider"
import { EmiliaCrmDiscovery } from "../emilia-crm-discovery"

jest.mock("next/navigation", () => ({
  usePathname: () => "/sales/crm-manychat",
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

const seen = (status: "completed" | "dismissed" | "preexisting" | "in_progress") => ({
  status,
  lastStepIndex: 0,
  startedAt: "2026-08-01T10:00:00.000Z",
  completedAt: status === "completed" ? "2026-08-01T10:05:00.000Z" : null,
  dismissedAt: status === "dismissed" ? "2026-08-01T10:02:00.000Z" : null,
})

function ActiveTourProbe() {
  const { activeTour } = useTours()
  return <output data-testid="active-tour">{activeTour?.id ?? "none"}</output>
}

function renderDiscovery(initialUserState: unknown, role: "SELLER" | "VIEWER" = "SELLER") {
  return render(
    <PermissionsProvider role={role} matrix={null}>
      <SidebarProvider>
        <ToursProvider
          initialUserState={initialUserState}
          initialOrgSetupState={null}
          roles={[role]}
          canRunSetup={false}
        >
          <EmiliaCrmDiscovery />
          <ActiveTourProbe />
        </ToursProvider>
      </SidebarProvider>
    </PermissionsProvider>
  )
}

describe("descubrimiento de Emilia al abrir el CRM", () => {
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

  beforeEach(() => {
    global.fetch = jest.fn(async () => new Response("{}", { status: 200 })) as typeof fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it.each(["completed", "dismissed", "preexisting", "in_progress"] as const)(
    "muestra solo la novedad si la guía del CRM ya estaba %s",
    async (crmStatus) => {
      renderDiscovery({
        version: 1,
        seenTours: { "crm-kanban": seen(crmStatus) },
        toursDisabled: false,
      })

      await waitFor(
        () => expect(screen.getByTestId("active-tour")).toHaveTextContent("crm-emilia-discovery"),
        { timeout: 2500 }
      )
    }
  )

  it("deja correr la guía completa del CRM cuando el usuario es nuevo", async () => {
    renderDiscovery({ version: 1, seenTours: {}, toursDisabled: false })

    await waitFor(
      () => expect(screen.getByTestId("active-tour")).toHaveTextContent("crm-kanban"),
      { timeout: 2500 }
    )
    expect(screen.getByTestId("active-tour")).not.toHaveTextContent("crm-emilia-discovery")
  })

  it.each([
    {
      caseName: "la novedad ya fue vista",
      state: {
        version: 1,
        seenTours: {
          "crm-kanban": seen("completed"),
          "crm-emilia-discovery": seen("completed"),
        },
        toursDisabled: false,
      },
    },
    {
      caseName: "las guías están desactivadas",
      state: {
        version: 1,
        seenTours: { "crm-kanban": seen("completed") },
        toursDisabled: true,
      },
    },
  ])("no interrumpe cuando $caseName", async ({ state }) => {
    renderDiscovery(state)

    await new Promise((resolve) => window.setTimeout(resolve, 1000))
    expect(screen.getByTestId("active-tour")).toHaveTextContent("none")
  })

  it("no muestra la novedad sin permiso para cotizar leads", async () => {
    renderDiscovery(
      {
        version: 1,
        seenTours: { "crm-kanban": seen("completed") },
        toursDisabled: false,
      },
      "VIEWER"
    )

    await new Promise((resolve) => window.setTimeout(resolve, 1000))
    expect(screen.getByTestId("active-tour")).toHaveTextContent("none")
  })
})
