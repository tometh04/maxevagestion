/**
 * @jest-environment node
 */
import { POST } from "@/app/api/admin/orgs/[id]/manual-payment/route"

// Factory mocks (no automock): `lib/auth` usa React.cache, que no existe en el
// `react` que resuelve jest en entorno node — cargarlo de verdad rompe la suite.
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

const params = Promise.resolve({ id: "org-123" })

function makeReq(body: any) {
  return new Request("http://test.local/api/admin/orgs/org-123/manual-payment", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

/** Mock mínimo de supabase: organizations.select + manual_payments.insert + organizations.update */
function mockDb(opts: {
  org: { subscription_status: string | null; current_period_ends_at: string | null } | null
  insertError?: { message: string }
  updateError?: { message: string }
}) {
  const orgUpdate = jest.fn().mockReturnValue({
    eq: jest.fn().mockResolvedValue({ error: opts.updateError ?? null }),
  })
  const insert = jest.fn().mockReturnValue({
    select: () => ({
      single: () =>
        Promise.resolve(
          opts.insertError
            ? { data: null, error: opts.insertError }
            : { data: { id: "pay-1" }, error: null }
        ),
    }),
  })
  const from = jest.fn((table: string) => {
    if (table === "organizations") {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: opts.org }) }),
        }),
        update: orgUpdate,
      }
    }
    return { insert }
  })
  mockAdminClient.mockReturnValue({ from })
  return { orgUpdate, insert }
}

const validBody = {
  amount_ars: 119000,
  paid_at: "2026-08-06T03:00:00.000Z",
  covers_from: "2026-08-01",
  covers_to: "2026-09-01",
  period_ends_at: "2026-09-01T12:00:00.000Z",
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetUser.mockResolvedValue({ user: { id: "user-1", auth_id: "auth-1" } })
  mockServerClient.mockResolvedValue({} as any)
  mockIsPA.mockResolvedValue(true)
})

describe("POST /api/admin/orgs/[id]/manual-payment", () => {
  it("rechaza a quien no es platform admin", async () => {
    mockIsPA.mockResolvedValue(false)
    const res = await POST(makeReq(validBody), { params })
    expect(res.status).toBe(403)
  })

  it("rechaza montos no numéricos o <= 0", async () => {
    for (const amount_ars of [0, -5, "abc", null, undefined]) {
      const res = await POST(makeReq({ ...validBody, amount_ars }), { params })
      expect(res.status).toBe(400)
    }
  })

  it("rechaza covers_to anterior a covers_from", async () => {
    const res = await POST(
      makeReq({ ...validBody, covers_from: "2026-09-01", covers_to: "2026-08-01" }),
      { params }
    )
    expect(res.status).toBe(400)
  })

  it("404 si la org no existe", async () => {
    mockDb({ org: null })
    const res = await POST(makeReq(validBody), { params })
    expect(res.status).toBe(404)
  })

  it("registra el pago, usa period_ends_at explícito y pone ACTIVE", async () => {
    const { orgUpdate, insert } = mockDb({
      org: { subscription_status: "ACTIVE", current_period_ends_at: "2026-08-01T12:00:00+00:00" },
    })

    const res = await POST(makeReq(validBody), { params })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: "org-123",
        amount_ars: 119000,
        covers_from: "2026-08-01",
        covers_to: "2026-09-01",
        registered_by: "user-1",
      })
    )
    expect(orgUpdate).toHaveBeenCalledWith({
      current_period_ends_at: "2026-09-01T12:00:00.000Z",
      subscription_status: "ACTIVE",
    })
    expect(json.period_extended).toBe(true)
    expect(json.current_period_ends_at).toBe("2026-09-01T12:00:00.000Z")
    expect(mockLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "MANUAL_PAYMENT_REGISTERED" })
    )
  })

  it("cae a covers_to (medianoche) cuando no viene period_ends_at", async () => {
    const { orgUpdate } = mockDb({
      org: { subscription_status: "PAST_DUE", current_period_ends_at: "2026-08-01T12:00:00Z" },
    })
    const { period_ends_at, ...withoutExplicit } = validBody
    await POST(makeReq(withoutExplicit), { params })
    expect(orgUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ current_period_ends_at: "2026-09-01T00:00:00.000Z" })
    )
  })

  it("NUNCA retrocede el vencimiento al registrar un pago viejo", async () => {
    const { orgUpdate } = mockDb({
      org: { subscription_status: "ACTIVE", current_period_ends_at: "2026-12-01T12:00:00Z" },
    })

    const res = await POST(makeReq(validBody), { params })
    const json = await res.json()

    expect(json.period_extended).toBe(false)
    expect(json.current_period_ends_at).toBe("2026-12-01T12:00:00Z")
    // El status igual se normaliza a ACTIVE, pero el vencimiento no se toca.
    expect(orgUpdate).toHaveBeenCalledWith({ subscription_status: "ACTIVE" })
  })

  it("no reactiva orgs SUSPENDED ni CANCELLED", async () => {
    for (const st of ["SUSPENDED", "CANCELLED"]) {
      jest.clearAllMocks()
      const { orgUpdate } = mockDb({
        org: { subscription_status: st, current_period_ends_at: "2026-08-01T12:00:00Z" },
      })
      const res = await POST(makeReq(validBody), { params })
      const json = await res.json()
      expect(json.status_preserved).toBe(st)
      expect(orgUpdate).toHaveBeenCalledWith({
        current_period_ends_at: "2026-09-01T12:00:00.000Z",
      })
    }
  })

  it("arranca el período desde cero si la org no tenía vencimiento", async () => {
    const { orgUpdate } = mockDb({
      org: { subscription_status: "PENDING_PAYMENT", current_period_ends_at: null },
    })
    const res = await POST(makeReq(validBody), { params })
    const json = await res.json()
    expect(json.period_extended).toBe(true)
    expect(orgUpdate).toHaveBeenCalledWith({
      current_period_ends_at: "2026-09-01T12:00:00.000Z",
      subscription_status: "ACTIVE",
    })
  })

  it("500 + audit CRITICAL si el pago se insertó pero la org no se pudo actualizar", async () => {
    mockDb({
      org: { subscription_status: "ACTIVE", current_period_ends_at: "2026-08-01T12:00:00Z" },
      updateError: { message: "boom" },
    })
    const res = await POST(makeReq(validBody), { params })
    expect(res.status).toBe(500)
    expect(mockLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "MANUAL_PAYMENT_ORG_UPDATE_FAILED",
        severity: "CRITICAL",
      })
    )
  })
})
