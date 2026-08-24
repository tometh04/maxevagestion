/** @jest-environment node */

import {
  applyAgencyPermissionScope,
  canAccessAgencyResource,
  resolveAgencyPermissionScope,
} from "@/lib/permissions/agency-scope-server"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { resolveUserPermissions } from "@/lib/permissions-agency"

jest.mock("@/lib/permissions-api", () => ({
  ...jest.requireActual("@/lib/permissions-api"),
  getUserAgencyIds: jest.fn(),
}))
jest.mock("@/lib/permissions-agency", () => ({
  ...jest.requireActual("@/lib/permissions-agency"),
  resolveUserPermissions: jest.fn(),
}))

const AGENCY_FULL = "11111111-1111-4111-8111-111111111111"
const AGENCY_OWN = "22222222-2222-4222-8222-222222222222"
const AGENCY_DENIED = "33333333-3333-4333-8333-333333333333"
const USER_ID = "44444444-4444-4444-8444-444444444444"

function matrix(write: boolean, ownDataOnly: boolean) {
  return {
    leads: { read: write, write, delete: false, export: false, ownDataOnly },
    operations: { read: write, write, delete: false, export: false, ownDataOnly },
  } as any
}

describe("agency permission scope", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getUserAgencyIds as jest.Mock).mockResolvedValue([
      AGENCY_FULL,
      AGENCY_OWN,
      AGENCY_DENIED,
    ])
    ;(resolveUserPermissions as jest.Mock).mockImplementation(
      async (_supabase: unknown, _userId: string, _orgId: string, _roles: string[], agencyIds: string[]) => {
        if (agencyIds[0] === AGENCY_FULL) return matrix(true, false)
        if (agencyIds[0] === AGENCY_OWN) return matrix(true, true)
        return matrix(false, false)
      }
    )
  })

  it("resolves every agency independently instead of merging an A permission into B", async () => {
    const scope = await resolveAgencyPermissionScope(
      {} as any,
      {
        id: USER_ID,
        org_id: "55555555-5555-4555-8555-555555555555",
        role: "SELLER",
        roles: ["SELLER"],
        is_independent_advisor: false,
      },
      "leads",
      "write"
    )

    expect(resolveUserPermissions).toHaveBeenCalledTimes(3)
    expect(resolveUserPermissions).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      USER_ID,
      expect.any(String),
      ["SELLER"],
      [AGENCY_FULL]
    )
    expect(scope.fullAgencyIds).toEqual([AGENCY_FULL])
    expect(scope.ownAgencyIds).toEqual([AGENCY_OWN])
    expect(scope.agencyIds).not.toContain(AGENCY_DENIED)
  })

  it("allows foreign sellers only inside full agencies", async () => {
    const scope = await resolveAgencyPermissionScope(
      {} as any,
      {
        id: USER_ID,
        org_id: "55555555-5555-4555-8555-555555555555",
        role: "SELLER",
        roles: ["SELLER"],
        is_independent_advisor: false,
      },
      "leads",
      "write"
    )

    expect(canAccessAgencyResource(scope, { agency_id: AGENCY_FULL, seller_id: "another-user" })).toBe(true)
    expect(canAccessAgencyResource(scope, { agency_id: AGENCY_OWN, seller_id: USER_ID })).toBe(true)
    expect(canAccessAgencyResource(scope, { agency_id: AGENCY_OWN, seller_id: "another-user" })).toBe(false)
    expect(canAccessAgencyResource(scope, { agency_id: AGENCY_DENIED, seller_id: USER_ID })).toBe(false)
  })

  it("emits one mixed PostgREST predicate without reading denied agencies", async () => {
    const scope = await resolveAgencyPermissionScope(
      {} as any,
      {
        id: USER_ID,
        org_id: "55555555-5555-4555-8555-555555555555",
        role: "SELLER",
        roles: ["SELLER"],
        is_independent_advisor: false,
      },
      "operations",
      "read"
    )
    const query: any = { or: jest.fn() }
    query.or.mockReturnValue(query)

    applyAgencyPermissionScope(query, scope)

    expect(query.or).toHaveBeenCalledWith(
      `agency_id.in.(${AGENCY_FULL}),and(agency_id.in.(${AGENCY_OWN}),seller_id.eq.${USER_ID})`
    )
    expect(query.or.mock.calls[0][0]).not.toContain(AGENCY_DENIED)
  })

  it("mantiene el membership de AVI en SELLER aunque tenga un rol adicional amplio", async () => {
    ;(getUserAgencyIds as jest.Mock).mockResolvedValue([AGENCY_OWN])

    const scope = await resolveAgencyPermissionScope(
      {} as any,
      {
        id: USER_ID,
        org_id: "55555555-5555-4555-8555-555555555555",
        role: "SELLER",
        roles: ["SELLER", "ADMIN"],
        is_independent_advisor: true,
      },
      "operations",
      "read"
    )

    expect(getUserAgencyIds).toHaveBeenCalledWith(expect.anything(), USER_ID, "SELLER")
    expect(scope.memberAgencyIds).toEqual([AGENCY_OWN])
    expect(scope.fullAgencyIds).toEqual([])
    expect(scope.ownAgencyIds).toEqual([AGENCY_OWN])
  })
})
