/**
 * @jest-environment node
 */
import { POST } from "./route"

// Factory mocks para no cargar los módulos reales (lib/auth ejecuta React.cache
// a nivel módulo, que no está disponible en el entorno node de jest).
jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }))
jest.mock("@/lib/supabase/server", () => ({
  createServerClient: jest.fn(),
  createAdminClient: jest.fn(),
}))
jest.mock("@/lib/auth/platform", () => ({ isPlatformAdmin: jest.fn() }))
jest.mock("@/lib/security/audit", () => ({ logSecurityEvent: jest.fn() }))
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))
jest.mock("@/lib/billing/plan-pricing", () => ({ resolvePlanPrice: jest.fn() }))
jest.mock("@/lib/billing/mp-update", () => ({ applyPriceChange: jest.fn() }))

import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { resolvePlanPrice } from "@/lib/billing/plan-pricing"
import { applyPriceChange } from "@/lib/billing/mp-update"

const mockGetUser = getCurrentUser as jest.Mock
const mockServerClient = createServerClient as jest.Mock
const mockAdminClient = createAdminClient as jest.Mock
const mockIsPA = isPlatformAdmin as jest.Mock
const mockResolvePrice = resolvePlanPrice as jest.Mock
const mockApplyPriceChange = applyPriceChange as jest.Mock

function makeReq(body: any) {
  return new Request("http://test.local/api/admin/orgs/o1/change-plan", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}
const params = Promise.resolve({ id: "org-1" })

function makeAdmin({ org, customPlan = null }: { org: any; customPlan?: any }) {
  const updateSpy = jest.fn()
  const insertSpy = jest.fn().mockResolvedValue({ error: null })
  const deleteEq = jest.fn().mockResolvedValue({ error: null })
  const from = jest.fn((table: string) => {
    if (table === "organizations") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: org, error: null }) }) }),
        update: (payload: any) => {
          updateSpy(payload)
          return { eq: async () => ({ error: null }) }
        },
      }
    }
    if (table === "custom_plans") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: customPlan, error: null }) }) }),
        delete: () => ({ eq: deleteEq }),
      }
    }
    if (table === "billing_events") {
      return { insert: insertSpy }
    }
    return {}
  })
  return { client: { from }, updateSpy, insertSpy, deleteEq }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetUser.mockResolvedValue({ user: { id: "u1", auth_id: "a1" } })
  mockServerClient.mockResolvedValue({} as any)
  mockIsPA.mockResolvedValue(true)
  mockResolvePrice.mockResolvedValue(119000)
})

describe("POST /api/admin/orgs/[id]/change-plan", () => {
  it("403 si no es platform admin", async () => {
    mockIsPA.mockResolvedValue(false)
    const res = await POST(makeReq({ plan: "PRO" }), { params })
    expect(res.status).toBe(403)
  })

  it("400 con plan inválido", async () => {
    const res = await POST(makeReq({ plan: "PLATINUM" }), { params })
    expect(res.status).toBe(400)
  })

  it("→ PRO sin preapproval: setea plan + límites PRO, no llama MP", async () => {
    const { client, updateSpy } = makeAdmin({
      org: { id: "org-1", plan: "ENTERPRISE", subscription_status: "ACTIVE", mp_preapproval_id: null, custom_plan_id: null },
    })
    mockAdminClient.mockReturnValue(client)

    const res = await POST(makeReq({ plan: "PRO" }), { params })
    expect(res.status).toBe(200)
    expect(mockApplyPriceChange).not.toHaveBeenCalled()
    const payload = updateSpy.mock.calls[0][0]
    expect(payload).toMatchObject({
      plan: "PRO",
      max_operations_per_month: 99999,
      custom_plan_id: null,
      scheduled_plan: null,
    })
  })

  it("→ PRO con preapproval in-place: reprograma MP y no cambia status", async () => {
    mockApplyPriceChange.mockResolvedValue({ action: "UPDATED_IN_PLACE" })
    const { client, updateSpy } = makeAdmin({
      org: { id: "org-1", plan: "ENTERPRISE", subscription_status: "ACTIVE", mp_preapproval_id: "pre_1", custom_plan_id: "cp_1", billing_email: "x@y.com" },
      customPlan: { id: "cp_1", base_price_ars: 200000, discount_percent: 0 },
    })
    mockAdminClient.mockReturnValue(client)

    const res = await POST(makeReq({ plan: "PRO" }), { params })
    expect(res.status).toBe(200)
    expect(mockApplyPriceChange).toHaveBeenCalledWith(
      expect.objectContaining({ preapprovalId: "pre_1", newAmount: 119000 }),
    )
    const payload = updateSpy.mock.calls[0][0]
    expect(payload.subscription_status).toBeUndefined() // in-place no cambia status
    expect(payload.custom_plan_id).toBeNull()
  })

  it("→ PRO con aumento > 20% (REAUTH): setea nuevo preapproval + PAST_DUE", async () => {
    mockApplyPriceChange.mockResolvedValue({
      action: "REAUTH_REQUIRED",
      newPreapprovalId: "pre_new",
      checkoutUrl: "https://mp/checkout",
    })
    const { client, updateSpy } = makeAdmin({
      org: { id: "org-1", plan: "PRO", subscription_status: "ACTIVE", mp_preapproval_id: "pre_old", custom_plan_id: null, billing_email: "x@y.com" },
    })
    mockAdminClient.mockReturnValue(client)

    const res = await POST(makeReq({ plan: "PRO" }), { params })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.reauth_checkout_url).toBe("https://mp/checkout")
    const payload = updateSpy.mock.calls[0][0]
    expect(payload.mp_preapproval_id).toBe("pre_new")
    expect(payload.subscription_status).toBe("PAST_DUE")
  })

  it("→ PRO devuelve 502 si MP falla, sin tocar la DB", async () => {
    mockApplyPriceChange.mockRejectedValue(new Error("MP down"))
    const { client, updateSpy } = makeAdmin({
      org: { id: "org-1", plan: "ENTERPRISE", subscription_status: "ACTIVE", mp_preapproval_id: "pre_1", custom_plan_id: null, billing_email: "x@y.com" },
    })
    mockAdminClient.mockReturnValue(client)

    const res = await POST(makeReq({ plan: "PRO" }), { params })
    expect(res.status).toBe(502)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("→ ENTERPRISE: setea plan + límites altos, no llama MP", async () => {
    const { client, updateSpy } = makeAdmin({
      org: { id: "org-1", plan: "PRO", subscription_status: "ACTIVE", mp_preapproval_id: "pre_1", custom_plan_id: null, billing_email: "x@y.com" },
    })
    mockAdminClient.mockReturnValue(client)

    const res = await POST(makeReq({ plan: "ENTERPRISE" }), { params })
    expect(res.status).toBe(200)
    expect(mockApplyPriceChange).not.toHaveBeenCalled()
    const payload = updateSpy.mock.calls[0][0]
    expect(payload).toMatchObject({ plan: "ENTERPRISE", max_users: 999 })
    expect(payload.custom_plan_id).toBeUndefined() // no toca el custom en enterprise
  })
})
