/** @jest-environment node */

jest.mock("@/lib/permissions-api", () => ({
  getUserAgencyIds: jest.fn(),
}))

import {
  canAccessGrowthStudioAgency,
  hasGrowthStudioEntitlement,
} from "../access-rules"
import { resolveGrowthStudioOrganizationAccess } from "../access"

const activeOrganization = {
  id: "org-1",
  plan: "ENTERPRISE",
  subscription_status: "ACTIVE",
  current_period_ends_at: null,
  trial_ends_at: null,
}

describe("Growth Studio entitlement", () => {
  it.each(["STARTER", "PRO", "ENTERPRISE", "CUSTOM", null])(
    "permite el plan %s con suscripción vigente",
    (plan) => {
      expect(
        hasGrowthStudioEntitlement({ ...activeOrganization, plan })
      ).toBe(true)
    }
  )

  it.each(["SUSPENDED", "PENDING_PAYMENT"])(
    "deniega una suscripción %s independientemente del plan",
    (subscription_status) => {
      expect(
        hasGrowthStudioEntitlement({
          ...activeOrganization,
          subscription_status,
        })
      ).toBe(false)
    }
  )

  it("resuelve acceso sin consultar ni condicionar por plan", async () => {
    const query = {
      select: jest.fn(),
      eq: jest.fn(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: activeOrganization.id,
          subscription_status: activeOrganization.subscription_status,
          current_period_ends_at: activeOrganization.current_period_ends_at,
          trial_ends_at: activeOrganization.trial_ends_at,
        },
        error: null,
      }),
    }
    query.select.mockReturnValue(query)
    query.eq.mockReturnValue(query)

    const result = await resolveGrowthStudioOrganizationAccess(
      { from: jest.fn().mockReturnValue(query) } as never,
      {
        id: "user-1",
        org_id: activeOrganization.id,
        role: "VIEWER",
      }
    )

    expect(query.select).toHaveBeenCalledWith(
      "id, subscription_status, current_period_ends_at, trial_ends_at"
    )
    expect(result.allowed).toBe(true)
  })
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
