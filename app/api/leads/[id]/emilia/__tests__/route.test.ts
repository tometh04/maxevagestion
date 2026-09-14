// app/api/leads/[id]/emilia/__tests__/route.test.ts
/** @jest-environment node */

jest.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => {
      const body = JSON.stringify(data)
      return {
        status: init?.status ?? 200,
        json: async () => JSON.parse(body),
      }
    },
  },
}))

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }))
jest.mock("@/lib/supabase/server", () => ({ createServerClient: jest.fn() }))
jest.mock("@/lib/emilia/access", () => ({
  resolveLeadEmiliaAccess: jest.fn(),
  canAccessEmiliaLeadAgency: (
    access: { agencyIds: string[]; ownSellerId?: string | null },
    agencyId: string | null,
    assignedSellerId?: string | null
  ) => Boolean(
    agencyId
    && access.agencyIds.includes(agencyId)
    && (!access.ownSellerId || assignedSellerId === access.ownSellerId)
  ),
}))

import { GET, POST } from "../route"
import { GET as GET_PROMPT } from "../suggested-prompt/route"

const { getCurrentUser } = require("@/lib/auth")
const { createServerClient } = require("@/lib/supabase/server")
const { resolveLeadEmiliaAccess } = require("@/lib/emilia/access")

const USER_ORG = "org-1"
const LEAD_ID = "lead-1"
const REQ_STUB = {} as Request

function queryResult(result: { data?: any; error?: any }) {
  const query: any = {}
  query.select = jest.fn(() => query)
  query.eq = jest.fn(() => query)
  query.order = jest.fn(() => query)
  query.limit = jest.fn(() => query)
  query.maybeSingle = jest.fn(async () => ({ data: result.data ?? null, error: result.error ?? null }))
  query.single = jest.fn(async () => ({ data: result.data ?? null, error: result.error ?? null }))
  return query
}

function mockSupabase(builders: Record<string, any>) {
  return {
    from: jest.fn((table: string) => builders[table] ?? queryResult({ data: null })),
  }
}

function leadData(overrides: Record<string, unknown> = {}) {
  return {
    id: LEAD_ID,
    contact_name: "Juan",
    destination: "Cancún",
    region: "CARIBE",
    notes: null,
    list_name: null,
    agency_id: "a1",
    assigned_seller_id: "u1",
    ...overrides,
  }
}

describe("/api/leads/[id]/emilia", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.OPENAI_API_KEY = ""
    getCurrentUser.mockResolvedValue({
      user: { id: "u1", org_id: USER_ORG, role: "SELLER", roles: ["SELLER"] },
    })
    resolveLeadEmiliaAccess.mockResolvedValue({
      allowed: true,
      agencyIds: ["a1"],
      ownSellerId: "u1",
      promotionActive: true,
      promotionEndsAt: "2026-11-11T19:32:31.000Z",
      organization: {},
    })
  })

  it("GET devuelve 400 si el usuario no tiene org_id", async () => {
    getCurrentUser.mockResolvedValue({ user: { id: "u1", org_id: null } })
    const res = await GET(REQ_STUB, { params: Promise.resolve({ id: LEAD_ID }) })
    expect(res.status).toBe(400)
  })

  it("GET propaga la restricción de plan posterior a la promoción", async () => {
    createServerClient.mockResolvedValue(mockSupabase({}))
    resolveLeadEmiliaAccess.mockResolvedValue({
      allowed: false,
      status: 403,
      code: "emilia_plan_required",
      message: "Emilia está disponible únicamente con el plan Enterprise",
    })

    const res = await GET(REQ_STUB, { params: Promise.resolve({ id: LEAD_ID }) })
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({ code: "emilia_plan_required" })
  })

  it("GET devuelve 404 si el lead no pertenece al scope de org/agencia", async () => {
    createServerClient.mockResolvedValue(mockSupabase({
      leads: queryResult({ data: leadData({ agency_id: "a2" }) }),
    }))

    const res = await GET(REQ_STUB, { params: Promise.resolve({ id: LEAD_ID }) })
    expect(res.status).toBe(404)
  })

  it("GET devuelve 404 si el lead pertenece a otro vendedor bajo own-data", async () => {
    createServerClient.mockResolvedValue(mockSupabase({
      leads: queryResult({ data: leadData({ assigned_seller_id: "u2" }) }),
    }))

    const res = await GET(REQ_STUB, { params: Promise.resolve({ id: LEAD_ID }) })
    expect(res.status).toBe(404)
  })

  it("GET devuelve la conversación activa scopeada", async () => {
    createServerClient.mockResolvedValue(mockSupabase({
      leads: queryResult({ data: leadData() }),
      conversations: queryResult({ data: { id: "conv-existing" } }),
    }))

    const res = await GET(REQ_STUB, { params: Promise.resolve({ id: LEAD_ID }) })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ data: { id: "conv-existing" } })
  })

  it("POST crea una conversación tenant-scoped y devuelve fallback prompt", async () => {
    const conversations = queryResult({ data: null })
    const insertSpy = jest.fn(() => ({
      select: () => ({
        single: async () => ({ data: { id: "conv-new" }, error: null }),
      }),
    }))
    conversations.insert = insertSpy

    createServerClient.mockResolvedValue(mockSupabase({
      leads: queryResult({ data: leadData() }),
      conversations,
    }))

    const res = await POST(REQ_STUB, { params: Promise.resolve({ id: LEAD_ID }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.conversation_id).toBe("conv-new")
    expect(body.suggested_prompt).toBe("Cotizar viaje a Cancún. Necesito fechas y cantidad de pasajeros.")
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({
      org_id: USER_ORG,
      user_id: "u1",
      lead_id: LEAD_ID,
    }))
  })

  it("POST incorpora el prompt configurado para la lista del Kanban", async () => {
    const conversations = queryResult({ data: null })
    conversations.insert = jest.fn(() => ({
      select: () => ({ single: async () => ({ data: { id: "conv-new" }, error: null }) }),
    }))

    createServerClient.mockResolvedValue(mockSupabase({
      leads: queryResult({ data: leadData({ list_name: "Caribe" }) }),
      manychat_list_order: {
        select: () => ({
          eq: async () => ({
            data: [{ list_name: "CARIBE", prompt: "Cotizar all inclusive saliendo desde Córdoba." }],
          }),
        }),
      },
      conversations,
    }))

    const res = await POST(REQ_STUB, { params: Promise.resolve({ id: LEAD_ID }) })
    const body = await res.json()
    expect(body.suggested_prompt).toMatch(/Cotizar all inclusive saliendo desde Córdoba\./)
  })

  it("POST reutiliza una conversación activa", async () => {
    const conversations = queryResult({ data: { id: "conv-existing" } })
    const insertSpy = jest.fn()
    conversations.insert = insertSpy

    createServerClient.mockResolvedValue(mockSupabase({
      leads: queryResult({ data: leadData() }),
      conversations,
    }))

    const res = await POST(REQ_STUB, { params: Promise.resolve({ id: LEAD_ID }) })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ conversation_id: "conv-existing" })
    expect(insertSpy).not.toHaveBeenCalled()
  })
})


