import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { AddonsStore } from "@/components/billing/addons-store"

/**
 * La vitrina toma decisiones de plata con lo que devuelve el endpoint, así que
 * lo que se prueba acá es eso: qué se ofrece, qué se administra y qué se cobra.
 * Los estados de carga, error y vacío entran también porque son la mitad de la
 * pantalla el día que algo falla.
 */

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}))

function addon(over: Record<string, unknown> = {}) {
  return {
    key: "library",
    name: "Biblioteca",
    description: "Material de capacitación para tu equipo.",
    highlights: ["Archivos y links", "Por rol", "Se capacitan solos"],
    category: "modulos",
    selfServe: true,
    setupNote: null,
    state: "OFF",
    includedInPlan: false,
    includedUntil: null,
    priceArsMonthly: 0,
    listPriceArsMonthly: 9000,
    cancelEffectiveAt: null,
    availableInCatalog: true,
    ...over,
  }
}

function payload(addons: unknown[], over: Record<string, unknown> = {}) {
  return {
    addons,
    totals: { nowArs: 139000, nextCycleArs: 139000 },
    nextChargeAt: "2026-09-15T00:00:00.000Z",
    mpSyncState: "SYNCED",
    ...over,
  }
}

function mockFetch(json: unknown, ok = true) {
  const fn = jest.fn().mockResolvedValue({ ok, json: async () => json })
  ;(global as any).fetch = fn
  return fn
}

afterEach(() => {
  jest.clearAllMocks()
})

describe("AddonsStore", () => {
  it("muestra el esqueleto mientras carga", () => {
    ;(global as any).fetch = jest.fn(() => new Promise(() => {}))
    const { container } = render(<AddonsStore />)
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument()
  })

  it("si el endpoint falla ofrece reintentar", async () => {
    mockFetch({}, false)
    render(<AddonsStore />)
    expect(await screen.findByText("No pudimos cargar los complementos.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument()
  })

  it("sin catálogo publicado ni nada contratado, explica que todavía no hay", async () => {
    mockFetch(payload([]))
    render(<AddonsStore />)
    expect(
      await screen.findByText("Todavía no hay complementos disponibles")
    ).toBeInTheDocument()
  })

  it("lo que se puede contratar se ofrece con su precio y su argumento", async () => {
    mockFetch(payload([addon()]))
    render(<AddonsStore />)

    expect(await screen.findByText("Para sumar a tu cuenta")).toBeInTheDocument()
    expect(screen.getByText("Módulos")).toBeInTheDocument()
    expect(screen.getByText("Archivos y links")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Activar" })).toBeInTheDocument()
    expect(screen.queryByText("Los que ya tenés")).not.toBeInTheDocument()
  })

  it("sin precio publicado no se activa solo: se solicita", async () => {
    mockFetch(payload([addon({ listPriceArsMonthly: null })]))
    render(<AddonsStore />)

    expect(await screen.findByRole("button", { name: "Solicitar" })).toBeInTheDocument()
    expect(screen.getByText("A consultar")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Activar" })).not.toBeInTheDocument()
  })

  it("el que requiere setup nuestro se solicita aunque tenga precio", async () => {
    mockFetch(
      payload([
        addon({
          key: "wha_control",
          name: "WHA Control",
          selfServe: false,
          category: "integraciones",
          setupNote: "Hay que vincular cada dispositivo.",
        }),
      ])
    )
    render(<AddonsStore />)

    expect(await screen.findByRole("button", { name: "Solicitar" })).toBeInTheDocument()
    expect(screen.getByText("Hay que vincular cada dispositivo.")).toBeInTheDocument()
  })

  it("lo contratado se administra arriba y no se vuelve a ofrecer", async () => {
    mockFetch(
      payload([addon({ state: "ACTIVE", priceArsMonthly: 9000 })], {
        totals: { nowArs: 148000, nextCycleArs: 148000 },
      })
    )
    render(<AddonsStore />)

    expect(await screen.findByText("Los que ya tenés")).toBeInTheDocument()
    expect(screen.getByText("$ 9.000 por mes")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Dar de baja" })).toBeInTheDocument()
    expect(screen.queryByText("Para sumar a tu cuenta")).not.toBeInTheDocument()
  })

  it("un complemento contratado que ya no se publica se sigue pudiendo administrar", async () => {
    mockFetch(payload([addon({ state: "ACTIVE", availableInCatalog: false, priceArsMonthly: 9000 })]))
    render(<AddonsStore />)

    expect(await screen.findByText("Los que ya tenés")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Dar de baja" })).toBeInTheDocument()
  })

  it("incluido en el plan no se cobra ni se puede dar de baja", async () => {
    mockFetch(payload([addon({ key: "emilia", name: "Emilia IA", state: "INCLUDED", includedInPlan: true })]))
    render(<AddonsStore />)

    expect(await screen.findByText(/Incluido en tu plan/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Dar de baja" })).not.toBeInTheDocument()
  })

  it("una solicitud pendiente se puede retirar", async () => {
    mockFetch(payload([addon({ state: "REQUESTED", setupNote: "Te escribimos en 24 h." })]))
    render(<AddonsStore />)

    expect(await screen.findByText("En preparación")).toBeInTheDocument()
    expect(screen.getByText("Te escribimos en 24 h.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Cancelar solicitud" })).toBeInTheDocument()
  })

  it("una baja programada avisa hasta cuándo y se puede deshacer", async () => {
    mockFetch(
      payload([
        addon({
          state: "SCHEDULED_CANCEL",
          priceArsMonthly: 9000,
          cancelEffectiveAt: "2026-09-15T00:00:00.000Z",
        }),
      ])
    )
    render(<AddonsStore />)

    expect(await screen.findByText(/Se da de baja el/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Reactivar" })).toBeInTheDocument()
  })

  it("antes de activar dice cómo queda la factura y desde cuándo", async () => {
    const fetchMock = mockFetch(payload([addon()]))
    render(<AddonsStore />)

    await userEvent.click(await screen.findByRole("button", { name: "Activar" }))

    // 139.000 + 9.000, a partir del próximo cobro y sin prorrateo.
    expect(await screen.findByText(/\$ 148\.000/)).toBeInTheDocument()
    expect(screen.getByText(/Hasta esa fecha no se cobra nada extra/)).toBeInTheDocument()
    // Todavía no se escribió nada: solo se leyó el catálogo al montar.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("avisa cuando el importe quedó esperando la autorización de Mercado Pago", async () => {
    mockFetch(payload([addon()], { mpSyncState: "PENDING_REAUTH" }))
    render(<AddonsStore />)

    expect(
      await screen.findByText(/necesita que lo confirmes con Mercado Pago/)
    ).toBeInTheDocument()
  })
})
