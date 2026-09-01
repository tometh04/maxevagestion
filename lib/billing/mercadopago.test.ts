import { createPaymentPreference, createPreapprovalPlan, searchAuthorizedPayments } from "./mercadopago"

describe("createPreapprovalPlan", () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  it("POSTs to /preapproval_plan with expected body", async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => JSON.stringify({
        id: "plan-123",
        init_point: "https://mp.example/plan-123",
        status: "active",
      }),
      headers: new Map([["x-request-id", "req-123"]]) as any,
    })
    global.fetch = mockFetch as any
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-test-token"

    const res = await createPreapprovalPlan({
      reason: "Vibook PRO",
      amount: 119000,
      backUrl: "https://app.vibook.ai/onboarding/billing/return",
      includeFreeTrial: true,
    })

    expect(res.id).toBe("plan-123")
    expect(res.init_point).toBe("https://mp.example/plan-123")
    const call = mockFetch.mock.calls[0]
    expect(call[0]).toBe("https://api.mercadopago.com/preapproval_plan")
    const body = JSON.parse(call[1].body)
    expect(body.reason).toBe("Vibook PRO")
    expect(body.auto_recurring.transaction_amount).toBe(119000)
    expect(body.auto_recurring.free_trial).toEqual({ frequency: 7, frequency_type: "days" })
    expect(body.back_url).toBe("https://app.vibook.ai/onboarding/billing/return")
    expect(body.payer_email).toBeUndefined() // crítico: SIN email
  })

  it("omits free_trial when includeFreeTrial=false", async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => JSON.stringify({ id: "plan-2", init_point: "x", status: "active" }),
      headers: new Map() as any,
    })
    global.fetch = mockFetch as any
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-test-token"

    await createPreapprovalPlan({
      reason: "Custom Enterprise",
      amount: 299000,
      backUrl: "https://app.vibook.ai/settings/subscription",
      includeFreeTrial: false,
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.auto_recurring.free_trial).toBeUndefined()
  })

  it("throws MP preapproval_plan failed con status+body cuando response no-ok", async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ message: "invalid data", status: 400 }),
      headers: new Map() as any,
    })
    global.fetch = mockFetch as any
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-test-token"

    await expect(createPreapprovalPlan({
      reason: "x", amount: 1, backUrl: "https://x", includeFreeTrial: false,
    })).rejects.toThrow(/MP preapproval_plan failed \(400\)/)
  })
})

describe("searchAuthorizedPayments", () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  function mockOk(results: any[]) {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results }),
    })
    global.fetch = mockFetch as any
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-test-token"
    return mockFetch
  }

  it("no manda limit ni sort: MP los rechaza con 400 en este endpoint", async () => {
    const mockFetch = mockOk([])
    await searchAuthorizedPayments("pa-1", 30)

    const url = new URL(mockFetch.mock.calls[0][0])
    expect(url.pathname).toBe("/authorized_payments/search")
    expect(url.searchParams.get("preapproval_id")).toBe("pa-1")
    expect(url.searchParams.get("limit")).toBeNull()
    expect(url.searchParams.get("sort")).toBeNull()
  })

  it("ordena del intento más nuevo al más viejo sin depender del orden de MP", async () => {
    mockOk([
      { id: "viejo", debit_date: "2026-07-29T09:37:53.000Z" },
      { id: "nuevo", debit_date: "2026-08-29T10:11:47.000Z" },
      { id: "medio", date_created: "2026-08-14T12:00:00.000Z" },
    ])
    const res = await searchAuthorizedPayments("pa-1")
    expect(res.map((r) => r.id)).toEqual(["nuevo", "medio", "viejo"])
  })

  it("recorta a limit del lado nuestro", async () => {
    mockOk([
      { id: "a", debit_date: "2026-08-29T00:00:00.000Z" },
      { id: "b", debit_date: "2026-07-29T00:00:00.000Z" },
      { id: "c", debit_date: "2026-06-29T00:00:00.000Z" },
    ])
    expect(await searchAuthorizedPayments("pa-1", 2)).toHaveLength(2)
  })

  it("una fecha inválida no rompe el orden", async () => {
    mockOk([
      { id: "sin-fecha" },
      { id: "con-fecha", debit_date: "2026-08-29T00:00:00.000Z" },
    ])
    const res = await searchAuthorizedPayments("pa-1")
    expect(res[0].id).toBe("con-fecha")
  })

  it("propaga el error de MP con status y body", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"message":"Invalid value for limit"}',
    }) as any
    await expect(searchAuthorizedPayments("pa-1")).rejects.toThrow(
      /MP search authorized_payments failed \(400\)/
    )
  })
})

describe("createPaymentPreference", () => {
  const originalFetch = global.fetch
  const originalEnv = process.env
  beforeEach(() => { process.env = { ...originalEnv } })
  afterEach(() => { global.fetch = originalFetch })
  afterAll(() => { process.env = originalEnv })

  it("creates an idempotent one-time checkout tied to the credit order", async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => JSON.stringify({ id: "pref-1", init_point: "https://mp.example/pref-1" }),
    })
    global.fetch = mockFetch as any
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-test-token"
    delete process.env.MP_USE_SANDBOX
    process.env.NEXT_PUBLIC_APP_URL = "https://app.vibook.ai"

    await createPaymentPreference({
      orderId: "10000000-0000-4000-8000-000000000001",
      title: "Pack 25",
      units: 25,
      amountArs: 15000,
      payerEmail: "billing@example.com",
      backUrl: "https://app.vibook.ai/settings/subscription",
      expiresAt: "2026-09-01T00:00:00.000Z",
    })

    const [, options] = mockFetch.mock.calls[0]
    const body = JSON.parse(options.body)
    expect(options.headers["X-Idempotency-Key"]).toBe("10000000-0000-4000-8000-000000000001")
    expect(body.external_reference).toBe("quotation-credit-order:10000000-0000-4000-8000-000000000001")
    expect(body.items[0]).toMatchObject({ quantity: 1, unit_price: 15000, currency_id: "ARS" })
    expect(body).toMatchObject({ expires: true, expiration_date_to: "2026-09-01T00:00:00.000Z" })
    expect(body.notification_url).toBe("https://app.vibook.ai/api/billing/quotation-credits/webhook")
  })
})
