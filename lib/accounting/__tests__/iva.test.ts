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
    it("should calculate IVA over margin (sale - operator_cost)", () => {
      // Nueva semántica: el total es la ganancia bruta (margin), IVA se
      // calcula sobre margin. Con operatorCost=0 (default), margin=1210.
      // Rate INTERMEDIACION 21%. iva=254.10; net=955.90.
      const result = calculateSaleIVA(1210)
      expect(result.margin).toBeCloseTo(1210, 2)
      expect(result.iva_amount).toBeCloseTo(254.1, 2)
      expect(result.net_amount).toBeCloseTo(955.9, 2)
      expect(result.iva_rate).toBe(0.21)
    })

    it("should handle decimal amounts correctly", () => {
      // margin=1210.5; iva=254.205→254.21; net=956.295→956.30
      const result = calculateSaleIVA(1210.5)
      expect(result.margin).toBeCloseTo(1210.5, 2)
      expect(result.iva_amount).toBeCloseTo(254.21, 2)
      expect(result.net_amount).toBeCloseTo(956.3, 2)
    })

    it("should calculate correctly with operator cost (real margin)", () => {
      // saleTotal=1210, operatorCost=210 → margin=1000, iva=210, net=790
      const result = calculateSaleIVA(1210, 210)
      expect(result.margin).toBeCloseTo(1000, 2)
      expect(result.iva_amount).toBeCloseTo(210, 2)
      expect(result.net_amount).toBeCloseTo(790, 2)
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

      expect(result.ars.total_sales_iva).toBe(315)
      expect(result.ars.total_purchases_iva).toBe(50)
      expect(result.ars.iva_to_pay).toBe(265)
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

      expect(result.ars.total_sales_iva).toBe(0)
      expect(result.ars.total_purchases_iva).toBe(0)
      expect(result.ars.iva_to_pay).toBe(0)
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

      expect(result.ars.total_sales_iva).toBe(210)
      expect(result.ars.total_purchases_iva).toBe(0)
      expect(result.ars.iva_to_pay).toBe(210)
    })
  })
})

