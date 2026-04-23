import { buildPlanKey } from "./mp-plans"

describe("buildPlanKey", () => {
  it("PRO estándar", () => {
    expect(buildPlanKey({ plan: "PRO" })).toBe("PRO_STANDARD")
  })
  it("STARTER estándar", () => {
    expect(buildPlanKey({ plan: "STARTER" })).toBe("STARTER_STANDARD")
  })
  it("CUSTOM usa org slug + amount", () => {
    const k = buildPlanKey({ plan: "CUSTOM", orgSlug: "agen-tst-v3", amount: 299000 })
    expect(k).toBe("CUSTOM_agen-tst-v3_299000")
  })
  it("CUSTOM sin slug/amount tira error", () => {
    expect(() => buildPlanKey({ plan: "CUSTOM" } as any)).toThrow(/orgSlug.*amount/i)
  })
})
