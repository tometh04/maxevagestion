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
})
