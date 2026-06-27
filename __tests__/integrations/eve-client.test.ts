/**
 * @jest-environment node
 *
 * Tests unitarios para lib/integrations/eve/client.ts.
 * Mockean global.fetch — no requieren credenciales de Eve.
 */

// Guardar y restaurar process.env entre tests
const ORIG_ENV = { ...process.env }

beforeEach(() => {
  process.env = {
    ...ORIG_ENV,
    EVE_API_BASE_URL: "https://eve.test",
    EVE_ADMIN_API_SECRET: "test-secret-123",
  }
  jest.clearAllMocks()
})

afterEach(() => {
  process.env = { ...ORIG_ENV }
})

// Helper para mockear fetch con una respuesta JSON
function mockFetchOk(body: unknown) {
  return jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  })
}

function mockFetchError(status: number, text = "error") {
  return jest.fn().mockResolvedValue({
    ok: false,
    status,
    text: () => Promise.resolve(text),
  })
}

describe("eveGetAgencia", () => {
  it("llama GET /admin/agencia con vibook_org_id en querystring y Authorization Bearer", async () => {
    const mockBody = {
      ok: true,
      agencia: { id: "ag-1", nombre: "Test", activa: true, prompt_custom: null },
      canales: [],
    }
    global.fetch = mockFetchOk(mockBody)

    const { eveGetAgencia } = await import("@/lib/integrations/eve/client")
    const result = await eveGetAgencia("org-123")

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, opts] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe("https://eve.test/admin/agencia?vibook_org_id=org-123")
    expect(opts.method).toBe("GET")
    expect(opts.headers.Authorization).toBe("Bearer test-secret-123")

    expect(result.agencia?.id).toBe("ag-1")
    expect(result.canales).toEqual([])
  })

  it("lanza error con status code si Eve devuelve !ok", async () => {
    global.fetch = mockFetchError(503, "Service Unavailable")

    const { eveGetAgencia } = await import("@/lib/integrations/eve/client")
    await expect(eveGetAgencia("org-1")).rejects.toThrow("503")
  })

  it("lanza error si EVE_API_BASE_URL no está configurada", async () => {
    delete process.env.EVE_API_BASE_URL

    const { eveGetAgencia } = await import("@/lib/integrations/eve/client")
    await expect(eveGetAgencia("org-1")).rejects.toThrow("EVE_API_BASE_URL")
  })

  it("lanza error si EVE_ADMIN_API_SECRET no está configurada", async () => {
    delete process.env.EVE_ADMIN_API_SECRET

    const { eveGetAgencia } = await import("@/lib/integrations/eve/client")
    await expect(eveGetAgencia("org-1")).rejects.toThrow("EVE_ADMIN_API_SECRET")
  })
})

describe("eveUpsertAgencia", () => {
  it("llama POST /admin/agencia con body correcto y devuelve agencia_id", async () => {
    global.fetch = mockFetchOk({ ok: true, agencia_id: "ag-new", created: true })

    const { eveUpsertAgencia } = await import("@/lib/integrations/eve/client")
    const result = await eveUpsertAgencia({
      vibook_org_id: "org-456",
      nombre: "Mi Agencia",
      lead_webhook_url: "https://app.vibook.ai/api/integrations/eve-in/abc/webhook",
      lead_webhook_secret: "plaintext-secret",
    })

    const [url, opts] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe("https://eve.test/admin/agencia")
    expect(opts.method).toBe("POST")

    const parsed = JSON.parse(opts.body)
    expect(parsed.vibook_org_id).toBe("org-456")
    expect(parsed.lead_webhook_secret).toBe("plaintext-secret")

    expect(result.agencia_id).toBe("ag-new")
    expect(result.created).toBe(true)
  })
})

describe("eveSetPrompt", () => {
  it("llama POST /admin/prompt con agencia_id y prompt_custom", async () => {
    global.fetch = mockFetchOk({ ok: true })

    const { eveSetPrompt } = await import("@/lib/integrations/eve/client")
    const result = await eveSetPrompt("ag-1", "Hola, soy Eve")

    const [url, opts] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe("https://eve.test/admin/prompt")
    expect(opts.method).toBe("POST")
    const parsed = JSON.parse(opts.body)
    expect(parsed.agencia_id).toBe("ag-1")
    expect(parsed.prompt_custom).toBe("Hola, soy Eve")
    expect(result.ok).toBe(true)
  })
})

describe("eveUpsertCanal", () => {
  it("llama POST /admin/canal y devuelve canal_id", async () => {
    global.fetch = mockFetchOk({ ok: true, canal_id: "canal-1", waba_subscribed: false })

    const { eveUpsertCanal } = await import("@/lib/integrations/eve/client")
    const result = await eveUpsertCanal({
      agencia_id: "ag-1",
      tipo: "whatsapp",
      external_id: "+5491100000000",
    })

    const [url, opts] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe("https://eve.test/admin/canal")
    expect(opts.method).toBe("POST")
    expect(result.canal_id).toBe("canal-1")
  })
})
