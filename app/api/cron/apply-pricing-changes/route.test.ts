/**
 * @jest-environment node
 *
 * API route handlers use WHATWG Request/Response — requires node env (not jsdom).
 */

jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: jest.fn(),
}))
jest.mock("@/lib/billing/mp-update", () => ({
  applyPriceChange: jest.fn(),
}))
jest.mock("@/lib/security/audit", () => ({
  logSecurityEvent: jest.fn(),
}))

import { POST } from "./route"

describe("POST /api/cron/apply-pricing-changes", () => {
  const OLD_ENV = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...OLD_ENV, CRON_SECRET: "test-secret" }
  })

  afterAll(() => {
    process.env = OLD_ENV
  })

  it("401 sin auth", async () => {
    const res = await POST(
      new Request("http://localhost/api/cron/apply-pricing-changes", { method: "POST" })
    )
    expect(res.status).toBe(401)
  })

  it("401 con secret incorrecto", async () => {
    const res = await POST(
      new Request("http://localhost/api/cron/apply-pricing-changes", {
        method: "POST",
        headers: { authorization: "Bearer wrong" },
      })
    )
    expect(res.status).toBe(401)
  })

  it("401 si CRON_SECRET no configurado", async () => {
    delete process.env.CRON_SECRET
    const res = await POST(
      new Request("http://localhost/api/cron/apply-pricing-changes", {
        method: "POST",
        headers: { authorization: "Bearer test-secret" },
      })
    )
    expect(res.status).toBe(401)
  })
})
