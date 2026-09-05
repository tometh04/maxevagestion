/** @jest-environment node */
import { getCurrentUser } from "@/lib/auth"
import { createAdminClient, createServerClient } from "@/lib/supabase/server"
import { resolveAgencyPermissionScope } from "@/lib/permissions/agency-scope-server"
import {
  getReservation,
  listReservations,
  syncReservations
} from "@/lib/provider-booking/reservations"
import { GET, POST } from "../route"
import { GET as detail } from "../[id]/route"

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }))
jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: jest.fn(),
  createServerClient: jest.fn()
}))
jest.mock("@/lib/permissions/agency-scope-server", () => ({
  resolveAgencyPermissionScope: jest.fn()
}))
jest.mock("@/lib/provider-booking/reservations", () => ({
  ...jest.requireActual("@/lib/provider-booking/reservations"),
  listReservations: jest.fn(),
  getReservation: jest.fn(),
  syncReservations: jest.fn()
}))
const id = "11111111-1111-4111-8111-111111111111"
describe("reservations HTTP access", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getCurrentUser as jest.Mock).mockResolvedValue({
      user: { id: "seller", org_id: "org", role: "SELLER" }
    })
    ;(createServerClient as jest.Mock).mockResolvedValue({})
    ;(createAdminClient as jest.Mock).mockReturnValue({})
    ;(resolveAgencyPermissionScope as jest.Mock).mockResolvedValue({
      agencyIds: ["agency"],
      userId: "seller",
      ownAgencyIds: ["agency"],
      fullAgencyIds: []
    })
  })
  it("denies missing tenant before creating a privileged client", async () => {
    ;(getCurrentUser as jest.Mock).mockResolvedValue({ user: { id: "seller", org_id: null } })
    expect((await GET(new Request("https://vibook.test/api/operations/reservations"))).status).toBe(
      400
    )
    expect(createAdminClient).not.toHaveBeenCalled()
  })
  it("denies revoked operation access to both list and sync", async () => {
    ;(resolveAgencyPermissionScope as jest.Mock).mockResolvedValue({ agencyIds: [] })
    expect((await GET(new Request("https://vibook.test/api/operations/reservations"))).status).toBe(
      403
    )
    expect(
      (
        await POST(
          new Request("https://vibook.test/api/operations/reservations", {
            method: "POST",
            body: JSON.stringify({ bookingIds: [id] })
          })
        )
      ).status
    ).toBe(403)
    expect(listReservations).not.toHaveBeenCalled()
    expect(syncReservations).not.toHaveBeenCalled()
  })
  it("passes the authenticated tenant and own-data scope to the detail and hides missing rows", async () => {
    ;(getReservation as jest.Mock).mockResolvedValue(null)
    const response = await detail(new Request("https://vibook.test"), {
      params: Promise.resolve({ id })
    })
    expect(response.status).toBe(404)
    expect(getReservation).toHaveBeenCalledWith(
      {},
      "org",
      expect.objectContaining({ ownAgencyIds: ["agency"], userId: "seller" }),
      id
    )
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
  })
  it("rejects malformed sync input before reading reservations", async () => {
    const response = await POST(
      new Request("https://vibook.test", {
        method: "POST",
        body: JSON.stringify({ bookingIds: [id], org_id: "foreign" })
      })
    )
    expect(response.status).toBe(400)
    expect(syncReservations).not.toHaveBeenCalled()
  })
})
