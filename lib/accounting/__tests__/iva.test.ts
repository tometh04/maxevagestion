import {
  calculateSaleIVA,
  calculatePurchaseIVA,
  getMonthlyIVAToPay,
} from "../iva"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

// Mock Supabase client
const createMockSupabase = () => {
  return {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        gte: jest.fn(() => ({
          lte: jest.fn(() => ({
            data: [],
            error: null,
          })),
        })),
      })),
    })),
  } as unknown as SupabaseClient<Database>
}

describe("IVA Service", () => {
  describe("calculateSaleIVA", () => {
    it("should calculate IVA correctly for a sale", () => {
      const result = calculateSaleIVA(1210) // 1000 neto + 210 IVA
      expect(result.net_amount).toBeCloseTo(1000, 2)
      expect(result.iva_amount).toBeCloseTo(210, 2)
    })

    it("should handle decimal amounts correctly", () => {
      const result = calculateSaleIVA(1210.5)
      expect(result.net_amount).toBeCloseTo(1000.41, 2)
      expect(result.iva_amount).toBeCloseTo(210.09, 2)
    })

    it("should round to 2 decimal places", () => {
      const result = calculateSaleIVA(1000)
      expect(result.net_amount.toString().split(".")[1]?.length || 0).toBeLessThanOrEqual(2)
      expect(result.iva_amount.toString().split(".")[1]?.length || 0).toBeLessThanOrEqual(2)
    })

    it("should handle zero amount", () => {
      const result = calculateSaleIVA(0)
      expect(result.net_amount).toBe(0)
      expect(result.iva_amount).toBe(0)
    })
  })

  describe("calculatePurchaseIVA", () => {
    it("should calculate IVA correctly for a purchase", () => {
      const result = calculatePurchaseIVA(1210) // 1000 neto + 210 IVA
      expect(result.net_amount).toBeCloseTo(1000, 2)
      expect(result.iva_amount).toBeCloseTo(210, 2)
    })

    it("should handle decimal amounts correctly", () => {
      const result = calculatePurchaseIVA(1210.5)
      expect(result.net_amount).toBeCloseTo(1000.41, 2)
      expect(result.iva_amount).toBeCloseTo(210.09, 2)
    })

    it("should round to 2 decimal places", () => {
      const result = calculatePurchaseIVA(1000)
      expect(result.net_amount.toString().split(".")[1]?.length || 0).toBeLessThanOrEqual(2)
      expect(result.iva_amount.toString().split(".")[1]?.length || 0).toBeLessThanOrEqual(2)
    })

    it("should handle zero amount", () => {
      const result = calculatePurchaseIVA(0)
      expect(result.net_amount).toBe(0)
      expect(result.iva_amount).toBe(0)
    })
  })

  describe("getMonthlyIVAToPay", () => {
    it("should calculate IVA to pay correctly", async () => {
      const mockSupabase = createMockSupabase()
      const fromMock = mockSupabase.from as jest.Mock

      // Mock sales IVA
      fromMock.mockReturnValueOnce({
        select: jest.fn(() => ({
          gte: jest.fn(() => ({
            lte: jest.fn(() => ({
              data: [{ iva_amount: "210" }, { iva_amount: "105" }],
              error: null,
            })),
          })),
        })),
      })

      // Mock purchases IVA
      fromMock.mockReturnValueOnce({
        select: jest.fn(() => ({
          gte: jest.fn(() => ({
            lte: jest.fn(() => ({
              data: [{ iva_amount: "50" }],
              error: null,
            })),
          })),
        })),
      })

      const result = await getMonthlyIVAToPay(mockSupabase, 2025, 11)

      expect(result.total_sales_iva).toBe(315)
      expect(result.total_purchases_iva).toBe(50)
      expect(result.iva_to_pay).toBe(265)
    })

    it("should handle empty data", async () => {
      const mockSupabase = createMockSupabase()
      const fromMock = mockSupabase.from as jest.Mock

      // Mock empty sales IVA
      fromMock.mockReturnValueOnce({
        select: jest.fn(() => ({
          gte: jest.fn(() => ({
            lte: jest.fn(() => ({
              data: [],
              error: null,
            })),
          })),
        })),
      })

      // Mock empty purchases IVA
      fromMock.mockReturnValueOnce({
        select: jest.fn(() => ({
          gte: jest.fn(() => ({
            lte: jest.fn(() => ({
              data: [],
              error: null,
            })),
          })),
        })),
      })

      const result = await getMonthlyIVAToPay(mockSupabase, 2025, 11)

      expect(result.total_sales_iva).toBe(0)
      expect(result.total_purchases_iva).toBe(0)
      expect(result.iva_to_pay).toBe(0)
    })

    it("should handle null iva_amount values", async () => {
      const mockSupabase = createMockSupabase()
      const fromMock = mockSupabase.from as jest.Mock

      // Mock sales IVA with null values
      fromMock.mockReturnValueOnce({
        select: jest.fn(() => ({
          gte: jest.fn(() => ({
            lte: jest.fn(() => ({
              data: [{ iva_amount: "210" }, { iva_amount: null }],
              error: null,
            })),
          })),
        })),
      })

      // Mock purchases IVA
      fromMock.mockReturnValueOnce({
        select: jest.fn(() => ({
          gte: jest.fn(() => ({
            lte: jest.fn(() => ({
              data: [],
              error: null,
            })),
          })),
        })),
      })

      const result = await getMonthlyIVAToPay(mockSupabase, 2025, 11)

      expect(result.total_sales_iva).toBe(210)
      expect(result.total_purchases_iva).toBe(0)
      expect(result.iva_to_pay).toBe(210)
    })
  })
})

