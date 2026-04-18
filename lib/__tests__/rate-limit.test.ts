/**
 * @jest-environment node
 *
 * rate-limit.ts importa NextResponse de next/server (desde que agregamos
 * el helper enforceUserRateLimit). Eso requiere Request/Response/
 * ReadableStream globales, que existen en Node 18+ pero no en jsdom.
 */

// Use fake timers to prevent setInterval in rate-limit.ts from keeping Jest open
jest.useFakeTimers()

import { checkRateLimit, withRateLimit, RATE_LIMIT_CONFIGS } from "../rate-limit"

describe("Rate Limiting", () => {
  afterAll(() => {
    jest.useRealTimers()
  })

  describe("checkRateLimit", () => {
    it("should allow first request and return remaining count", () => {
      const result = checkRateLimit("user-1", "/api/test-first", { maxRequests: 5, windowMs: 60000 })
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(4)
    })

    it("should decrement remaining on subsequent requests", () => {
      const config = { maxRequests: 3, windowMs: 60000 }
      const endpoint = "/api/test-decrement"

      const r1 = checkRateLimit("user-dec", endpoint, config)
      expect(r1.remaining).toBe(2)

      const r2 = checkRateLimit("user-dec", endpoint, config)
      expect(r2.remaining).toBe(1)

      const r3 = checkRateLimit("user-dec", endpoint, config)
      expect(r3.remaining).toBe(0)
    })

    it("should deny request when limit is exceeded", () => {
      const config = { maxRequests: 2, windowMs: 60000 }
      const endpoint = "/api/test-deny"

      checkRateLimit("user-deny", endpoint, config)
      checkRateLimit("user-deny", endpoint, config)

      const r3 = checkRateLimit("user-deny", endpoint, config)
      expect(r3.allowed).toBe(false)
      expect(r3.remaining).toBe(0)
    })

    it("should track different users independently", () => {
      const config = { maxRequests: 1, windowMs: 60000 }
      const endpoint = "/api/test-users"

      const r1 = checkRateLimit("user-a", endpoint, config)
      expect(r1.allowed).toBe(true)

      const r2 = checkRateLimit("user-b", endpoint, config)
      expect(r2.allowed).toBe(true)
    })

    it("should track different endpoints independently", () => {
      const config = { maxRequests: 1, windowMs: 60000 }

      const r1 = checkRateLimit("user-ep", "/api/endpoint-a", config)
      expect(r1.allowed).toBe(true)

      const r2 = checkRateLimit("user-ep", "/api/endpoint-b", config)
      expect(r2.allowed).toBe(true)
    })

    it("should return a resetTime in the future", () => {
      const now = Date.now()
      const config = { maxRequests: 10, windowMs: 60000 }

      const result = checkRateLimit("user-reset-time", "/api/test-reset", config)
      expect(result.resetTime).toBeGreaterThan(now)
      expect(result.resetTime).toBeLessThanOrEqual(now + 60000 + 100) // small tolerance
    })
  })

  describe("withRateLimit", () => {
    it("should return result when within limit", () => {
      const result = withRateLimit("user-wrl-ok", "/api/wrl-test", {
        maxRequests: 10,
        windowMs: 60000,
      })
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBeDefined()
    })

    it("should throw 429 error when limit exceeded", () => {
      const config = { maxRequests: 1, windowMs: 60000 }
      const endpoint = "/api/wrl-throw"

      // First call should succeed
      withRateLimit("user-wrl-throw", endpoint, config)

      // Second call should throw
      try {
        withRateLimit("user-wrl-throw", endpoint, config)
        fail("Expected withRateLimit to throw")
      } catch (error: any) {
        expect(error.message).toBe("Too many requests")
        expect(error.statusCode).toBe(429)
        expect(error.resetTime).toBeDefined()
      }
    })
  })

  describe("RATE_LIMIT_CONFIGS", () => {
    it("should have AI_COPILOT config with 10 requests per minute", () => {
      expect(RATE_LIMIT_CONFIGS.AI_COPILOT.maxRequests).toBe(10)
      expect(RATE_LIMIT_CONFIGS.AI_COPILOT.windowMs).toBe(60000)
    })

    it("should have TRELLO_WEBHOOK config with 100 requests per minute", () => {
      expect(RATE_LIMIT_CONFIGS.TRELLO_WEBHOOK.maxRequests).toBe(100)
      expect(RATE_LIMIT_CONFIGS.TRELLO_WEBHOOK.windowMs).toBe(60000)
    })

    it("should have GENERAL config with 100 requests per minute", () => {
      expect(RATE_LIMIT_CONFIGS.GENERAL.maxRequests).toBe(100)
      expect(RATE_LIMIT_CONFIGS.GENERAL.windowMs).toBe(60000)
    })

    it("should have WRITE config with 30 requests per minute", () => {
      expect(RATE_LIMIT_CONFIGS.WRITE.maxRequests).toBe(30)
      expect(RATE_LIMIT_CONFIGS.WRITE.windowMs).toBe(60000)
    })
  })
})
