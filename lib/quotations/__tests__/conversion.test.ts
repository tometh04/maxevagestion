/** @jest-environment node */

import {
  convertQuotationToOperation,
} from "@/lib/quotations/conversion"

const COMMISSION_SNAPSHOT = { schema_version: 1 }

describe("convertQuotationToOperation", () => {
  it("returns the verified result from the single transactional RPC", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        operation_id: "operation-1",
        file_code: "OP-20260824-ABC12345",
        services_created: 4,
        already_converted: false,
        operation: {
          id: "operation-1",
          org_id: "org-1",
          agency_id: "agency-1",
          margin_amount: 350,
        },
      },
      error: null,
    })

    const result = await convertQuotationToOperation({
      supabase: { rpc } as any,
      quotationId: "quotation-1",
      orgId: "org-1",
      agencyId: "agency-1",
      actorId: "user-1",
      fileCode: "OP-20260824-ABC12345",
      commissionSnapshot: COMMISSION_SNAPSHOT,
    })

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith("convert_quotation_to_operation", {
      p_quotation_id: "quotation-1",
      p_org_id: "org-1",
      p_agency_id: "agency-1",
      p_actor_id: "user-1",
      p_file_code: "OP-20260824-ABC12345",
      p_commission_snapshot: COMMISSION_SNAPSHOT,
    })
    expect(result).toEqual(expect.objectContaining({
      operationId: "operation-1",
      servicesCreated: 4,
      alreadyConverted: false,
    }))
  })

  it("maps an accepted-document mismatch to a retry-safe conflict", async () => {
    const promise = convertQuotationToOperation({
      supabase: {
        rpc: jest.fn().mockResolvedValue({
          data: null,
          error: { code: "23514", message: "active accepted document is missing" },
        }),
      } as any,
      quotationId: "quotation-1",
      orgId: "org-1",
      agencyId: "agency-1",
      actorId: "user-1",
      fileCode: "OP-20260824-ABC12345",
      commissionSnapshot: COMMISSION_SNAPSHOT,
    })

    await expect(promise).rejects.toMatchObject({
      code: "document_changed",
      status: 409,
    })
  })

  it("uses the price-confirmed transaction with the exact run and option", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        operation_id: "operation-1",
        file_code: "OP-20260824-ABC12345",
        services_created: 1,
        already_converted: false,
        operation: { id: "operation-1" },
      },
      error: null,
    })

    await convertQuotationToOperation({
      supabase: { rpc } as any,
      quotationId: "quotation-1",
      orgId: "org-1",
      agencyId: "agency-1",
      actorId: "user-1",
      fileCode: "OP-20260824-ABC12345",
      commissionSnapshot: COMMISSION_SNAPSHOT,
      priceRefreshRunId: "refresh-1",
      selectedOptionId: "option-1",
    })

    expect(rpc).toHaveBeenCalledWith("convert_price_confirmed_quotation_to_operation", expect.objectContaining({
      p_price_refresh_run_id: "refresh-1",
      p_selected_option_id: "option-1",
    }))
  })

  it("maps a stale price confirmation to a refreshable conflict", async () => {
    await expect(convertQuotationToOperation({
      supabase: {
        rpc: jest.fn().mockResolvedValue({
          data: null,
          error: { code: "55000", message: "price confirmation is missing, stale or expired" },
        }),
      } as any,
      quotationId: "quotation-1",
      orgId: "org-1",
      agencyId: "agency-1",
      actorId: "user-1",
      fileCode: "OP-20260824-ABC12345",
      commissionSnapshot: COMMISSION_SNAPSHOT,
      priceRefreshRunId: "refresh-1",
      selectedOptionId: "option-1",
    })).rejects.toMatchObject({
      code: "invalid_state",
      status: 409,
    })
  })

  it("maps the transactional monthly limit to a billing response", async () => {
    await expect(convertQuotationToOperation({
      supabase: {
        rpc: jest.fn().mockResolvedValue({
          data: null,
          error: {
            code: "P0001",
            message: "operation monthly plan limit reached",
          },
        }),
      } as any,
      quotationId: "quotation-1",
      orgId: "org-1",
      agencyId: "agency-1",
      actorId: "user-1",
      fileCode: "OP-20260824-ABC12345",
      commissionSnapshot: COMMISSION_SNAPSHOT,
    })).rejects.toMatchObject({
      code: "plan_limit",
      status: 403,
    })
  })

  it("rejects an unverifiable success payload", async () => {
    await expect(convertQuotationToOperation({
      supabase: {
        rpc: jest.fn().mockResolvedValue({
          data: { operation_id: "operation-1", services_created: "not-a-number" },
          error: null,
        }),
      } as any,
      quotationId: "quotation-1",
      orgId: "org-1",
      agencyId: "agency-1",
      actorId: "user-1",
      fileCode: "OP-20260824-ABC12345",
      commissionSnapshot: COMMISSION_SNAPSHOT,
    })).rejects.toMatchObject({
      code: "conversion_failed",
      status: 500,
    })
  })
})
