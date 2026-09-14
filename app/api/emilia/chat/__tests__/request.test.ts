/** @jest-environment node */
import { POST } from "../route"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { resolveLeadEmiliaAccess, canAccessEmiliaLeadAgency } from "@/lib/emilia/access"
import { resolveAgencyEmiliaCredential } from "@/lib/emilia/agency-credential"

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }))
jest.mock("@/lib/rate-limit", () => ({ enforceUserRateLimit: jest.fn(() => null) }))
jest.mock("@/lib/emilia/access", () => ({
  resolveLeadEmiliaAccess: jest.fn(), canAccessEmiliaLeadAgency: jest.fn(),
}))
jest.mock("@/lib/emilia/agency-credential", () => ({ resolveAgencyEmiliaCredential: jest.fn() }))
jest.mock("@/lib/permissions/agency-scope-server", () => ({ resolveAgencyPermissionScope: jest.fn() }))
jest.mock("@/lib/emilia/turn-result", () => ({ normalizeEmiliaProgress: () => ({}) }))

const conversationId = "11111111-1111-4111-8111-111111111111"
const clientId = "22222222-2222-4222-8222-222222222222"
const message = "Quiero un vuelo a Cancún para dos adultos"

describe("primer mensaje de un lead a Emilia", () => {
  const originalFetch = global.fetch
  let query: Record<string, jest.Mock>

  beforeEach(() => {
    jest.clearAllMocks()
    ;(getCurrentUser as jest.Mock).mockResolvedValue({ user: { id: "user-1", org_id: "org-1" } })
    query = {
      select: jest.fn(), eq: jest.fn(), update: jest.fn(),
      single: jest.fn().mockResolvedValue({ data: { id: conversationId, lead_id: "lead-1" } }),
      maybeSingle: jest.fn().mockResolvedValue({ data: { id: "lead-1", agency_id: "agency-1" } }),
      insert: jest.fn().mockResolvedValue({ error: null }),
    }
    for (const key of ["select", "eq", "update"]) query[key].mockReturnValue(query)
    ;(createServerClient as jest.Mock).mockResolvedValue({ from: jest.fn(() => query) })
    ;(resolveLeadEmiliaAccess as jest.Mock).mockResolvedValue({ allowed: true })
    ;(canAccessEmiliaLeadAgency as jest.Mock).mockReturnValue(true)
    ;(resolveAgencyEmiliaCredential as jest.Mock).mockResolvedValue({ apiKey: "test-key" })
    global.fetch = jest.fn().mockResolvedValue(Response.json({ status: "queued", job_id: "job-1" }))
  })

  afterEach(() => { global.fetch = originalFetch })

  it("conserva el prompt limpio del lead hasta el payload de Emilia", async () => {
    const { buildFallbackPrompt } = await import("@/lib/emilia/lead-context")
    const clean = buildFallbackPrompt({ contact_name: "Cliente", destination: "Punta Cana, CARIBE", region: "CARIBE", notes: null,
      list_prompt: "Fuente: Instagram\nSaliendo desde Buenos Aires, Argentina, primera semana de diciembre, hotel all inclusive." })
    const response = await POST(new Request("http://localhost/api/emilia/chat", { method: "POST", body: JSON.stringify({
      message: clean, conversationId, clientId, defaultOrigin: { city: "Rosario", country: "Argentina" },
    }) }))
    expect(response.status).toBe(202)
    const payload = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
    expect(payload.message).toBe(clean)
    expect(payload.message).not.toMatch(/CARIBE|Instagram|Cliente|Rosario/)
  })

  it.each([503, 504, "network", "timeout"])("recupera el despacho transitorio %s sin duplicar la búsqueda", async (failure) => {
    const fetchMock = global.fetch as jest.Mock
    if (typeof failure === "number") {
      fetchMock.mockResolvedValueOnce(Response.json({ error: { message: "temporarily unavailable" } }, { status: failure }))
    } else {
      fetchMock.mockRejectedValueOnce(failure === "timeout"
        ? new DOMException("aborted", "AbortError") : new TypeError("fetch failed"))
    }
    const response = await POST(new Request("http://localhost/api/emilia/chat", {
      method: "POST", body: JSON.stringify({ message, conversationId, clientId }),
    }))
    expect(response.status).toBe(202)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][1].body).toBe(fetchMock.mock.calls[1][1].body)
    expect(fetchMock.mock.calls[1][1].headers["X-API-Key"]).toBe("test-key")
    expect(query.insert).toHaveBeenCalledTimes(1)
  })

  it.each([401, 402, 403, 409, 429])("no reintenta un rechazo definitivo %s", async (status) => {
    ;(global.fetch as jest.Mock).mockResolvedValue(Response.json({ error: { message: "rejected" } }, { status }))
    const response = await POST(new Request("http://localhost/api/emilia/chat", {
      method: "POST", body: JSON.stringify({ message, conversationId, clientId }),
    }))
    expect(response.status).toBe(status)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it("acota los reintentos si la conexión sigue caída", async () => {
    ;(global.fetch as jest.Mock).mockRejectedValue(new TypeError("fetch failed"))
    const response = await POST(new Request("http://localhost/api/emilia/chat", {
      method: "POST", body: JSON.stringify({ message, conversationId, clientId }),
    }))
    expect(response.status).toBe(503)
    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect((await response.json()).error).not.toContain("fetch failed")
  })

  it("corta una respuesta colgada y recupera el mismo trabajo aunque ya haya recibido las cabeceras", async () => {
    jest.useFakeTimers()
    try {
      ;(global.fetch as jest.Mock).mockImplementationOnce(async (_url, init) => ({
        status: 202, ok: true,
        text: () => new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
        }),
      }))
      const pending = POST(new Request("http://localhost/api/emilia/chat", {
        method: "POST", body: JSON.stringify({ message, conversationId, clientId }),
      }))
      await jest.advanceTimersByTimeAsync(7_500)
      const response = await pending
      expect(response.status).toBe(202)
      expect(global.fetch).toHaveBeenCalledTimes(2)
      expect(jest.getTimerCount()).toBe(0)
    } finally {
      jest.useRealTimers()
    }
  })

  it("termina dentro del presupuesto total si ambos despachos se cuelgan", async () => {
    jest.useFakeTimers()
    try {
      ;(global.fetch as jest.Mock).mockImplementation((_url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
      }))
      const pending = POST(new Request("http://localhost/api/emilia/chat", {
        method: "POST", body: JSON.stringify({ message, conversationId, clientId }),
      }))
      await jest.advanceTimersByTimeAsync(15_000)
      expect((await pending).status).toBe(504)
      expect(global.fetch).toHaveBeenCalledTimes(2)
      expect(jest.getTimerCount()).toBe(0)
    } finally {
      jest.useRealTimers()
    }
  })

  it.each([null, undefined, { city: "Rosario", country: "Argentina" }])(
    "despacha el primer prompt con origen %j sin Solicitud inválida",
    async (defaultOrigin) => {
      const response = await POST(new Request("http://localhost/api/emilia/chat", {
        method: "POST",
        body: JSON.stringify({ message, conversationId, clientId, defaultOrigin }),
      }))
      const body = await response.json()
      expect(body.error).toBeUndefined()
      expect(response.status).toBe(202)
      const payload = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body)
      expect(payload.message).toBe(defaultOrigin ? `${message} Saliendo desde Rosario, Argentina.` : message)
      expect(query.eq).toHaveBeenCalledWith("org_id", "org-1")
      expect(query.eq).toHaveBeenCalledWith("user_id", "user-1")
    }
  )

  it.each([{ city: "" }, { city: 123 }, "Rosario"])("rechaza origen malformado %j", async (defaultOrigin) => {
    const response = await POST(new Request("http://localhost/api/emilia/chat", {
      method: "POST", body: JSON.stringify({ message, conversationId, clientId, defaultOrigin }),
    }))
    expect(response.status).toBe(400)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
