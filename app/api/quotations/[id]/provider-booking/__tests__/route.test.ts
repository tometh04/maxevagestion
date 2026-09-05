/** @jest-environment node */
import { getCurrentUser } from "@/lib/auth"
import { resolveAgencyPermissionScope } from "@/lib/permissions/agency-scope-server"
import { syncProviderBooking } from "@/lib/provider-booking/booking"
import { createAdminClient, createServerClient } from "@/lib/supabase/server"
import { GET } from "../route"

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }))
jest.mock("@/lib/permissions/agency-scope-server", () => ({ ...jest.requireActual("@/lib/permissions/agency-scope-server"), resolveAgencyPermissionScope: jest.fn() }))
jest.mock("@/lib/provider-booking/booking", () => ({ syncProviderBooking: jest.fn() }))
jest.mock("@/lib/supabase/server", () => ({ createAdminClient: jest.fn(), createServerClient: jest.fn() }))

function query(data: unknown) {
  const value: any = { maybeSingle: jest.fn().mockResolvedValue({ data, error: null }) }
  for (const key of ["select", "eq", "in"]) value[key] = jest.fn(() => value)
  return value
}
describe("quotation booking progress", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getCurrentUser as jest.Mock).mockResolvedValue({ user: { id: "seller", org_id: "org", role: "SELLER" } })
    ;(resolveAgencyPermissionScope as jest.Mock).mockResolvedValue({ userId: "seller", memberAgencyIds: ["agency"], agencyIds: ["agency"], fullAgencyIds: [], ownAgencyIds: ["agency"] })
    ;(createServerClient as jest.Mock).mockResolvedValue({})
    ;(syncProviderBooking as jest.Mock).mockResolvedValue({ status: "PENDING", result: { status: "confirmed", items: [{ client_item_id: "item", product: "flights", status: "confirmed", booking_id: "bkg_1", detail: { documents: "private" } }] } })
  })
  it("allows the owning seller and returns progress without the passenger snapshot", async () => {
    const quotation = query({ id: "quotation", org_id: "org", agency_id: "agency", seller_id: "seller" })
    const booking = query({ id: "tracking", remote_job_id: "job", agency_id: "agency" })
    ;(createAdminClient as jest.Mock).mockReturnValue({ from: (name: string) => name === "quotations" ? quotation : booking })
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "quotation" }) })
    expect(response.status).toBe(200)
    expect(JSON.stringify(await response.json())).not.toContain("private")
    expect(quotation.select).toHaveBeenCalledWith("id,org_id,agency_id,seller_id")
    expect(syncProviderBooking).toHaveBeenCalledWith(expect.objectContaining({ orgId: "org", agencyId: "agency" }))
  })
  it("does not synchronize another seller's quotation", async () => {
    ;(createAdminClient as jest.Mock).mockReturnValue({ from: () => query({ id: "quotation", agency_id: "agency", seller_id: "other" }) })
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "quotation" }) })
    expect(response.status).toBe(404)
    expect(syncProviderBooking).not.toHaveBeenCalled()
  })
})
