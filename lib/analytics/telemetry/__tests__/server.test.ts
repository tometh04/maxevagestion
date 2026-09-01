// `server.ts` importa el admin scope en el tope del modulo; el mock evita que el
// test toque Supabase. Lo que se testea aca es puro: normalizacion y filtrado.
jest.mock("@/lib/supabase/admin-scope", () => ({
  createOrgAdminScope: jest.fn(),
}))

import {
  clampOccurredAt,
  sanitizeScreen,
  sanitizeSessionId,
  sanitizeUsageBatch,
} from "../server"

const NOW = new Date("2026-08-13T12:00:00.000Z")

describe("clampOccurredAt", () => {
  it("usa el reloj del server si el evento no trae timestamp", () => {
    expect(clampOccurredAt(undefined, NOW)).toBe(NOW.toISOString())
    expect(clampOccurredAt("no-es-fecha", NOW)).toBe(NOW.toISOString())
  })

  it("respeta un timestamp razonable del cliente", () => {
    // 20 minutos atras: es un batch que estuvo encolado, no un reloj roto.
    const recent = "2026-08-13T11:40:00.000Z"
    expect(clampOccurredAt(recent, NOW)).toBe(recent)
  })

  it("acota relojes rotos en vez de aceptarlos", () => {
    // Un evento en 2090 romperia todos los rangos del heatmap para siempre.
    expect(clampOccurredAt("2090-01-01T00:00:00.000Z", NOW)).toBe("2026-08-13T12:01:00.000Z")
    expect(clampOccurredAt("2001-01-01T00:00:00.000Z", NOW)).toBe("2026-08-13T11:00:00.000Z")
  })
})

describe("sanitizeUsageBatch", () => {
  it("acepta un evento declarado con sink db", () => {
    const out = sanitizeUsageBatch(
      [{ name: "module_viewed", params: { module: "operations" } }],
      NOW
    )
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe("module_viewed")
    expect(out[0].module).toBe("operations")
  })

  it("descarta eventos que no estan en el catalogo", () => {
    // La tabla no es un buzon abierto donde el cliente inventa metricas.
    expect(sanitizeUsageBatch([{ name: "evento_inventado", params: {} }], NOW)).toHaveLength(0)
  })

  it("descarta eventos que existen pero no van a la DB", () => {
    // `payment_registered` ya deja fila en `payments`: contarlo aca seria
    // contarlo dos veces en el mapa de calor.
    expect(
      sanitizeUsageBatch([{ name: "payment_registered", params: { surface: "payments" } }], NOW)
    ).toHaveLength(0)
  })

  it("aplica el scrubber: nada de PII entra al stream", () => {
    const out = sanitizeUsageBatch(
      [
        {
          name: "module_viewed",
          params: {
            module: "customers",
            customer_name: "Juan Perez",
            amount: 15000,
            email: "juan@test.com",
          },
        },
      ],
      NOW
    )
    expect(out[0].params).toEqual({ module: "customers" })
  })

  it("cae al modulo por default cuando el evento no trae uno", () => {
    // Sin esto, el uso de Cerebro entraria con module null y quedaria fuera de
    // la matriz: visible en la tabla cruda, invisible donde se mira.
    const out = sanitizeUsageBatch(
      [{ name: "ai_query_submitted", params: { surface: "cerebro", has_context: true } }],
      NOW
    )
    expect(out[0].module).toBe("ai")
  })

  it("ignora un modulo que no existe en el catalogo", () => {
    const out = sanitizeUsageBatch(
      [{ name: "module_viewed", params: { module: "modulo_falso" } }],
      NOW
    )
    expect(out[0].module).toBeNull()
  })

  it("no rompe con payloads basura", () => {
    expect(sanitizeUsageBatch(null, NOW)).toEqual([])
    expect(sanitizeUsageBatch("no soy un array", NOW)).toEqual([])
    expect(sanitizeUsageBatch([null, 42, "x", {}], NOW)).toEqual([])
  })

  it("arrastra pantalla y sesion validadas", () => {
    const out = sanitizeUsageBatch(
      [
        {
          name: "view_opened",
          params: { module: "reports", view_kind: "tab", view: "margins" },
          screen: "/reports#tab:margins",
          session_id: "0f9c1a4e-1111-4222-8333-444455556666",
        },
      ],
      NOW
    )
    expect(out[0].screen).toBe("/reports#tab:margins")
    expect(out[0].session_id).toBe("0f9c1a4e-1111-4222-8333-444455556666")
  })

  it("descarta pantalla y sesion invalidas sin tirar la fila", () => {
    const out = sanitizeUsageBatch(
      [{ name: "module_viewed", params: { module: "crm" }, screen: "javascript:alert(1)", session_id: "no-soy-uuid" }],
      NOW
    )
    expect(out).toHaveLength(1)
    expect(out[0].screen).toBeNull()
    expect(out[0].session_id).toBeNull()
  })
})

describe("sanitizeScreen", () => {
  it("acepta el vocabulario del formato", () => {
    expect(sanitizeScreen("/reports")).toBe("/reports")
    expect(sanitizeScreen("/operations/:id")).toBe("/operations/:id")
    expect(sanitizeScreen("/reports#tab:margins")).toBe("/reports#tab:margins")
    expect(sanitizeScreen("/sales/leads#dlg:quotation-builder")).toBe(
      "/sales/leads#dlg:quotation-builder"
    )
  })

  it("rechaza lo que el cliente no deberia poder proponer", () => {
    // El cliente propone, el server valida: un emisor propio o un cliente
    // manipulado no puede inventar la dimension.
    expect(sanitizeScreen("javascript:alert(1)")).toBeNull()
    expect(sanitizeScreen("reports")).toBeNull() // sin barra inicial
    expect(sanitizeScreen("/reports?q=Juan Perez")).toBeNull()
    expect(sanitizeScreen("/reports#otra:cosa")).toBeNull()
    expect(sanitizeScreen("/" + "a".repeat(80))).toBeNull()
    expect(sanitizeScreen(42)).toBeNull()
    expect(sanitizeScreen(null)).toBeNull()
  })
})

describe("sanitizeSessionId", () => {
  it("acepta un UUID y lo normaliza", () => {
    expect(sanitizeSessionId("0F9C1A4E-1111-4222-8333-444455556666")).toBe(
      "0f9c1a4e-1111-4222-8333-444455556666"
    )
  })

  it("rechaza cualquier otra cosa", () => {
    // La columna es UUID: un valor con otra forma haria fallar el INSERT del
    // batch ENTERO de 50 eventos, no de la fila.
    expect(sanitizeSessionId("no-soy-uuid")).toBeNull()
    expect(sanitizeSessionId("")).toBeNull()
    expect(sanitizeSessionId(123)).toBeNull()
    expect(sanitizeSessionId(null)).toBeNull()
  })
})
