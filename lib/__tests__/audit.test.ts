import { logAudit, getClientIP } from "../audit"
import type { SupabaseClient } from "@supabase/supabase-js"

const createMockSupabase = (insertFn?: jest.Mock) => {
  const insert = insertFn || jest.fn().mockResolvedValue({ data: null, error: null })
  return {
    from: jest.fn().mockReturnValue({ insert }),
  } as unknown as SupabaseClient
}

describe("Audit Service", () => {
  describe("logAudit", () => {
    it("should insert audit entry with all fields into supabase", async () => {
      const insertMock = jest.fn().mockResolvedValue({ data: null, error: null })
      const supabase = createMockSupabase(insertMock)

      await logAudit(supabase, {
        user_id: "user-123",
        user_email: "test@example.com",
        action: "PAYMENT_CREATE",
        entity_type: "payment",
        entity_id: "pay-456",
        details: { amount: 1000, currency: "USD" },
        ip_address: "192.168.1.1",
      })

      expect(supabase.from).toHaveBeenCalledWith("audit_log")
      expect(insertMock).toHaveBeenCalledWith({
        user_id: "user-123",
        user_email: "test@example.com",
        action: "PAYMENT_CREATE",
        entity_type: "payment",
        entity_id: "pay-456",
        details: { amount: 1000, currency: "USD" },
        ip_address: "192.168.1.1",
      })
    })

    it("should set null for missing optional fields", async () => {
      const insertMock = jest.fn().mockResolvedValue({ data: null, error: null })
      const supabase = createMockSupabase(insertMock)

      await logAudit(supabase, {
        action: "CREATE",
        entity_type: "lead",
      })

      expect(insertMock).toHaveBeenCalledWith({
        user_id: null,
        user_email: null,
        action: "CREATE",
        entity_type: "lead",
        entity_id: null,
        details: {},
        ip_address: null,
      })
    })

    it("should not throw when insert fails (non-blocking)", async () => {
      const insertMock = jest.fn().mockRejectedValue(new Error("DB error"))
      const supabase = createMockSupabase(insertMock)
      const warnSpy = jest.spyOn(console, "warn").mockImplementation()

      await expect(
        logAudit(supabase, {
          action: "DELETE",
          entity_type: "operation",
        })
      ).resolves.toBeUndefined()

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[Audit]"),
        "DELETE",
        "operation",
        expect.any(Error)
      )

      warnSpy.mockRestore()
    })

    it("should not throw when insert returns a database error", async () => {
      // Even if insert resolves but with an internal error, logAudit should not fail
      const insertMock = jest.fn().mockResolvedValue({
        data: null,
        error: { message: "constraint violation" },
      })
      const supabase = createMockSupabase(insertMock)

      // logAudit wraps in try/catch, so even if an error is returned, it should not propagate
      await expect(
        logAudit(supabase, { action: "UPDATE", entity_type: "customer" })
      ).resolves.toBeUndefined()
    })

    it("should handle all audit action types", async () => {
      const insertMock = jest.fn().mockResolvedValue({ data: null, error: null })
      const supabase = createMockSupabase(insertMock)

      const actions = [
        "LOGIN", "LOGOUT", "CREATE", "UPDATE", "DELETE",
        "APPROVE", "CONVERT", "PAYMENT_CREATE", "PAYMENT_UPDATE",
        "PAYMENT_DELETE", "SETTINGS_CHANGE", "EXPORT", "IMPORT",
      ] as const

      for (const action of actions) {
        await logAudit(supabase, { action, entity_type: "lead" })
      }

      expect(insertMock).toHaveBeenCalledTimes(actions.length)
    })

    it("should handle all entity types", async () => {
      const insertMock = jest.fn().mockResolvedValue({ data: null, error: null })
      const supabase = createMockSupabase(insertMock)

      const entityTypes = [
        "lead", "operation", "payment", "customer",
        "operator", "user", "commission", "exchange_rate",
        "financial_account", "settings", "quotation",
      ] as const

      for (const entity_type of entityTypes) {
        await logAudit(supabase, { action: "CREATE", entity_type })
      }

      expect(insertMock).toHaveBeenCalledTimes(entityTypes.length)
    })

    it("should pass complex details object", async () => {
      const insertMock = jest.fn().mockResolvedValue({ data: null, error: null })
      const supabase = createMockSupabase(insertMock)

      const details = {
        old_value: { amount: 500, currency: "ARS" },
        new_value: { amount: 1000, currency: "USD" },
        reason: "Price correction",
      }

      await logAudit(supabase, {
        action: "UPDATE",
        entity_type: "payment",
        entity_id: "pay-789",
        details,
      })

      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({ details })
      )
    })
  })

  describe("getClientIP", () => {
    // Create a mock request since Request is not available in jsdom
    function mockRequest(headers: Record<string, string> = {}) {
      const hdrs = new Headers(headers)
      return { headers: hdrs } as unknown as Request
    }

    it("should extract first IP from x-forwarded-for header", () => {
      const request = mockRequest({ "x-forwarded-for": "203.0.113.50, 70.41.3.18" })
      expect(getClientIP(request)).toBe("203.0.113.50")
    })

    it("should trim whitespace from x-forwarded-for IP", () => {
      const request = mockRequest({ "x-forwarded-for": "  203.0.113.50  , 70.41.3.18" })
      expect(getClientIP(request)).toBe("203.0.113.50")
    })

    it("should extract single IP from x-forwarded-for", () => {
      const request = mockRequest({ "x-forwarded-for": "10.0.0.1" })
      expect(getClientIP(request)).toBe("10.0.0.1")
    })

    it("should extract IP from x-real-ip header", () => {
      const request = mockRequest({ "x-real-ip": "10.0.0.1" })
      expect(getClientIP(request)).toBe("10.0.0.1")
    })

    it("should prefer x-forwarded-for over x-real-ip", () => {
      const request = mockRequest({
        "x-forwarded-for": "1.2.3.4",
        "x-real-ip": "5.6.7.8",
      })
      expect(getClientIP(request)).toBe("1.2.3.4")
    })

    it("should return null when no IP headers present", () => {
      const request = mockRequest()
      expect(getClientIP(request)).toBeNull()
    })

    it("should return null when headers have unrelated values only", () => {
      const request = mockRequest({ "content-type": "application/json" })
      expect(getClientIP(request)).toBeNull()
    })

    it("should handle IPv6 addresses in x-forwarded-for", () => {
      const request = mockRequest({ "x-forwarded-for": "::1, 10.0.0.1" })
      expect(getClientIP(request)).toBe("::1")
    })
  })
})
