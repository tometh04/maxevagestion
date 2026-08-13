/**
 * @jest-environment jsdom
 */
jest.mock("../config", () => ({
  GA_MEASUREMENT_ID: "G-TEST1234",
  GA_DEBUG: true,
  isGaConfigured: () => true,
  isGaEnabled: jest.fn(() => true),
}))

import { isGaEnabled } from "../config"
import {
  clearAnalyticsUser,
  sanitizeReferrer,
  setAnalyticsUser,
  trackEvent,
  trackPageView,
} from "../track"

const mockedIsGaEnabled = isGaEnabled as jest.MockedFunction<typeof isGaEnabled>

const UUID = "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"

type Hit = unknown[]

function hits(): Hit[] {
  const layer = (window as unknown as { dataLayer?: unknown[] }).dataLayer ?? []
  return layer.map((entry) => Array.from(entry as ArrayLike<unknown>))
}

function eventHits(): Array<{ name: string; params: Record<string, unknown> }> {
  return hits()
    .filter((h) => h[0] === "event")
    .map((h) => ({ name: h[1] as string, params: (h[2] ?? {}) as Record<string, unknown> }))
}

function goTo(url: string) {
  window.history.replaceState({}, "", url)
}

function setReferrer(value: string) {
  Object.defineProperty(document, "referrer", { value, configurable: true })
}

beforeEach(() => {
  mockedIsGaEnabled.mockReturnValue(true)
  ;(window as unknown as { dataLayer?: unknown[] }).dataLayer = []
  goTo("/dashboard")
  setReferrer("")
})

describe("gates", () => {
  it("no emite nada si GA esta deshabilitado", () => {
    mockedIsGaEnabled.mockReturnValue(false)
    trackEvent("login", { method: "password" })
    trackPageView("/dashboard", null)
    setAnalyticsUser({ user_id: "u1", org_id: "o1", role: "ADMIN", plan: "PRO" })
    expect(hits()).toHaveLength(0)
  })

  it("no emite nada desde una vista publica de cotizacion", () => {
    // Defensa en profundidad: el loader ya no monta el script ahi, pero aunque
    // estuviera cargado, ningun hit puede salir.
    goTo(`/cotizacion/${UUID}`)
    trackEvent("login", { method: "password" })
    trackPageView(`/cotizacion/${UUID}`, null)
    setAnalyticsUser({ user_id: "u1", org_id: "o1", role: "ADMIN", plan: "PRO" })
    expect(hits()).toHaveLength(0)
  })

  it("no se rompe si dataLayer explota", () => {
    // Una falla de telemetria no puede tumbar un dialogo de pago.
    ;(window as unknown as { dataLayer: unknown[] }).dataLayer = {
      push() {
        throw new Error("boom")
      },
    } as unknown as unknown[]
    expect(() => trackEvent("login", { method: "password" })).not.toThrow()
  })
})

describe("trackEvent", () => {
  it("emite el evento con sus params", () => {
    trackEvent("payment_registered", {
      payment_currency: "ARS",
      payment_method: "transfer",
      requires_approval: false,
      surface: "payments",
    })
    const [hit] = eventHits()
    expect(hit.name).toBe("payment_registered")
    expect(hit.params).toMatchObject({
      payment_currency: "ARS",
      payment_method: "transfer",
      requires_approval: false,
      surface: "payments",
    })
  })

  it("descarta params prohibidos aunque se fuercen con un cast", () => {
    trackEvent("payment_registered", {
      payment_currency: "ARS",
      payment_method: "transfer",
      requires_approval: false,
      surface: "payments",
      amount: 125000,
      customer_email: "juan@mail.com",
    } as never)
    const [hit] = eventHits()
    expect(hit.params).not.toHaveProperty("amount")
    expect(hit.params).not.toHaveProperty("customer_email")
    expect(hit.params.payment_currency).toBe("ARS")
  })

  it("pisa SIEMPRE page_location y page_path, aun en eventos custom", () => {
    // Sin este override gtag re-deriva la URL de document.location en cada
    // evento y filtra la busqueda del admin.
    goTo("/admin/orgs?q=Juan+Perez")
    trackEvent("login", { method: "password" })
    const [hit] = eventHits()
    expect(hit.params.page_path).toBe("/admin/orgs")
    expect(String(hit.params.page_location)).not.toContain("Juan")
  })

  it("pisa page_referrer para no filtrar la pantalla anterior", () => {
    setReferrer(`${window.location.origin}/admin/orgs?q=Juan+Perez`)
    trackEvent("login", { method: "password" })
    const [hit] = eventHits()
    expect(String(hit.params.page_referrer)).not.toContain("Juan")
    expect(String(hit.params.page_referrer)).not.toContain("q=")
  })
})

describe("trackPageView", () => {
  const cases: Array<[string, string]> = [
    [`/operations/${UUID}?tab=payments`, "/operations/:id?tab=payments"],
    ["/admin/orgs?q=Juan Perez", "/admin/orgs"],
    ["/auth/reset-password?token=abc123def", "/auth/reset-password"],
    ["/growth-studio/campaigns/new", "/growth-studio/campaigns/new"],
    ["/ayuda/como-cargar-una-operacion", "/ayuda/como-cargar-una-operacion"],
  ]

  it.each(cases)("%s -> %s", (url, expected) => {
    const [pathname, search] = url.split("?")
    trackPageView(pathname, search ? `?${search}` : null)
    const [hit] = eventHits()
    expect(hit.name).toBe("page_view")
    expect(hit.params.page_path).toBe(expected)
  })

  it("nunca manda el UUID crudo en la URL", () => {
    trackPageView(`/operations/${UUID}`, null)
    const [hit] = eventHits()
    expect(JSON.stringify(hit.params)).not.toContain(UUID)
  })
})

describe("identidad", () => {
  it("setea user_id y user properties", () => {
    setAnalyticsUser({ user_id: "u1", org_id: "o1", role: "ADMIN", plan: "PRO" })
    const sets = hits().filter((h) => h[0] === "set")
    expect(sets[0][1]).toEqual({ user_id: "u1" })
    expect(sets[1][1]).toBe("user_properties")
    expect(sets[1][2]).toEqual({ org_id: "o1", role: "ADMIN", plan: "PRO" })
  })

  it("ignora identidad nula", () => {
    setAnalyticsUser(null)
    expect(hits()).toHaveLength(0)
  })

  it("limpia la identidad en logout", () => {
    clearAnalyticsUser()
    const sets = hits().filter((h) => h[0] === "set")
    expect(sets[0][1]).toEqual({ user_id: null })
  })
})

describe("sanitizeReferrer", () => {
  it("limpia la query de un referrer interno", () => {
    expect(sanitizeReferrer(`${window.location.origin}/admin/orgs?q=Juan`)).toBe(
      `${window.location.origin}/admin/orgs`
    )
  })

  it("de un referrer externo deja solo el origen", () => {
    expect(sanitizeReferrer("https://www.google.com/search?q=vibook+gestion")).toBe(
      "https://www.google.com"
    )
  })

  it("tolera vacio o invalido", () => {
    expect(sanitizeReferrer("")).toBe("")
    expect(sanitizeReferrer(null)).toBe("")
    expect(sanitizeReferrer("no-es-una-url")).toBe("")
  })
})
