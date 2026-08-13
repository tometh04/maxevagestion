/**
 * @jest-environment node
 *
 * Camino de plata: qué monto se le manda a Mercado Pago en cada modo de
 * checkout. El foco es el grandfathering — una org que venía pagando el precio
 * viejo no debe terminar suscripta al nuevo por regularizar un pago vencido.
 */
jest.mock("@/lib/auth", () => ({ getCurrentUser: jest.fn() }))
jest.mock("@/lib/supabase/server", () => ({ createAdminClient: jest.fn() }))
jest.mock("@/lib/billing/mp-plans", () => ({ ensureMpPlan: jest.fn() }))
jest.mock("@/lib/billing/mercadopago", () => ({ cancelPreapproval: jest.fn() }))
jest.mock("@/lib/billing/plan-pricing", () => ({ resolvePlanPrice: jest.fn() }))
jest.mock("@/lib/billing/slack-notify", () => ({ notifyBillingSlack: jest.fn() }))

import { POST } from "./route"
import { getCurrentUser } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/server"
import { ensureMpPlan } from "@/lib/billing/mp-plans"
import { cancelPreapproval } from "@/lib/billing/mercadopago"
import { resolvePlanPrice } from "@/lib/billing/plan-pricing"
import { notifyBillingSlack } from "@/lib/billing/slack-notify"

const mockGetUser = getCurrentUser as jest.Mock
const mockAdminClient = createAdminClient as jest.Mock
const mockEnsureMpPlan = ensureMpPlan as jest.Mock
const mockCancelPreapproval = cancelPreapproval as jest.Mock
const mockResolvePlanPrice = resolvePlanPrice as jest.Mock
const mockSlack = notifyBillingSlack as jest.Mock

const LIST_PRICE = 139000
const GRANDFATHERED_PRICE = 119000

const baseOrg = {
  id: "org-1",
  name: "Lozada Rosario",
  billing_email: "billing@lozada.test",
  plan: "PRO",
  subscription_status: "ACTIVE",
  mp_preapproval_id: null,
  has_used_trial: true,
  current_period_ends_at: null,
  custom_plan_id: null,
  agreed_plan_price_ars: null,
  agreed_plan_id: null,
}

function makeAdmin(org: any) {
  const orgUpdates: any[] = []
  const billingEvents: any[] = []
  const from = jest.fn((table: string) => {
    if (table === "organizations") {
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: org, error: null }) }) }),
        update: (payload: any) => {
          orgUpdates.push(payload)
          return { eq: async () => ({ error: null }) }
        },
      }
    }
    if (table === "billing_events") {
      return {
        insert: async (payload: any) => {
          billingEvents.push(payload)
          return { error: null }
        },
      }
    }
    return {}
  })
  mockAdminClient.mockReturnValue({ from })
  return { orgUpdates, billingEvents }
}

