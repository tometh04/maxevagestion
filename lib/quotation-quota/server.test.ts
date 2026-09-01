import {
  assertQuotationCreationAvailable,
  getQuotationQuotaUsage,
} from "./server"
import { QuotationQuotaExhaustedError } from "./types"

function clientWith(data: unknown, error: any = null) {
  return { rpc: jest.fn().mockResolvedValue({ data, error }) }
}

describe("quotation quota server contract", () => {
  it("normalizes the shared pool and agency breakdown returned by the RPC", async () => {
    const client = clientWith({
      configured: true,
      period_id: "period-1",
      starts_at: "2026-08-01T00:00:00.000Z",
      ends_at: "2026-09-01T00:00:00.000Z",
      included: 20,
      extra: 5,
      limit: 25,
      used: 7,
      remaining: 18,
      at_limit: false,
      enforcement_enabled: true,
      agencies: [{ agency_id: "agency-1", agency_name: "Centro", used: 7 }],
    })

    await expect(getQuotationQuotaUsage(client, "org-1", ["agency-1"]))
      .resolves.toMatchObject({ limit: 25, used: 7, remaining: 18 })
    expect(client.rpc).toHaveBeenCalledWith("get_quotation_quota_usage", {
      p_org_id: "org-1",
      p_agency_ids: ["agency-1"],
    })
  })

  it("blocks quotation creation only when enforcement is active and the pool is exhausted", async () => {
    const client = clientWith({
      configured: true,
      period_id: "period-1",
      included: 10,
      extra: 0,
      limit: 10,
      used: 10,
      remaining: 0,
      at_limit: true,
      enforcement_enabled: true,
      agencies: [],
    })

    await expect(assertQuotationCreationAvailable(client, "org-1"))
      .rejects.toBeInstanceOf(QuotationQuotaExhaustedError)
  })

  it("keeps the current cycle in monitoring mode when enforcement is disabled", async () => {
    const client = clientWith({
      configured: true,
      period_id: "period-1",
      included: 0,
      limit: 0,
      used: 3,
      remaining: 0,
      at_limit: true,
      enforcement_enabled: false,
      agencies: [],
    })

    await expect(assertQuotationCreationAvailable(client, "org-1"))
      .resolves.toMatchObject({ at_limit: true, enforcement_enabled: false })
  })
})
