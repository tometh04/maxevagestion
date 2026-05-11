/**
 * @jest-environment node
 */
import { CallbellClient } from "@/lib/integrations/callbell/api-client"

describe("CallbellClient", () => {
  it("throws if no api token provided", () => {
    expect(() => new CallbellClient("")).toThrow(
      /Callbell API token requerido/
    )
  })

  it("constructs successfully with a token", () => {
    const c = new CallbellClient("test-token-123")
    expect(c).toBeInstanceOf(CallbellClient)
  })

  it("sends Authorization: Bearer <token> header on requests", async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const originalFetch = global.fetch
    global.fetch = (async (url: any, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      return new Response(JSON.stringify({ tags: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }) as typeof global.fetch

    try {
      const c = new CallbellClient("the-token")
      await c.listTags()
      expect(calls).toHaveLength(1)
      const headers = calls[0].init?.headers as Record<string, string>
      expect(headers["Authorization"]).toBe("Bearer the-token")
      expect(headers["Content-Type"]).toBe("application/json")
      expect(calls[0].url).toMatch(/\/tags$/)
    } finally {
      global.fetch = originalFetch
    }
  })

  it("throws with informative error on non-2xx", async () => {
    const originalFetch = global.fetch
    global.fetch = (async () =>
      new Response("Unauthorized", { status: 401 })) as typeof global.fetch

    try {
      const c = new CallbellClient("bad-token")
      await expect(c.listTags()).rejects.toThrow(/Callbell API 401/)
    } finally {
      global.fetch = originalFetch
    }
  })
})
