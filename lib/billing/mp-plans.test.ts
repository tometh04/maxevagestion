import { buildPlanKey, ensureMpPlan } from "./mp-plans"

jest.mock("./mercadopago", () => ({
  createPreapprovalPlan: jest.fn(async () => ({
    id: "mp_plan_new",
    init_point: "https://mp/checkout",
  })),
}))

describe("buildPlanKey", () => {
  it("PRO estándar incluye el monto (precios editables)", () => {
    expect(buildPlanKey({ plan: "PRO", amount: 119000 })).toBe("PRO_STANDARD_119000")
  })
  it("STARTER estándar incluye el monto", () => {
    expect(buildPlanKey({ plan: "STARTER", amount: 29900 })).toBe("STARTER_STANDARD_29900")
  })
  it("estándar sin amount tira error", () => {
    expect(() => buildPlanKey({ plan: "PRO" } as any)).toThrow(/amount/i)
  })
  it("CUSTOM usa org slug + amount", () => {
    const k = buildPlanKey({ plan: "CUSTOM", orgSlug: "agen-tst-v3", amount: 299000 })
    expect(k).toBe("CUSTOM_agen-tst-v3_299000")
  })
  it("CUSTOM sin slug/amount tira error", () => {
    expect(() => buildPlanKey({ plan: "CUSTOM" } as any)).toThrow(/orgSlug.*amount/i)
  })
})

describe("ensureMpPlan — cache key distingue trial", () => {
  // Regresión bug Lozada Gualeguaychú (2026-06-24): "Regularizar pago"
  // (includeFreeTrial=false) reusaba el plan cacheado del alta normal CON trial.
  // La cache key debe incluir el estado del trial.
  function fakeAdmin(insertSpy: jest.Mock) {
    return {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
        insert: insertSpy,
      }),
    } as any
  }

  const base = {
    plan: "PRO" as const,
    reason: "Vibook PRO",
    amount: 119000,
    backUrl: "https://app.vibook.ai/back",
  }

  it("includeFreeTrial=true → key con monto PRO_STANDARD_119000", async () => {
    const insertSpy = jest.fn(async () => ({ error: null }))
    const res = await ensureMpPlan(fakeAdmin(insertSpy), { ...base, includeFreeTrial: true })
    expect(res.plan_key).toBe("PRO_STANDARD_119000")
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ plan_key: "PRO_STANDARD_119000" }))
  })

  it("includeFreeTrial=false → key separada PRO_STANDARD_119000_NOTRIAL (cobro inmediato)", async () => {
    const insertSpy = jest.fn(async () => ({ error: null }))
    const res = await ensureMpPlan(fakeAdmin(insertSpy), { ...base, includeFreeTrial: false })
    expect(res.plan_key).toBe("PRO_STANDARD_119000_NOTRIAL")
  })

  it("freeTrialDays custom tiene prioridad sobre includeFreeTrial", async () => {
    const insertSpy = jest.fn(async () => ({ error: null }))
    const res = await ensureMpPlan(fakeAdmin(insertSpy), {
      ...base,
      includeFreeTrial: false,
      freeTrialDays: 14,
    })
    expect(res.plan_key).toBe("PRO_STANDARD_119000_T14D")
  })

  it("distinto monto → distinta key (precio editable no reusa template viejo)", async () => {
    const insertSpy = jest.fn(async () => ({ error: null }))
    const res = await ensureMpPlan(fakeAdmin(insertSpy), {
      ...base,
      amount: 149000,
      includeFreeTrial: true,
    })
    expect(res.plan_key).toBe("PRO_STANDARD_149000")
  })
})
