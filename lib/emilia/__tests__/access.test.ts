const mockIsAccessAllowed = jest.fn()
const mockCanPerformAction = jest.fn()
const mockGetUserAgencyIds = jest.fn()
const mockResolveUserPermissions = jest.fn()

jest.mock("@/lib/billing/guard", () => ({
  isAccessAllowed: (...args: unknown[]) => mockIsAccessAllowed(...args),
}))
jest.mock("@/lib/permissions-api", () => ({
  canPerformAction: (...args: unknown[]) => mockCanPerformAction(...args),
  getUserAgencyIds: (...args: unknown[]) => mockGetUserAgencyIds(...args),
}))
jest.mock("@/lib/permissions-agency", () => ({
  resolveUserPermissions: (...args: unknown[]) => mockResolveUserPermissions(...args),
}))

import {
  DEFAULT_EMILIA_PROMOTION_END_AT,
  getEmiliaPromotionEndAt,
  hasEmiliaPlanAccess,
  isEmiliaPromotionActive,
  isEnterpriseEmiliaPlan,
  resolveEmiliaOrganizationAccess,
  resolveLeadEmiliaAccess,
} from "@/lib/emilia/access"

describe("Emilia access rollout", () => {
  const beforeCutoff = Date.parse("2026-08-11T19:32:30.999Z")
  const atCutoff = Date.parse(DEFAULT_EMILIA_PROMOTION_END_AT)
  const user = {
    id: "user-1",
    org_id: "org-1",
    role: "SELLER",
    roles: ["SELLER"],
  }

  function organizationClient(data: Record<string, unknown>) {
    const query: any = {}
    query.select = jest.fn(() => query)
    query.eq = jest.fn(() => query)
    query.maybeSingle = jest.fn(async () => ({ data, error: null }))
    return { from: jest.fn(() => query) }
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockIsAccessAllowed.mockReturnValue(true)
    mockCanPerformAction.mockReturnValue(true)
    mockGetUserAgencyIds.mockResolvedValue(["agency-1"])
    mockResolveUserPermissions.mockResolvedValue({})
    process.env.EMILIA_PROMOTION_END_AT = DEFAULT_EMILIA_PROMOTION_END_AT
  })

  afterEach(() => {
    jest.restoreAllMocks()
    delete process.env.EMILIA_PROMOTION_END_AT
  })

  it("habilita todos los planes durante las cuatro semanas promocionales", () => {
    expect(isEmiliaPromotionActive(beforeCutoff)).toBe(true)
    expect(hasEmiliaPlanAccess({ plan: "STARTER", custom_plan_id: null }, beforeCutoff)).toBe(true)
    expect(hasEmiliaPlanAccess({ plan: "PRO", custom_plan_id: null }, beforeCutoff)).toBe(true)
  })

  it("al llegar el corte deja Emilia sólo para Enterprise o planes custom", () => {
    expect(isEmiliaPromotionActive(atCutoff)).toBe(false)
    expect(hasEmiliaPlanAccess({ plan: "STARTER", custom_plan_id: null }, atCutoff)).toBe(false)
    expect(hasEmiliaPlanAccess({ plan: "PRO", custom_plan_id: null }, atCutoff)).toBe(false)
    expect(hasEmiliaPlanAccess({ plan: "ENTERPRISE", custom_plan_id: null }, atCutoff)).toBe(true)
    expect(hasEmiliaPlanAccess({ plan: "PRO", custom_plan_id: "custom-1" }, atCutoff)).toBe(true)
  })

  it("usa el mismo criterio Enterprise que billing", () => {
    expect(isEnterpriseEmiliaPlan({ plan: "ENTERPRISE", custom_plan_id: null })).toBe(true)
    expect(isEnterpriseEmiliaPlan({ plan: "PRO", custom_plan_id: "custom-1" })).toBe(true)
    expect(isEnterpriseEmiliaPlan({ plan: "PRO", custom_plan_id: null })).toBe(false)
  })

  it("permite sobrescribir el corte con una fecha ISO válida", () => {
    expect(getEmiliaPromotionEndAt("2026-09-01T00:00:00-03:00")).toBe(
      "2026-09-01T03:00:00.000Z"
    )
  })

  it("cae al corte versionado si el override es inválido", () => {
    expect(getEmiliaPromotionEndAt("fecha-invalida")).toBe(DEFAULT_EMILIA_PROMOTION_END_AT)
  })

  it("rechaza una organización cuya suscripción no permite acceso", async () => {
    mockIsAccessAllowed.mockReturnValue(false)
    const supabase = organizationClient({
      plan: "ENTERPRISE",
      custom_plan_id: null,
      subscription_status: "suspended",
      current_period_ends_at: null,
      trial_ends_at: null,
    })

    const result = await resolveEmiliaOrganizationAccess(supabase, user)

    expect(result).toMatchObject({ allowed: false, code: "subscription_inactive" })
  })

  it("aplica el corte por plan desde el resolver usado por las APIs", async () => {
    jest.spyOn(Date, "now").mockReturnValue(atCutoff)
    const supabase = organizationClient({
      plan: "PRO",
      custom_plan_id: null,
      subscription_status: "active",
      current_period_ends_at: null,
      trial_ends_at: null,
    })

    const result = await resolveEmiliaOrganizationAccess(supabase, user)

    expect(result).toMatchObject({ allowed: false, code: "emilia_plan_required" })
  })

  it("no deja que el entitlement por plan amplíe permisos sobre leads", async () => {
    mockCanPerformAction.mockReturnValue(false)
    const supabase = { from: jest.fn() }

    const result = await resolveLeadEmiliaAccess(supabase, user)

    expect(result).toMatchObject({ allowed: false, code: "permission_denied" })
    expect(supabase.from).not.toHaveBeenCalled()
  })
})
