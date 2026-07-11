/**
 * @jest-environment node
 */

import { mpNotificationUrl, createPreapprovalPlan } from "./mercadopago"

describe("mpNotificationUrl", () => {
  const OLD_ENV = process.env
  beforeEach(() => { process.env = { ...OLD_ENV } })
  afterAll(() => { process.env = OLD_ENV })

  it("construye la URL del webhook desde NEXT_PUBLIC_APP_URL https", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.vibook.ai"
    expect(mpNotificationUrl()).toBe("https://app.vibook.ai/api/billing/mp-webhook")
  })

  it("agrega https:// si falta el scheme", () => {
    process.env.NEXT_PUBLIC_APP_URL = "app.vibook.ai"
    expect(mpNotificationUrl()).toBe("https://app.vibook.ai/api/billing/mp-webhook")
  })

  it("omite en localhost (MP rechaza URLs no públicas)", () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3067"
    expect(mpNotificationUrl()).toBeUndefined()
  })

  it("omite si NEXT_PUBLIC_APP_URL no está seteado", () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    expect(mpNotificationUrl()).toBeUndefined()
  })
})

describe("createPreapprovalPlan incluye notification_url", () => {
  const originalFetch = global.fetch
  const OLD_ENV = process.env
  afterEach(() => { global.fetch = originalFetch })
  beforeEach(() => { process.env = { ...OLD_ENV } })
  afterAll(() => { process.env = OLD_ENV })

  function mockOk() {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => JSON.stringify({ id: "plan-1", init_point: "https://mp/plan-1", status: "active" }),
      headers: new Map([["x-request-id", "req-1"]]) as any,
    })
    global.fetch = mockFetch as any
    return mockFetch
  }

  it("manda notification_url cuando APP_URL es https público", async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-test"
    process.env.NEXT_PUBLIC_APP_URL = "https://app.vibook.ai"
    const mockFetch = mockOk()

    await createPreapprovalPlan({
      reason: "Vibook PRO",
      amount: 119000,
      backUrl: "https://app.vibook.ai/onboarding/billing/return",
      includeFreeTrial: true,
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.notification_url).toBe("https://app.vibook.ai/api/billing/mp-webhook")
  })

  it("no manda notification_url en localhost", async () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-test"
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3067"
    const mockFetch = mockOk()

    await createPreapprovalPlan({
      reason: "Vibook PRO",
      amount: 119000,
      backUrl: "http://localhost:3067/onboarding/billing/return",
      includeFreeTrial: true,
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.notification_url).toBeUndefined()
  })
})
