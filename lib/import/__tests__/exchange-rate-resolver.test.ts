import { createExchangeRateResolver } from "../exchange-rate-resolver"

// Mock del módulo de accounting/exchange-rates
jest.mock("@/lib/accounting/exchange-rates", () => ({
  getExchangeRate: jest.fn(),
}))

import { getExchangeRate } from "@/lib/accounting/exchange-rates"

describe("createExchangeRateResolver", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("modo manual_fixed: usa siempre el rate manual", async () => {
    const supabase = {} as any
    const resolver = createExchangeRateResolver(supabase, {
      mode: "manual_fixed",
      manualRate: 1450,
    })

    const rate1 = await resolver(new Date("2026-01-15"))
    const rate2 = await resolver(new Date("2026-06-30"))

    expect(rate1).toBe(1450)
    expect(rate2).toBe(1450)
    expect(getExchangeRate).not.toHaveBeenCalled()
  })

  it("modo manual_fixed sin manualRate: throw error", () => {
    const supabase = {} as any
    expect(() =>
      createExchangeRateResolver(supabase, { mode: "manual_fixed" })
    ).toThrow("manualRate is required for manual_fixed mode")
  })

  it("modo monthly_rates: consulta BD por fecha", async () => {
    ;(getExchangeRate as jest.Mock).mockResolvedValueOnce(1500)
    const supabase = {} as any
    const resolver = createExchangeRateResolver(supabase, {
      mode: "monthly_rates",
    })

    const rate = await resolver(new Date("2026-03-15"))
    expect(rate).toBe(1500)
    expect(getExchangeRate).toHaveBeenCalledWith(supabase, expect.any(Date))
  })

  it("modo monthly_rates sin rate: throw error", async () => {
    ;(getExchangeRate as jest.Mock).mockResolvedValueOnce(null)
    const supabase = {} as any
    const resolver = createExchangeRateResolver(supabase, {
      mode: "monthly_rates",
    })

    await expect(resolver(new Date("2026-03-15"))).rejects.toThrow(
      /no exchange rate for/i
    )
  })

  it("modo monthly_with_fallback: usa BD; si no hay, fallback manual", async () => {
    ;(getExchangeRate as jest.Mock)
      .mockResolvedValueOnce(1500)
      .mockResolvedValueOnce(null)
    const supabase = {} as any
    const resolver = createExchangeRateResolver(supabase, {
      mode: "monthly_with_fallback",
      manualRate: 1450,
    })

    const rate1 = await resolver(new Date("2026-03-15"))
    const rate2 = await resolver(new Date("2026-06-30"))

    expect(rate1).toBe(1500)
    expect(rate2).toBe(1450) // fallback
  })

  it("cachea rates por fecha (no consulta dos veces la misma fecha)", async () => {
    ;(getExchangeRate as jest.Mock).mockResolvedValue(1500)
    const supabase = {} as any
    const resolver = createExchangeRateResolver(supabase, {
      mode: "monthly_rates",
    })

    const date = new Date("2026-03-15")
    await resolver(date)
    await resolver(date)
    await resolver(date)

    expect(getExchangeRate).toHaveBeenCalledTimes(1)
  })
})
