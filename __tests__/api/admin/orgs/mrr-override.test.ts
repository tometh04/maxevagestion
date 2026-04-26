/**
 * @jest-environment node
 */
import { PATCH } from "@/app/api/admin/orgs/[id]/mrr-override/route"

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
  return new Request("http://test.local/api/admin/orgs/abc/mrr-override", {
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

describe("PATCH /api/admin/orgs/[id]/mrr-override", () => {
  it("returns 403 when caller is not platform admin", async () => {
    mockIsPA.mockResolvedValue(false)
    const res = await PATCH(makeReq({ amount: 1000 }), { params })
    expect(res.status).toBe(403)
  })

  it("returns 400 when amount is negative", async () => {
    const res = await PATCH(makeReq({ amount: -100 }), { params })
    expect(res.status).toBe(400)
  })

  it("returns 400 when amount is not a number or null", async () => {
    const res = await PATCH(makeReq({ amount: "not-a-number" }), { params })
    expect(res.status).toBe(400)
  })

  it("sets the override and logs audit event", async () => {
    const updateMock = jest.fn().mockReturnThis()
    const eqMock = jest.fn().mockReturnThis()
    const selectMock = jest.fn().mockReturnThis()
    const singleMock = jest.fn().mockResolvedValue({
      data: { manual_mrr_override_ars: 719000 },
      error: null,
    })
    const maybeSingleMock = jest.fn().mockResolvedValue({
      data: { manual_mrr_override_ars: null },
      error: null,
    })
    const fromMock = jest.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
      update: updateMock,
    }))
    updateMock.mockImplementation(() => ({ eq: eqMock }))
    eqMock.mockImplementation(() => ({ select: selectMock }))
    selectMock.mockImplementation(() => ({ single: singleMock }))
    mockAdminClient.mockReturnValue({ from: fromMock })

    const res = await PATCH(makeReq({ amount: 719000 }), { params })
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith({ manual_mrr_override_ars: 719000 })
    expect(mockLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "MRR_OVERRIDE_UPDATED_BY_ADMIN",
        targetOrgId: "org-123",
        details: expect.objectContaining({
          before: { amount: null },
          after: { amount: 719000 },
        }),
      }),
    )
  })

  it("clears the override when amount is null", async () => {
    const updateMock = jest.fn().mockReturnThis()
    const eqMock = jest.fn().mockReturnThis()
    const selectMock = jest.fn().mockReturnThis()
    const singleMock = jest.fn().mockResolvedValue({
      data: { manual_mrr_override_ars: null },
      error: null,
    })
    const maybeSingleMock = jest.fn().mockResolvedValue({
      data: { manual_mrr_override_ars: 500000 },
      error: null,
    })
    const fromMock = jest.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
      update: updateMock,
    }))
    updateMock.mockImplementation(() => ({ eq: eqMock }))
    eqMock.mockImplementation(() => ({ select: selectMock }))
    selectMock.mockImplementation(() => ({ single: singleMock }))
    mockAdminClient.mockReturnValue({ from: fromMock })

    const res = await PATCH(makeReq({ amount: null }), { params })
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith({ manual_mrr_override_ars: null })
  })
})
