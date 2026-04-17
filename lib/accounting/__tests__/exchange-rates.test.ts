import {
  getExchangeRate,
  getLatestExchangeRate,
  getExchangeRateWithFallback,
} from "../exchange-rates"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

// Helper to create mock supabase
function createMockSupabase(overrides: {
  rpcResult?: { data: any; error: any }
  selectResult?: { data: any; error: any }
} = {}) {
  const chainable = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(
      overrides.selectResult || { data: null, error: null }
    ),
  }

  return {
    rpc: jest.fn().mockResolvedValue(
      overrides.rpcResult || { data: null, error: { code: "PGRST202", message: "function not found" } }
    ),
    from: jest.fn().mockReturnValue(chainable),
    _chainable: chainable,
  } as unknown as SupabaseClient<Database> & { _chainable: any }
}

describe("Exchange Rates Service", () => {
  describe("getExchangeRate", () => {
    it("should return rate from RPC function when available", async () => {
      const supabase = createMockSupabase({
        rpcResult: { data: 1450, error: null },
      })

      const result = await getExchangeRate(supabase, "2026-03-01")
      expect(result).toBe(1450)
    })

    it("should fallback to direct query when RPC fails with PGRST202", async () => {
      const supabase = createMockSupabase({
        rpcResult: { data: null, error: { code: "PGRST202", message: "not found" } },
        selectResult: { data: { rate: "1500" }, error: null },
      })

      const result = await getExchangeRate(supabase, "2026-03-01")
      expect(result).toBe(1500)
    })

    it("should return null when no rates found", async () => {
      const supabase = createMockSupabase({
        rpcResult: { data: null, error: { code: "PGRST202", message: "not found" } },
        selectResult: { data: null, error: null },
      })

      const result = await getExchangeRate(supabase, "2026-03-01")
      expect(result).toBeNull()
    })

    it("should accept Date object as input", async () => {
      const supabase = createMockSupabase({
        rpcResult: { data: 1400, error: null },
      })

      const result = await getExchangeRate(supabase, new Date("2026-03-15"))
      expect(result).toBe(1400)
      expect(supabase.rpc).toHaveBeenCalledWith("get_exchange_rate", expect.objectContaining({
        p_date: "2026-03-15",
      }))
    })
  })

  describe("getLatestExchangeRate", () => {
    it("should return latest rate", async () => {
      const supabase = createMockSupabase({
        selectResult: { data: { rate: "1480" }, error: null },
      })

      const result = await getLatestExchangeRate(supabase)
      expect(result).toBe(1480)
    })

    it("should return null when no rates exist", async () => {
      const supabase = createMockSupabase({
        selectResult: { data: null, error: null },
      })

      const result = await getLatestExchangeRate(supabase)
      expect(result).toBeNull()
    })
  })

  describe("getExchangeRateWithFallback", () => {
    it("should return exact rate when available", async () => {
      const supabase = createMockSupabase({
        rpcResult: { data: 1450, error: null },
      })

      const result = await getExchangeRateWithFallback(supabase, "2026-03-01", "test")
      expect(result).toEqual({ rate: 1450, source: "exact" })
    })

    it("should fallback to latest rate", async () => {
      const supabase = createMockSupabase({
        rpcResult: { data: null, error: { code: "PGRST202", message: "not found" } },
        selectResult: { data: { rate: "1500" }, error: null },
      })

      const result = await getExchangeRateWithFallback(supabase, "2026-03-01", "test")
      expect(result.rate).toBe(1500)
    })

    it("should return fallback rate of 1500 when no rates at all", async () => {
      const supabase = createMockSupabase({
        rpcResult: { data: null, error: { code: "PGRST202", message: "not found" } },
        selectResult: { data: null, error: null },
      })

      const errorSpy = jest.spyOn(console, "error").mockImplementation()
      const result = await getExchangeRateWithFallback(supabase, "2026-03-01", "test")
      // El fallback se actualizó de 1450 → 1500 (valor más cercano al mercado
      // 2026). Override-eable con env USD_ARS_EMERGENCY_RATE. Ver
      // lib/accounting/exchange-rates.ts::DEFAULT_USD_ARS_FALLBACK_RATE.
      expect(result).toEqual({ rate: 1500, source: "fallback" })
      errorSpy.mockRestore()
    })
  })
})
