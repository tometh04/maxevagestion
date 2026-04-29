import { createPreapprovalPlan } from "./mercadopago"

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
