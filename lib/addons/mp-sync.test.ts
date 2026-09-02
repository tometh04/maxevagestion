import { syncAddonsToMp } from "@/lib/addons/mp-sync"

jest.mock("@/lib/billing/mp-update", () => ({ applyPriceChange: jest.fn() }))
jest.mock("@/lib/billing/plan-pricing", () => ({
  ...jest.requireActual("@/lib/billing/plan-pricing"),
  getPlanPricing: jest.fn(async () => ({ STARTER: 29900, PRO: 139000, ENTERPRISE: null })),
}))

const { applyPriceChange } = jest.requireMock("@/lib/billing/mp-update") as {
  applyPriceChange: jest.Mock
}

const PASADO = "2026-01-01T00:00:00.000Z"

interface FakeOrg {
  plan?: string
  custom_plan_id?: string | null
  manual_mrr_override_ars?: number | null
  mp_preapproval_id?: string | null
  addons_mp_synced_amount_ars?: number
  agreed_plan_price_ars?: number | null
  agreed_plan_id?: string | null
}

/** Captura los UPDATE que se hacen sobre `organizations`. */
function makeAdmin(opts: {
  org?: FakeOrg
  catalog?: any[]
  orgRows?: any[]
  inclusions?: any[]
}) {
  const updates: Record<string, unknown>[] = []
  const org = {
    id: "org-1",
    plan: "PRO",
    subscription_status: "ACTIVE",
    custom_plan_id: null,
    manual_mrr_override_ars: null,
    agreed_plan_price_ars: null,
    agreed_plan_id: null,
    mp_preapproval_id: "pre-1",
    billing_email: "a@b.com",
    addons_mp_synced_amount_ars: 0,
    current_period_ends_at: "2026-10-01T00:00:00.000Z",
    ...opts.org,
  }

  const table = (name: string): any => {
    const rowsFor = () => {
      if (name === "subscription_addons") return opts.catalog ?? []
      if (name === "subscription_addon_plan_inclusions") return opts.inclusions ?? []
      if (name === "organization_addons") return opts.orgRows ?? []
      return []
    }
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => ({
        data: name === "organizations" ? org : name === "custom_plans" ? null : null,
      }),
      update: (patch: Record<string, unknown>) => {
        if (name === "organizations") updates.push(patch)
        return { eq: async () => ({ error: null }) }
      },
      then: (resolve: any) => resolve({ data: rowsFor(), error: null }),
    }
    return builder
  }

  return { admin: { from: table }, updates }
}

/** Complemento contratado y facturable, a `price`. */
function contratado(price: number) {
  return {
    catalog: [
      { addon_key: "library", price_ars_monthly: price, active: true, enforcement: "ON" },
    ],
    orgRows: [
      {
        addon_key: "library",
        status: "ACTIVE",
        price_ars_monthly_snapshot: price,
        billable_from: PASADO,
      },
    ],
  }
}

beforeEach(() => {
  applyPriceChange.mockReset()
})

