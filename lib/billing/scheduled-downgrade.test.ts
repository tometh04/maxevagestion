import {
  validateScheduleDowngrade,
  buildDowngradeUpdate,
  type ScheduleDowngradeOrg,
} from "./scheduled-downgrade"
import { PLANS } from "./plans"

const FUTURE = "2099-01-01T00:00:00.000Z"
const PAST = "2000-01-01T00:00:00.000Z"

function org(overrides: Partial<ScheduleDowngradeOrg> = {}): ScheduleDowngradeOrg {
  return {
    plan: "ENTERPRISE",
    subscription_status: "ACTIVE",
    custom_plan_id: "cp-1",
    current_period_ends_at: FUTURE,
    scheduled_plan: null,
    ...overrides,
  }
}

describe("validateScheduleDowngrade", () => {
  it("rechaza roles no-admin (403)", () => {
    const r = validateScheduleDowngrade(org(), "SELLER", "PRO")
    expect(r).toEqual({ ok: false, status: 403, error: "forbidden" })
  })

  it("acepta ADMIN y SUPER_ADMIN", () => {
    expect(validateScheduleDowngrade(org(), "ADMIN", "PRO").ok).toBe(true)
    expect(validateScheduleDowngrade(org(), "SUPER_ADMIN", "PRO").ok).toBe(true)
  })

  it("rechaza targetPlan distinto de PRO (400)", () => {
    const r = validateScheduleDowngrade(org(), "ADMIN", "STARTER")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(400)
  })

  it("rechaza org no-Enterprise (400)", () => {
    const r = validateScheduleDowngrade(
      org({ plan: "PRO", custom_plan_id: null }),
      "ADMIN",
      "PRO"
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(400)
  })

  it("acepta Enterprise por custom_plan_id aunque plan no sea ENTERPRISE", () => {
    const r = validateScheduleDowngrade(
      org({ plan: "STARTER", custom_plan_id: "cp-9" }),
      "ADMIN",
      "PRO"
    )
    expect(r.ok).toBe(true)
  })

  it("rechaza status != ACTIVE (400)", () => {
    for (const s of ["TRIALING", "PAST_DUE", "CANCELLED", "SUSPENDED", "PENDING_PAYMENT"]) {
      const r = validateScheduleDowngrade(org({ subscription_status: s }), "ADMIN", "PRO")
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.status).toBe(400)
    }
  })

  it("rechaza current_period_ends_at nulo (409, contactá ventas)", () => {
    const r = validateScheduleDowngrade(
      org({ current_period_ends_at: null }),
      "ADMIN",
      "PRO"
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(409)
  })

  it("rechaza current_period_ends_at ya vencido (400)", () => {
    const r = validateScheduleDowngrade(
      org({ current_period_ends_at: PAST }),
      "ADMIN",
      "PRO"
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(400)
  })

  it("es idempotente si ya hay scheduled_plan", () => {
    const r = validateScheduleDowngrade(org({ scheduled_plan: "PRO" }), "ADMIN", "PRO")
    expect(r).toEqual({ ok: true, alreadyScheduled: true, effectiveAt: FUTURE })
  })

  it("happy path: devuelve effectiveAt = current_period_ends_at", () => {
    const r = validateScheduleDowngrade(org(), "ADMIN", "PRO")
    expect(r).toEqual({ ok: true, effectiveAt: FUTURE })
  })
})

describe("buildDowngradeUpdate", () => {
  it("produce PRO + límites PRO + PAST_DUE + congela period + limpia scheduling/custom", () => {
    const update = buildDowngradeUpdate({ scheduled_plan_effective_at: FUTURE })
    expect(update).toEqual({
      plan: "PRO",
      max_users: PLANS.PRO.limits.maxUsers,
      max_agencies: PLANS.PRO.limits.maxAgencies,
      max_operations_per_month: PLANS.PRO.limits.maxOperationsPerMonth,
      custom_plan_id: null,
      mp_preapproval_id: null,
      subscription_status: "PAST_DUE",
      current_period_ends_at: FUTURE,
      scheduled_plan: null,
      scheduled_plan_effective_at: null,
    })
  })
})
