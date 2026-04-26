/**
 * @jest-environment node
 */
import { PATCH } from "@/app/api/admin/orgs/[id]/profile/route"

jest.mock("@/lib/auth")
jest.mock("@/lib/supabase/server")
jest.mock("@/lib/auth/platform")
jest.mock("@/lib/security/audit")

import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { logSecurityEvent } from "@/lib/security/audit"

const mockGetUser = getCurrentUser as jest.Mock
const mockServerClient = createServerClient as jest.Mock
const mockAdminClient = createAdminClient as jest.Mock
const mockIsPA = isPlatformAdmin as jest.Mock
const mockLog = logSecurityEvent as jest.Mock

function makeReq(body: any) {
  return new Request("http://test.local/api/admin/orgs/abc/profile", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

const params = Promise.resolve({ id: "org-123" })

/** Build a minimal admin client mock that returns the provided org row */
function makeAdminMock({
  orgRow = { id: "org-123", internal_notes: null },
  upsertError = null as any,
  settingsAfter = [] as any[],
}: {
  orgRow?: any
  upsertError?: any
  settingsAfter?: any[]
} = {}) {
  return {
    from: jest.fn((table: string) => {
      if (table === "organizations") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: orgRow, error: null }) }) }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        }
      }
      // organization_settings
      return {
        select: () => ({
          eq: () => ({
            in: () => Promise.resolve({ data: settingsAfter, error: null }),
          }),
        }),
        upsert: () => Promise.resolve({ error: upsertError }),
      }
    }),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetUser.mockResolvedValue({ user: { id: "user-1", auth_id: "auth-1" } })
  mockServerClient.mockResolvedValue({} as any)
  mockIsPA.mockResolvedValue(true)
  mockLog.mockResolvedValue(undefined)
})

describe("PATCH /api/admin/orgs/[id]/profile", () => {
  it("returns 403 when caller is not platform admin", async () => {
    mockIsPA.mockResolvedValue(false)
    const res = await PATCH(makeReq({ settings: { company_name: "x" } }), { params })
    expect(res.status).toBe(403)
  })

  it("returns 400 when no fields to update", async () => {
    mockAdminClient.mockReturnValue(makeAdminMock())
    const res = await PATCH(makeReq({}), { params })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/No fields/)
  })

  it("returns 400 when tax_id is not 11 digits", async () => {
    mockAdminClient.mockReturnValue(makeAdminMock())
    const res = await PATCH(makeReq({ settings: { tax_id: "1234" } }), { params })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/CUIT/)
  })

  it("strips dashes from tax_id before saving", async () => {
    const adminMock = makeAdminMock()
    mockAdminClient.mockReturnValue(adminMock)
    const upsertSpy = jest.spyOn(
      adminMock.from("organization_settings") as any,
      "upsert",
    )

    // Rebuild mock so spy is on the actual call path
    const upsertFn = jest.fn().mockResolvedValue({ error: null })
    mockAdminClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === "organizations") {
          return {
            select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "org-123", internal_notes: null }, error: null }) }) }),
          }
        }
        return {
          select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }),
          upsert: upsertFn,
        }
      }),
    })

    const res = await PATCH(makeReq({ settings: { tax_id: "30-12345678-9" } }), { params })
    expect(res.status).toBe(200)
    expect(upsertFn).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ key: "tax_id", value: "30123456789" }),
      ]),
      expect.anything(),
    )
  })

  it("writes settings to organization_settings table", async () => {
    const upsertFn = jest.fn().mockResolvedValue({ error: null })
    mockAdminClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === "organizations") {
          return {
            select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "org-123", internal_notes: null }, error: null }) }) }),
          }
        }
        return {
          select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }),
          upsert: upsertFn,
        }
      }),
    })

    const res = await PATCH(
      makeReq({ settings: { company_name: "Maxeva", email: "info@maxeva.com" } }),
      { params },
    )
    expect(res.status).toBe(200)
    expect(upsertFn).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ key: "company_name", value: "Maxeva", org_id: "org-123" }),
        expect.objectContaining({ key: "email", value: "info@maxeva.com", org_id: "org-123" }),
      ]),
      expect.anything(),
    )
  })

  it("syncs company_address when address is written", async () => {
    const upsertFn = jest.fn().mockResolvedValue({ error: null })
    mockAdminClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === "organizations") {
          return {
            select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "org-123", internal_notes: null }, error: null }) }) }),
          }
        }
        return {
          select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }),
          upsert: upsertFn,
        }
      }),
    })

    await PATCH(makeReq({ settings: { address: "Av. Pellegrini 1234" } }), { params })

    expect(upsertFn).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ key: "address", value: "Av. Pellegrini 1234" }),
        expect.objectContaining({ key: "company_address", value: "Av. Pellegrini 1234" }),
      ]),
      expect.anything(),
    )
  })

  it("writes internal_notes to organizations table", async () => {
    const updateFn = jest.fn().mockReturnValue({ eq: () => Promise.resolve({ error: null }) })
    mockAdminClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === "organizations") {
          return {
            select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "org-123", internal_notes: null }, error: null }) }) }),
            update: updateFn,
          }
        }
        return {
          select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }),
          upsert: jest.fn().mockResolvedValue({ error: null }),
        }
      }),
    })

    const res = await PATCH(makeReq({ internal_notes: "some note" }), { params })
    expect(res.status).toBe(200)
    expect(updateFn).toHaveBeenCalledWith({ internal_notes: "some note" })
  })

  it("logs ORG_PROFILE_UPDATED_BY_ADMIN audit event on success", async () => {
    mockAdminClient.mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === "organizations") {
          return {
            select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "org-123", internal_notes: null }, error: null }) }) }),
          }
        }
        return {
          select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [{ key: "company_name", value: "Maxeva" }], error: null }) }) }),
          upsert: jest.fn().mockResolvedValue({ error: null }),
        }
      }),
    })

    await PATCH(makeReq({ settings: { company_name: "Maxeva" } }), { params })

    expect(mockLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "ORG_PROFILE_UPDATED_BY_ADMIN",
        targetOrgId: "org-123",
        targetEntity: "organizations",
        targetEntityId: "org-123",
        details: expect.objectContaining({
          changed_fields: expect.arrayContaining(["settings.company_name"]),
        }),
      }),
    )
  })
})