function req(body: any) {
  return new Request("http://localhost/api/billing/checkout", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

/** Monto con el que se armó el plan de MP. */
function amountSentToMp() {
  return mockEnsureMpPlan.mock.calls[0][1].amount
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetUser.mockResolvedValue({ user: { id: "u1", email: "u@lozada.test", org_id: "org-1" } })
  mockResolvePlanPrice.mockResolvedValue(LIST_PRICE)
  mockEnsureMpPlan.mockResolvedValue({
    plan_key: "PRO_STANDARD_139000_NOTRIAL",
    mp_preapproval_plan_id: "mpplan-1",
    init_point: "https://mp.test/checkout",
    cached: false,
  })
  mockCancelPreapproval.mockResolvedValue(undefined)
})

describe("POST /api/billing/checkout — precio cobrado", () => {
  it("alta nueva → precio de lista vigente", async () => {
    const { billingEvents } = makeAdmin({ ...baseOrg, has_used_trial: false })

    const res = await POST(req({ plan: "PRO" }))
    expect(res.status).toBe(200)
    expect(amountSentToMp()).toBe(LIST_PRICE)
    expect(billingEvents[0].amount_cents).toBe(LIST_PRICE * 100)
    expect(billingEvents[0].payload.priced_as).toBe("list")
  })

  it("regularizar con precio pactado → conserva el precio viejo, NO el de lista", async () => {
    const { billingEvents } = makeAdmin({
      ...baseOrg,
      subscription_status: "PAST_DUE",
      mp_preapproval_id: "pa-vieja",
      agreed_plan_price_ars: GRANDFATHERED_PRICE,
      agreed_plan_id: "PRO",
    })

    const res = await POST(req({ plan: "PRO", regularize: true }))
    expect(res.status).toBe(200)
    expect(amountSentToMp()).toBe(GRANDFATHERED_PRICE)
    expect(billingEvents[0].amount_cents).toBe(GRANDFATHERED_PRICE * 100)
    expect(billingEvents[0].payload).toMatchObject({
      priced_as: "grandfathered",
      agreed_price_ars: GRANDFATHERED_PRICE,
      list_price_ars: LIST_PRICE,
    })
  })

  it("acepta el precio pactado como string (NUMERIC de PostgREST)", async () => {
    makeAdmin({
      ...baseOrg,
      subscription_status: "PAST_DUE",
      mp_preapproval_id: "pa-vieja",
      agreed_plan_price_ars: "119000.00",
      agreed_plan_id: "PRO",
    })

    await POST(req({ plan: "PRO", regularize: true }))
    expect(amountSentToMp()).toBe(GRANDFATHERED_PRICE)
  })

  it("regularizar sin precio pactado → precio de lista + alerta a Slack", async () => {
    makeAdmin({ ...baseOrg, subscription_status: "PAST_DUE", mp_preapproval_id: "pa-vieja" })

    await POST(req({ plan: "PRO", regularize: true }))
    expect(amountSentToMp()).toBe(LIST_PRICE)
    const warning = mockSlack.mock.calls.find((c) => c[0].severity === "warning")
    expect(warning).toBeTruthy()
    expect(warning[0].details).toContain("SIN precio pactado")
  })

  it("el precio pactado de OTRO plan se ignora (gate por agreed_plan_id)", async () => {
    makeAdmin({
      ...baseOrg,
      subscription_status: "PAST_DUE",
      mp_preapproval_id: "pa-vieja",
      agreed_plan_price_ars: 450000,
      agreed_plan_id: "ENTERPRISE", // la org bajó a PRO; el precio viejo no aplica
    })

    await POST(req({ plan: "PRO", regularize: true }))
    expect(amountSentToMp()).toBe(LIST_PRICE)
  })

  it("reactivar una org CANCELLED → precio de lista, y limpia el precio pactado", async () => {
    const { orgUpdates, billingEvents } = makeAdmin({
      ...baseOrg,
      subscription_status: "CANCELLED",
      agreed_plan_price_ars: GRANDFATHERED_PRICE,
      agreed_plan_id: "PRO",
    })

    await POST(req({ plan: "PRO", reactivate: true }))
    expect(amountSentToMp()).toBe(LIST_PRICE)
    expect(billingEvents[0].payload.priced_as).toBe("list")
    expect(orgUpdates[0]).toMatchObject({
      agreed_plan_price_ars: null,
      agreed_plan_id: null,
      agreed_plan_price_source: null,
    })
  })

  it("regularizar NO limpia el precio pactado (lo necesita el webhook posterior)", async () => {
    const { orgUpdates } = makeAdmin({
      ...baseOrg,
      subscription_status: "PAST_DUE",
      mp_preapproval_id: "pa-vieja",
      agreed_plan_price_ars: GRANDFATHERED_PRICE,
      agreed_plan_id: "PRO",
    })

    await POST(req({ plan: "PRO", regularize: true }))
    expect(orgUpdates[0]).not.toHaveProperty("agreed_plan_price_ars")
  })

  it("un alta normal no toca el precio pactado", async () => {
    const { orgUpdates } = makeAdmin({ ...baseOrg, has_used_trial: false })

    await POST(req({ plan: "PRO" }))
    expect(orgUpdates[0]).not.toHaveProperty("agreed_plan_price_ars")
  })
})
