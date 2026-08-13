/**
 * @jest-environment node
 */

jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }))
jest.mock("@/lib/supabase/server", () => ({
  createServerClient: jest.fn(),
  createAdminClient: jest.fn(),
}))
jest.mock("@/lib/auth/platform", () => ({ isPlatformAdmin: jest.fn() }))
jest.mock("@/lib/billing/mercadopago", () => ({
  createPreapproval: jest.fn(),
  cancelPreapproval: jest.fn(),
}))
jest.mock("@/lib/security/audit", () => ({ logSecurityEvent: jest.fn() }))

import { POST } from "./route"
import { getCurrentUser } from "@/lib/auth"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { isPlatformAdmin } from "@/lib/auth/platform"
import { createPreapproval, cancelPreapproval } from "@/lib/billing/mercadopago"
import { PLANS } from "@/lib/billing/plans"

const mockUser = getCurrentUser as jest.Mock
const mockServer = createServerClient as jest.Mock
const mockAdmin = createAdminClient as jest.Mock
const mockIsPlatformAdmin = isPlatformAdmin as jest.Mock
const mockCreatePreapproval = createPreapproval as jest.Mock
const mockCancelPreapproval = cancelPreapproval as jest.Mock

function makeAdmin(org: any) {
  const b: any = {
    select: () => b,
    eq: () => b,
    maybeSingle: () => Promise.resolve({ data: org }),
    insert: () => Promise.resolve({ error: null }),
  }
  return { from: () => b }
}

function req(body: any) {
  return new Request("http://localhost/api/admin/orgs/org-1/mp-preapproval-link", {
    method: "POST",
    body: JSON.stringify(body),
  })
}
const ctx = { params: Promise.resolve({ id: "org-1" }) }

beforeEach(() => {
  jest.clearAllMocks()
  mockUser.mockResolvedValue({ user: { id: "admin-1" } })
  mockServer.mockResolvedValue({})
  process.env.NEXT_PUBLIC_APP_URL = "https://app.vibook.ai"
})

describe("POST /api/admin/orgs/[id]/mp-preapproval-link", () => {
  it("403 si no es platform admin", async () => {
    mockIsPlatformAdmin.mockResolvedValue(false)
    const res = await POST(req({ payer_email: "jose@test.com" }), ctx)
    expect(res.status).toBe(403)
  })

  it("400 si payer_email es inválido", async () => {
    mockIsPlatformAdmin.mockResolvedValue(true)
    mockAdmin.mockReturnValue(makeAdmin({ id: "org-1", plan: "PRO" }))
    const res = await POST(req({ payer_email: "no-es-email" }), ctx)
    expect(res.status).toBe(400)
    expect(mockCreatePreapproval).not.toHaveBeenCalled()
  })

  it("crea preapproval per-org con payer_email + external_reference y devuelve init_point", async () => {
    mockIsPlatformAdmin.mockResolvedValue(true)
    mockAdmin.mockReturnValue(makeAdmin({ id: "org-1", name: "Lozada", plan: "PRO", subscription_status: "PAST_DUE", mp_preapproval_id: null }))
    mockCreatePreapproval.mockResolvedValue({ id: "pa-new", init_point: "https://mp/pa-new", status: "pending" })

    const res = await POST(req({ payer_email: "jose@gmail.com" }), ctx)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.init_point).toBe("https://mp/pa-new")
    expect(json.preapproval_id).toBe("pa-new")
    // Clave: el preapproval se ata al orgId (external_reference) y al payer_email real.
    expect(mockCreatePreapproval).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: "org-1", plan: "PRO", payerEmail: "jose@gmail.com", includeFreeTrial: false })
    )
    // No hay preapproval viejo → no se cancela nada.
    expect(mockCancelPreapproval).not.toHaveBeenCalled()
  })

  it("cancela el preapproval viejo si existe (supersede)", async () => {
    mockIsPlatformAdmin.mockResolvedValue(true)
    mockAdmin.mockReturnValue(makeAdmin({ id: "org-1", plan: "PRO", mp_preapproval_id: "pa-old" }))
    mockCreatePreapproval.mockResolvedValue({ id: "pa-new", init_point: "https://mp/pa-new", status: "pending" })
    mockCancelPreapproval.mockResolvedValue({})

    await POST(req({ payer_email: "jose@gmail.com" }), ctx)
    expect(mockCancelPreapproval).toHaveBeenCalledWith("pa-old")
  })

  /**
   * Este link es el camino manual que usa el admin justo cuando el débito
   * automático falla: cobrar acá el precio de lista le rompería el precio
   * congelado a la org en el peor momento posible.
   */
  it("respeta el precio congelado de la org", async () => {
    mockIsPlatformAdmin.mockResolvedValue(true)
    mockAdmin.mockReturnValue(
      makeAdmin({
        id: "org-1",
        plan: "PRO",
        mp_preapproval_id: null,
        agreed_plan_price_ars: 119000,
        agreed_plan_id: "PRO",
      })
    )
    mockCreatePreapproval.mockResolvedValue({ id: "pa-new", init_point: "https://mp/pa-new", status: "pending" })

    const res = await POST(req({ payer_email: "jose@gmail.com" }), ctx)
    const json = await res.json()

    expect(mockCreatePreapproval).toHaveBeenCalledWith(
      expect.objectContaining({ amountArs: 119000 })
    )
    expect(json.amount_ars).toBe(119000)
  })

  it("sin precio congelado usa el precio de lista", async () => {
    mockIsPlatformAdmin.mockResolvedValue(true)
    mockAdmin.mockReturnValue(makeAdmin({ id: "org-1", plan: "PRO", mp_preapproval_id: null }))
    mockCreatePreapproval.mockResolvedValue({ id: "pa-new", init_point: "https://mp/pa-new", status: "pending" })

    await POST(req({ payer_email: "jose@gmail.com" }), ctx)
    expect(mockCreatePreapproval).toHaveBeenCalledWith(
      expect.objectContaining({ amountArs: PLANS.PRO.priceArsMonthly })
    )
  })

  it("ignora un precio congelado de OTRO plan", async () => {
    mockIsPlatformAdmin.mockResolvedValue(true)
    mockAdmin.mockReturnValue(
      makeAdmin({
        id: "org-1",
        plan: "PRO",
        mp_preapproval_id: null,
        agreed_plan_price_ars: 450000,
        agreed_plan_id: "ENTERPRISE",
      })
    )
    mockCreatePreapproval.mockResolvedValue({ id: "pa-new", init_point: "https://mp/pa-new", status: "pending" })

    await POST(req({ payer_email: "jose@gmail.com" }), ctx)
    expect(mockCreatePreapproval).toHaveBeenCalledWith(
      expect.objectContaining({ amountArs: PLANS.PRO.priceArsMonthly })
    )
  })
})