describe("prompt sugerido sin metadatos comerciales", () => {
  const originalFetch = global.fetch
  const originalKey = process.env.OPENAI_API_KEY
  const expected = "Cotizar viaje a Punta Cana. Saliendo desde Buenos Aires, Argentina para la primera semana de diciembre con hotel incluido all inclusive."
  beforeEach(() => {
    jest.clearAllMocks()
    getCurrentUser.mockResolvedValue({ user: { id: "u1", org_id: USER_ORG } })
    resolveLeadEmiliaAccess.mockResolvedValue({ allowed: true, agencyIds: ["a1"], ownSellerId: "u1" })
    createServerClient.mockResolvedValue(mockSupabase({ leads: queryResult({ data: leadData({
      destination: "Punta Cana, CARIBE", notes: "Fuente: Instagram\nPrimera semana de diciembre, hotel all inclusive, salida desde Buenos Aires, Argentina.",
    }) }) }))
  })
  afterEach(() => { global.fetch = originalFetch; process.env.OPENAI_API_KEY = originalKey })
  it("limpia la respuesta del modelo y no le envía la región ni la procedencia del lead", async () => {
    process.env.OPENAI_API_KEY = "test-key"
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: expected.replace("Punta Cana.", "Punta Cana, CARIBE.") + " Lead proveniente de Instagram." } }] }) })
    const response = await GET_PROMPT(REQ_STUB, { params: Promise.resolve({ id: LEAD_ID }) })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ prompt: expected })
    const request = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
    const lead = JSON.parse(request.messages[1].content)
    expect(lead.destination).toBe("Punta Cana")
    expect(lead).not.toHaveProperty("region")
    expect(lead.notes).not.toContain("Instagram")
    expect(lead.notes).toContain("Buenos Aires, Argentina")
  })
  it.each(["missing-key", "provider-error", "empty-response"])("mantiene limpio el fallback: %s", async mode => {
    process.env.OPENAI_API_KEY = mode === "missing-key" ? "" : "test-key"
    global.fetch = jest.fn().mockResolvedValue({ ok: mode !== "provider-error", status: 503, json: async () => ({ choices: [] }) })
    const response = await GET_PROMPT(REQ_STUB, { params: Promise.resolve({ id: LEAD_ID }) })
    expect(await response.json()).toEqual({ prompt: "Cotizar viaje a Punta Cana. Necesito fechas y cantidad de pasajeros." })
  })
})