describe("syncAddonsToMp", () => {
  it("un aumento por debajo del 20% se aplica in-place", async () => {
    // 139.000 + 15.000 = 154.000 → +10,8%.
    applyPriceChange.mockResolvedValue({ action: "UPDATED_IN_PLACE" })
    const { admin, updates } = makeAdmin(contratado(15000))

    const out = await syncAddonsToMp(admin as any, "org-1", {
      allowReauth: false,
      source: "self_serve",
    })

    expect(out.kind).toBe("UPDATED_IN_PLACE")
    expect(out.targetAmountArs).toBe(154000)
    expect(applyPriceChange).toHaveBeenCalledWith(
      expect.objectContaining({ currentAmount: 139000, newAmount: 154000 })
    )
    expect(updates.at(-1)).toMatchObject({
      addons_mp_synced_amount_ars: 15000,
      addons_mp_sync_state: "SYNCED",
    })
  })

  it("un aumento mayor al 20% en self-serve NO toca MP y queda pendiente", async () => {
    // 139.000 + 50.000 = 189.000 → +36%.
    const { admin, updates } = makeAdmin(contratado(50000))

    const out = await syncAddonsToMp(admin as any, "org-1", {
      allowReauth: false,
      source: "self_serve",
    })

    expect(out.kind).toBe("DEFERRED")
    expect(applyPriceChange).not.toHaveBeenCalled()
    expect(updates.at(-1)).toMatchObject({ addons_mp_sync_state: "PENDING_REAUTH" })
  })

  it("INVARIANTE: nunca escribe subscription_status", async () => {
    applyPriceChange.mockResolvedValue({
      action: "REAUTH_REQUIRED",
      newPreapprovalId: "pre-2",
      checkoutUrl: "https://mp/checkout",
    })
    const { admin, updates } = makeAdmin(contratado(50000))

    // Incluso por el camino de re-autorización, que es el que en change-plan
    // deja la org en PAST_DUE.
    const out = await syncAddonsToMp(admin as any, "org-1", {
      allowReauth: true,
      source: "admin",
    })

    expect(out.kind).toBe("REAUTH_PENDING")
    for (const patch of updates) {
      expect(patch).not.toHaveProperty("subscription_status")
    }
  })

  it("el admin SÍ puede forzar el camino de re-autorización", async () => {
    applyPriceChange.mockResolvedValue({
      action: "REAUTH_REQUIRED",
      newPreapprovalId: "pre-2",
      checkoutUrl: "https://mp/checkout",
    })
    const { admin, updates } = makeAdmin(contratado(50000))

    const out = await syncAddonsToMp(admin as any, "org-1", {
      allowReauth: true,
      source: "admin",
    })

    expect(out).toMatchObject({ kind: "REAUTH_PENDING", checkoutUrl: "https://mp/checkout" })
    // El importe NO se da por sincronizado hasta que el cliente autorice.
    expect(updates.at(-1)).toMatchObject({
      mp_preapproval_id: "pre-2",
      addons_mp_sync_state: "PENDING_REAUTH",
    })
    expect(updates.at(-1)).not.toHaveProperty("addons_mp_synced_amount_ars")
  })

  it("sin preapproval no llama a MP y marca facturación manual", async () => {
    const { admin, updates } = makeAdmin({
      org: { mp_preapproval_id: null },
      ...contratado(15000),
    })

    const out = await syncAddonsToMp(admin as any, "org-1", {
      allowReauth: true,
      source: "admin",
    })

    expect(out.kind).toBe("NO_MP")
    expect(out.targetAmountArs).toBe(154000)
    expect(applyPriceChange).not.toHaveBeenCalled()
    expect(updates.at(-1)).toMatchObject({
      addons_mp_sync_state: "NOT_APPLICABLE",
      addons_mp_synced_amount_ars: 15000,
    })
  })

  it("si el importe ya está sincronizado no hace nada", async () => {
    const { admin, updates } = makeAdmin({
      org: { addons_mp_synced_amount_ars: 15000 },
      ...contratado(15000),
    })

    const out = await syncAddonsToMp(admin as any, "org-1", {
      allowReauth: false,
      source: "cron",
    })

    expect(out.kind).toBe("NO_CHANGE")
    expect(applyPriceChange).not.toHaveBeenCalled()
    expect(updates).toHaveLength(0)
  })

  it("con override manual el total no suma complementos", async () => {
    const { admin } = makeAdmin({
      org: { manual_mrr_override_ars: 200000, addons_mp_synced_amount_ars: 0 },
      ...contratado(15000),
    })

    const out = await syncAddonsToMp(admin as any, "org-1", {
      allowReauth: false,
      source: "admin",
    })

    // El override manda: 200.000, sin los 15.000 encima. Y como los addons
    // facturables quedan en 0, no hay nada que sincronizar.
    expect(out.targetAmountArs).toBe(200000)
    expect(out.kind).toBe("NO_CHANGE")
  })
})
