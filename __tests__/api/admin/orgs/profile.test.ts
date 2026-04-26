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
    const res = await PATCH(makeReq({ contact_name: "x" }), { params })
    expect(res.status).toBe(403)
  })

  it("returns 400 when CUIT is not 11 digits", async () => {
    const res = await PATCH(makeReq({ cuit: "1234" }), { params })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/CUIT/)
  })

  it("strips dashes from CUIT before saving", async () => {
    const updateMock = jest.fn().mockReturnThis()
    const eqMock = jest.fn().mockReturnThis()
    const selectMock = jest.fn().mockReturnThis()
    const singleMock = jest.fn().mockResolvedValue({ data: { cuit: "30123456789" }, error: null })
    const maybeSingleMock = jest.fn().mockResolvedValue({ data: { cuit: null }, error: null })
    const fromMock = jest.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
      update: updateMock,
    }))
    updateMock.mockImplementation(() => ({ eq: eqMock }))
    eqMock.mockImplementation(() => ({ select: selectMock }))
    selectMock.mockImplementation(() => ({ single: singleMock }))
    mockAdminClient.mockReturnValue({ from: fromMock })

    const res = await PATCH(makeReq({ cuit: "30-12345678-9" }), { params })
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ cuit: "30123456789" }))
  })

  it("returns 400 for invalid tax_category", async () => {
    const res = await PATCH(makeReq({ tax_category: "FOO" }), { params })
    expect(res.status).toBe(400)
  })

  it("logs ORG_PROFILE_UPDATED_BY_ADMIN audit event on success", async () => {
    const fromMock = jest.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle: () =>
        Promise.resolve({ data: { contact_name: null }, error: null }) }) }),
      update: () => ({ eq: () => ({ select: () => ({ single: () =>
        Promise.resolve({ data: { contact_name: "Maxi" }, error: null }) }) }) }),
    }))
    mockAdminClient.mockReturnValue({ from: fromMock })

    await PATCH(makeReq({ contact_name: "Maxi" }), { params })

    expect(mockLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "ORG_PROFILE_UPDATED_BY_ADMIN",
        target_org_id: "org-123",
        details: expect.objectContaining({
          changed_fields: ["contact_name"],
        }),
      }),
    )
  })
})
