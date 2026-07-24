/**
 * @jest-environment node
 */
import { PATCH } from "./route"

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
  return new Request("http://test.local/api/admin/billing/plan-prices", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

/** admin.from("plan_prices") con snapshot (select→eq→maybeSingle) + upsert→select→single. */
function makeAdmin(opts: { before: any; upsertResult: { data: any; error: any } }) {
  const upsertSingle = jest.fn().mockResolvedValue(opts.upsertResult)
  const upsertSelect = jest.fn(() => ({ single: upsertSingle }))
  const upsertMock = jest.fn(() => ({ select: upsertSelect }))
  const maybeSingle = jest.fn().mockResolvedValue({ data: opts.before, error: null })
  const fromMock = jest.fn(() => ({
    select: () => ({ eq: () => ({ maybeSingle }) }),
    upsert: upsertMock,
  }))
  return { client: { from: fromMock }, upsertMock }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetUser.mockResolvedValue({ user: { id: "user-1", auth_id: "auth-1" } })
  mockServerClient.mockResolvedValue({} as any)
  mockIsPA.mockResolvedValue(true)
  mockLog.mockResolvedValue(undefined)
})

describe("PATCH /api/admin/billing/plan-prices", () => {
  it("403 si no es platform admin", async () => {
    mockIsPA.mockResolvedValue(false)
    const res = await PATCH(makeReq({ plan_id: "PRO", price_ars_monthly: 150000 }))
    expect(res.status).toBe(403)
  })

  it("400 con plan_id inválido", async () => {
    const res = await PATCH(makeReq({ plan_id: "PLATINUM", price_ars_monthly: 150000 }))
    expect(res.status).toBe(400)
  })

  it("400 con precio <= 0", async () => {
    const res = await PATCH(makeReq({ plan_id: "PRO", price_ars_monthly: 0 }))
    expect(res.status).toBe(400)
  })

  it("400 si PRO viene con precio null", async () => {
    const res = await PATCH(makeReq({ plan_id: "PRO", price_ars_monthly: null }))
    expect(res.status).toBe(400)
  })

  it("setea el precio de PRO y loguea audit", async () => {
    const { client, upsertMock } = makeAdmin({
      before: { plan_id: "PRO", price_ars_monthly: 119000 },
      upsertResult: { data: { plan_id: "PRO", price_ars_monthly: 150000 }, error: null },
    })
    mockAdminClient.mockReturnValue(client)

    const res = await PATCH(makeReq({ plan_id: "PRO", price_ars_monthly: 150000 }))
    expect(res.status).toBe(200)
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ plan_id: "PRO", price_ars_monthly: 150000, updated_by: "user-1" }),
      { onConflict: "plan_id" },
    )
    expect(mockLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "PLAN_PRICE_UPDATED_BY_ADMIN",
        details: expect.objectContaining({ plan_id: "PRO", before: 119000, after: 150000 }),
      }),
    )
  })

  it("permite ENTERPRISE con precio null", async () => {
    const { client } = makeAdmin({
      before: { plan_id: "ENTERPRISE", price_ars_monthly: null },
      upsertResult: { data: { plan_id: "ENTERPRISE", price_ars_monthly: null }, error: null },
    })
    mockAdminClient.mockReturnValue(client)

    const res = await PATCH(makeReq({ plan_id: "ENTERPRISE", price_ars_monthly: null }))
    expect(res.status).toBe(200)
  })
})
