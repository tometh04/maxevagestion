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
import { createAdminClient, createServerClient } from "@/lib/supabase/server"
import { GET } from "./route"

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }))
jest.mock("@/lib/permissions/agency-scope-server", () => ({
  ...jest.requireActual("@/lib/permissions/agency-scope-server"),
  resolveAgencyPermissionScope: jest.fn(),
}))
jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: jest.fn(),
  createServerClient: jest.fn(),
}))

const AGENCY_B = "22222222-2222-4222-8222-222222222222"

describe("GET /api/quotations/cost-settings", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getCurrentUser as jest.Mock).mockResolvedValue({
      user: { id: "seller-1", org_id: "org-1", role: "SELLER", roles: ["SELLER"] },
    })
    ;(createServerClient as jest.Mock).mockResolvedValue({})
  })

  it("permite al SELLER leer sólo los defaults de su agencia B con leads.write", async () => {
    ;(resolveAgencyPermissionScope as jest.Mock).mockResolvedValue({
      userId: "seller-1",
      memberAgencyIds: [AGENCY_B],
      agencyIds: [AGENCY_B],
      fullAgencyIds: [],
      ownAgencyIds: [AGENCY_B],
      permissionsByAgency: {},
    })
    const query: any = {
      select: jest.fn(() => query),
      eq: jest.fn(() => query),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          default_cost_calculation_mode: "COMMISSIONABLE",
          default_commission_percentage: 15,
        },
        error: null,
      }),
    }
    ;(createAdminClient as jest.Mock).mockReturnValue({ from: jest.fn(() => query) })

    const response = await GET(new Request(
      `http://localhost/api/quotations/cost-settings?agency_id=${AGENCY_B}`
    ))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      default_cost_calculation_mode: "COMMISSIONABLE",
      default_commission_percentage: 15,
    })
    expect(query.eq).toHaveBeenCalledWith("agency_id", AGENCY_B)
  })

  it("no crea el cliente admin cuando la agencia no está autorizada", async () => {
    ;(resolveAgencyPermissionScope as jest.Mock).mockResolvedValue({
      userId: "seller-1",
      memberAgencyIds: [],
      agencyIds: [],
      fullAgencyIds: [],
      ownAgencyIds: [],
      permissionsByAgency: {},
    })

    const response = await GET(new Request(
      `http://localhost/api/quotations/cost-settings?agency_id=${AGENCY_B}`
    ))

    expect(response.status).toBe(404)
    expect(createAdminClient).not.toHaveBeenCalled()
  })
})
