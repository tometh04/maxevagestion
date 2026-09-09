/** @jest-environment node */

import { computeOperationCommission } from "@/lib/commissions/calculate"
import { getCommissionBaseConfig } from "@/lib/commissions/net-base"
import { resolveSellerCommissionProfiles } from "@/lib/commissions/seller-commission-profile"
import {
  captureQuotationCommissionSnapshot,
  processNextQuotationConversionEffects,
  processQuotationConversionEffects,
} from "@/lib/quotations/conversion-effects"

jest.mock("@/lib/commissions/calculate", () => ({
  computeOperationCommission: jest.fn(),
}))
jest.mock("@/lib/commissions/net-base", () => ({
  getCommissionBaseConfig: jest.fn(),
}))
jest.mock("@/lib/commissions/seller-commission-profile", () => ({
  resolveSellerCommissionProfiles: jest.fn(),
}))

const profile = {
  sellerId: "seller-1",
  name: "Seller",
  percentage: 10,
  mode: "HALF" as const,
  source: "SELLER_RULE" as const,
  advisorManagerId: null,
  advisorManagerPercentage: null,
}

const frozenSnapshot = {
  schema_version: 1,
  captured_at: "2026-08-24T12:00:00.000Z",
  profiles: [profile],
  base_config: { enabled: true, rate: 0.105, from: "2026-01-01" },
}

const operationSnapshot = {
  id: "operation-1",
  org_id: "org-1",
  agency_id: "agency-1",
  seller_id: "seller-1",
  seller_secondary_id: null,
  commission_pct_primary: null,
  commission_pct_secondary: null,
  commission_split_mode: "AUTO",
  margin_amount: 1000,
  operation_date: "2026-08-24",
  file_code: "OP-1",
}

const plan = {
  entries: [{
    sellerId: "seller-1",
    role: "PRIMARY" as const,
    percentage: 10,
    amount: 89.5,
  }],
  totalCommission: 89.5,
  rule: "SOLO" as const,
  absorberId: null,
  warnings: [],
  pctPrimary: 10,
  pctSecondary: null,
  hasAdvisorManagerCommission: false,
}

function finishResponse(status: "COMPLETED" | "REVIEW") {
  return {
    finished: true,
    idempotent: false,
    status,
    attempts: 1,
    operation_id: "operation-1",
  }
}

describe("quotation conversion financial effects", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(resolveSellerCommissionProfiles as jest.Mock).mockResolvedValue(
      new Map([[profile.sellerId, profile]])
    )
    ;(getCommissionBaseConfig as jest.Mock).mockResolvedValue(frozenSnapshot.base_config)
    ;(computeOperationCommission as jest.Mock).mockReturnValue(plan)
  })

  it("congela perfiles y configuración antes de convertir", async () => {
    const snapshot = await captureQuotationCommissionSnapshot({
      supabase: {} as any,
      orgId: "org-1",
      agencyId: "agency-1",
      sellerIds: ["seller-1"],
    })

    expect(snapshot).toEqual(expect.objectContaining({
      schema_version: 1,
      profiles: [profile],
      base_config: frozenSnapshot.base_config,
    }))
    // Con la oficina: el porcentaje que se va a pagar depende de ella (VIB-188).
    expect(resolveSellerCommissionProfiles).toHaveBeenCalledWith(
      {},
      "org-1",
      ["seller-1"],
      "agency-1"
    )
    expect(getCommissionBaseConfig).toHaveBeenCalledWith({}, "agency-1")
  })

  it("calcula sólo desde snapshots y entrega el plan raw al finish atómico", async () => {
    const rpc = jest.fn(async (name: string, args: any) => {
      if (name === "claim_quotation_conversion_effects") {
        return {
          data: {
            claimed: true,
            status: "PROCESSING",
            commission_snapshot: frozenSnapshot,
            operation_snapshot: operationSnapshot,
            attempts: 1,
          },
          error: null,
        }
      }
      expect(name).toBe("finish_quotation_conversion_effects")
      expect(args).toEqual({
        p_operation_id: "operation-1",
        p_org_id: "org-1",
        p_expected_attempt: 1,
        p_outcome: "COMPLETED",
        p_error: null,
        p_commission_plan: plan,
      })
      return { data: finishResponse("COMPLETED"), error: null }
    })

    const result = await processQuotationConversionEffects({
      supabase: { rpc } as any,
      operationId: "operation-1",
      orgId: "org-1",
    })

    expect(result.status).toBe("COMPLETED")
    expect(computeOperationCommission).toHaveBeenCalledWith(
      expect.objectContaining({ id: "operation-1", margin_amount: 1000 }),
      new Map([[profile.sellerId, profile]]),
      frozenSnapshot.base_config
    )
    expect(resolveSellerCommissionProfiles).not.toHaveBeenCalled()
    expect(getCommissionBaseConfig).not.toHaveBeenCalled()
  })

  it("un retry COMPLETED no recalcula ni vuelve a escribir", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        claimed: false,
        status: "COMPLETED",
        commission_snapshot: frozenSnapshot,
        operation_snapshot: operationSnapshot,
        attempts: 1,
      },
      error: null,
    })

    const result = await processQuotationConversionEffects({
      supabase: { rpc } as any,
      operationId: "operation-1",
      orgId: "org-1",
    })

    expect(result).toEqual({ claimed: false, status: "COMPLETED", errors: [], warnings: [] })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(computeOperationCommission).not.toHaveBeenCalled()
  })

  it("marca REVIEW y crea una única alerta durable si el snapshot es inválido", async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null })
    const rpc = jest.fn(async (name: string, args: any) => {
      if (name === "claim_quotation_conversion_effects") {
        return {
          data: {
            claimed: true,
            status: "PROCESSING",
            commission_snapshot: { ...frozenSnapshot, schema_version: 99 },
            operation_snapshot: operationSnapshot,
            attempts: 1,
          },
          error: null,
        }
      }
      expect(args.p_outcome).toBe("REVIEW")
      expect(args.p_commission_plan).toBeNull()
      return { data: finishResponse("REVIEW"), error: null }
    })
    const supabase = {
      rpc,
      from: jest.fn(() => ({ upsert })),
    } as any

    const result = await processQuotationConversionEffects({
      supabase,
      operationId: "operation-1",
      orgId: "org-1",
    })

    expect(result.status).toBe("REVIEW")
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      org_id: "org-1",
      operation_id: "operation-1",
      type: "OTHER",
      status: "PENDING",
    }), { onConflict: "id" })
  })

  it("el cron consume el lease batch sin ejecutar un segundo claim individual", async () => {
    const rpc = jest.fn(async (name: string, args: any) => {
      if (name === "claim_next_quotation_conversion_effects") {
        expect(args).toEqual({ p_limit: 20, p_lease_seconds: 300 })
        return {
          data: {
            claimed: 1,
            jobs: [{
              claimed: true,
              status: "PROCESSING",
              commission_snapshot: frozenSnapshot,
              operation_snapshot: operationSnapshot,
              attempts: 1,
              operation_id: "operation-1",
              org_id: "org-1",
            }],
          },
          error: null,
        }
      }
      expect(name).toBe("finish_quotation_conversion_effects")
      return { data: finishResponse("COMPLETED"), error: null }
    })

    const result = await processNextQuotationConversionEffects({
      supabase: { rpc } as any,
      limit: 20,
    })

    expect(result).toEqual({
      claimed: 1,
      completed: 1,
      review: 0,
      processing: 0,
      errors: [],
    })
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "claim_next_quotation_conversion_effects",
      "finish_quotation_conversion_effects",
    ])
  })
})
