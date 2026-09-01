import { createPaymentPreference, createPreapprovalPlan } from "./mercadopago"

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
