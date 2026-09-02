/** @jest-environment node */

jest.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => data,
    }),
  },
}))

import { getCurrentUser } from "@/lib/auth"
import { resolveAgencyPermissionScope } from "@/lib/permissions/agency-scope-server"
import { resolveAgencyEmiliaCredential } from "@/lib/emilia/agency-credential"
import { createAdminClient, createServerClient } from "@/lib/supabase/server"
import { GET } from "../route"

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }))
jest.mock("@/lib/permissions/agency-scope-server", () => ({
  ...jest.requireActual("@/lib/permissions/agency-scope-server"),
  resolveAgencyPermissionScope: jest.fn(),
}))
jest.mock("@/lib/emilia/agency-credential", () => ({ resolveAgencyEmiliaCredential: jest.fn() }))
jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: jest.fn(),
  createServerClient: jest.fn(),
}))

function query(data: unknown) {
  const value: any = {
    select: jest.fn(() => value),
    eq: jest.fn(() => value),
    in: jest.fn(() => value),
    maybeSingle: jest.fn().mockResolvedValue({ data, error: null }),
  }
  return value
}

describe("GET /api/quotations/[id]/provider-booking", () => {
  it("sincroniza el job remoto dentro del scope de la agencia", async () => {
    ;(getCurrentUser as jest.Mock).mockResolvedValue({ user: { id: "user-1", org_id: "org-1", role: "SELLER" } })
    ;(resolveAgencyPermissionScope as jest.Mock).mockResolvedValue({
      module: "operations",
      permission: "read",
      userId: "user-1",
      memberAgencyIds: ["agency-1"],
      agencyIds: ["agency-1"],
      fullAgencyIds: ["agency-1"],
      ownAgencyIds: [],
      permissionsByAgency: {},
    })
    const quotationQuery = query({ id: "quotation-1", org_id: "org-1", agency_id: "agency-1" })
    const bookingQuery = query({ id: "tracking-1", remote_job_id: "job-1", agency_id: "agency-1" })
    const updateQuery: any = {
      update: jest.fn(() => updateQuery),
      eq: jest.fn(() => updateQuery),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
    }
    const bookingTable = {
      select: bookingQuery.select,
      update: updateQuery.update,
    }
    ;(createServerClient as jest.Mock).mockResolvedValue({})
    ;(createAdminClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => table === "quotations" ? quotationQuery : bookingTable),
    })
    ;(resolveAgencyEmiliaCredential as jest.Mock).mockResolvedValue({ apiKey: "test-key" })
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      schema_version: "provider-booking-job.v1",
      job_id: "22222222-2222-4222-8222-222222222222",
      request_id: "33333333-3333-4333-8333-333333333333",
      status: "completed",
      stage: "confirmed",
      result: { status: "confirmed", booking_group_id: "group-1", items: [] },
    }), { status: 200 })) as typeof fetch

    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "quotation-1" }) })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { status: "CONFIRMED", result: expect.objectContaining({ status: "confirmed" }) } })
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/provider-bookings/job-1"), expect.objectContaining({
      headers: { authorization: "Bearer test-key" },
    }))
    expect(updateQuery.update).toHaveBeenCalledWith(expect.objectContaining({
      status: "CONFIRMED",
      result: expect.objectContaining({ status: "confirmed" }),
    }))
  })
})
