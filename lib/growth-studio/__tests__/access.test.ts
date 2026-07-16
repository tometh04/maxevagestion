/** @jest-environment node */

import {
  canAccessGrowthStudioAgency,
  hasGrowthStudioEntitlement,
  isGrowthStudioEnterprisePlan,
} from "../access-rules"

const activeOrganization = {
  id: "org-1",
  plan: "ENTERPRISE",
  subscription_status: "ACTIVE",
  current_period_ends_at: null,
  trial_ends_at: null,
}

describe("Growth Studio entitlement", () => {
  it("permite una organización Enterprise con suscripción vigente", () => {
    expect(hasGrowthStudioEntitlement(activeOrganization)).toBe(true)
  })

  it.each(["PRO", "FREE", "BASIC", null])(
    "deniega el plan %s",
    (plan) => {
      expect(
        hasGrowthStudioEntitlement({ ...activeOrganization, plan })
      ).toBe(false)
    }
  )

  it("no considera un custom plan como Enterprise implícito", () => {
    expect(isGrowthStudioEnterprisePlan({ plan: "CUSTOM" })).toBe(false)
  })

  it.each(["SUSPENDED", "PENDING_PAYMENT"])(
    "deniega una suscripción %s aunque el plan sea Enterprise",
    (subscription_status) => {
      expect(
        hasGrowthStudioEntitlement({
          ...activeOrganization,
          subscription_status,
        })
      ).toBe(false)
    }
  )
})

describe("Growth Studio agency scope", () => {
  const access = {
    allowed: true as const,
    organization: activeOrganization,
    agencies: [{ id: "agency-1", name: "Centro" }],
    agencyIds: ["agency-1"],
  }

  it("permite una agencia incluida en el scope resuelto", () => {
    expect(canAccessGrowthStudioAgency(access, "agency-1")).toBe(true)
  })

  it("deniega una agencia ausente, vacía o no asignada", () => {
    expect(canAccessGrowthStudioAgency(access, "agency-2")).toBe(false)
    expect(canAccessGrowthStudioAgency(access, null)).toBe(false)
    expect(canAccessGrowthStudioAgency(access, "")).toBe(false)
  })
})
