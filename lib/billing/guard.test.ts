import { isAccessAllowed, type BillingOrg } from "./guard"

function makeOrg(overrides: Partial<BillingOrg>): BillingOrg {
  return {
    subscription_status: "ACTIVE",
    current_period_ends_at: null,
    trial_ends_at: null,
    ...overrides,
  }
}

describe("isAccessAllowed", () => {
  it("allows ACTIVE", () => {
    expect(isAccessAllowed(makeOrg({ subscription_status: "ACTIVE" }))).toBe(true)
  })

  it("allows TRIALING", () => {
    expect(isAccessAllowed(makeOrg({ subscription_status: "TRIALING" }))).toBe(true)
  })

  it("allows PAST_DUE (banner pero puede entrar durante retry)", () => {
    expect(isAccessAllowed(makeOrg({ subscription_status: "PAST_DUE" }))).toBe(true)
  })

  it("blocks PENDING_PAYMENT", () => {
    expect(isAccessAllowed(makeOrg({ subscription_status: "PENDING_PAYMENT" }))).toBe(false)
  })

  it("blocks SUSPENDED", () => {
    expect(isAccessAllowed(makeOrg({ subscription_status: "SUSPENDED" }))).toBe(false)
  })

  it("allows CANCELLED with future current_period_ends_at", () => {
    const future = new Date(Date.now() + 86400_000).toISOString()
    expect(isAccessAllowed(makeOrg({
      subscription_status: "CANCELLED",
      current_period_ends_at: future,
    }))).toBe(true)
  })

  it("blocks CANCELLED with past current_period_ends_at", () => {
    const past = new Date(Date.now() - 86400_000).toISOString()
    expect(isAccessAllowed(makeOrg({
      subscription_status: "CANCELLED",
      current_period_ends_at: past,
    }))).toBe(false)
  })

  it("blocks CANCELLED with null current_period_ends_at (defensivo)", () => {
    expect(isAccessAllowed(makeOrg({
      subscription_status: "CANCELLED",
      current_period_ends_at: null,
    }))).toBe(false)
  })

  it("blocks legacy TRIAL with null trial_ends_at", () => {
    expect(isAccessAllowed(makeOrg({
      subscription_status: "TRIAL",
      trial_ends_at: null,
    }))).toBe(false)
  })

  it("allows legacy TRIAL with future trial_ends_at", () => {
    const future = new Date(Date.now() + 86400_000).toISOString()
    expect(isAccessAllowed(makeOrg({
      subscription_status: "TRIAL",
      trial_ends_at: future,
    }))).toBe(true)
  })

  // Downgrade programado Enterprise→PRO: regresión.
  it("allows ACTIVE org con downgrade programado (programar NO corta acceso)", () => {
    // El downgrade programado no cambia subscription_status, solo setea
    // scheduled_plan/scheduled_plan_effective_at (que isAccessAllowed ignora).
    const orgWithSchedule = {
      ...makeOrg({ subscription_status: "ACTIVE" }),
      scheduled_plan: "PRO",
      scheduled_plan_effective_at: new Date(Date.now() + 86400_000).toISOString(),
    } as unknown as BillingOrg
    expect(isAccessAllowed(orgWithSchedule)).toBe(true)
  })

  it("PAST_DUE post-downgrade: acceso durante la gracia de 3 días, bloqueado después", () => {
    // Tras el cron la org queda PAST_DUE con current_period_ends_at congelado.
    const oneDayAgo = new Date(Date.now() - 86400_000).toISOString()
    expect(isAccessAllowed(makeOrg({
      subscription_status: "PAST_DUE",
      current_period_ends_at: oneDayAgo, // dentro de los 3 días
    }))).toBe(true)

    const fourDaysAgo = new Date(Date.now() - 4 * 86400_000).toISOString()
    expect(isAccessAllowed(makeOrg({
      subscription_status: "PAST_DUE",
      current_period_ends_at: fourDaysAgo, // pasada la gracia
    }))).toBe(false)
  })
})
