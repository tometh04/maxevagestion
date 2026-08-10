/**
 * VIB-63 — Cálculo y persistencia de las comisiones de una operación.
 *
 * El archivo anterior no importaba nada: replicaba la aritmética dentro del
 * propio test, así que romper `calculateCommission` no hacía fallar ninguna
 * assertion. Estos tests sí ejercitan el módulo real.
 */

import {
  applyCommissionPlan,
  computeOperationCommission,
  type CommissionOperation,
} from "@/lib/commissions/calculate"
import type { SellerCommissionProfile } from "@/lib/commissions/seller-commission-profile"
import type { SharedSaleMode } from "@/lib/commissions/shared-split"

jest.mock("@/lib/audit", () => ({ logAudit: jest.fn().mockResolvedValue(undefined) }))
jest.mock("@/lib/supabase/server", () => ({ createServerClient: jest.fn() }))

/** Administrador del vendedor (VIB-102): [managerId, porcentaje]. */
type ManagerLink = [string, number | null]

function profiles(
  ...entries: Array<[string, number | null, SharedSaleMode?, ManagerLink?]>
): Map<string, SellerCommissionProfile> {
  return new Map(
    entries.map(([sellerId, percentage, mode, manager]) => [
      sellerId,
      {
        sellerId,
        name: sellerId,
        percentage,
        mode: mode ?? "HALF",
        source: "USER_DEFAULT" as const,
        advisorManagerId: manager?.[0] ?? null,
        advisorManagerPercentage: manager?.[1] ?? null,
      },
    ])
  )
}

const baseOp = (over: Partial<CommissionOperation> = {}): CommissionOperation => ({
  id: "op-1",
  org_id: "org-1",
  agency_id: "ag-1",
  seller_id: "jose",
  margin_amount: 1000,
  ...over,
})

describe("computeOperationCommission", () => {
  it("una venta sin secundario paga el porcentaje completo del vendedor", () => {
    const plan = computeOperationCommission(baseOp(), profiles(["jose", 20]))

    expect(plan.rule).toBe("SOLO")
    expect(plan.entries).toEqual([
      { sellerId: "jose", role: "PRIMARY", percentage: 20, amount: 200 },
    ])
    expect(plan.totalCommission).toBe(200)
  })

  it("una venta compartida reparte según el motor, sin mirar el body", () => {
    const plan = computeOperationCommission(
      baseOp({
        seller_secondary_id: "santi",
        // Esto es exactamente lo que mandaba la UI rota: ceros.
        commission_pct_primary: 0,
        commission_pct_secondary: 0,
      }),
      profiles(["jose", 20], ["santi", 35, "ABSORB"])
    )

    // En AUTO los porcentajes del body se ignoran: el bug que dejó ventas sin
    // comisionar ya no puede reproducirse desde el navegador.
    expect(plan.entries).toEqual([
      { sellerId: "jose", role: "PRIMARY", percentage: 10, amount: 100 },
      { sellerId: "santi", role: "SECONDARY", percentage: 25, amount: 250 },
    ])
    expect(plan.totalCommission).toBe(350)
  })

  it("el resultado no cambia si se invierten principal y secundario", () => {
    const directo = computeOperationCommission(
      baseOp({ seller_id: "jose", seller_secondary_id: "santi" }),
      profiles(["jose", 20], ["santi", 35, "ABSORB"])
    )
    const invertido = computeOperationCommission(
      baseOp({ seller_id: "santi", seller_secondary_id: "jose" }),
      profiles(["jose", 20], ["santi", 35, "ABSORB"])
    )

    const montos = (p: typeof directo) =>
      Object.fromEntries(p.entries.map((e) => [e.sellerId, e.amount]))

    expect(montos(invertido)).toEqual(montos(directo))
    expect(invertido.totalCommission).toBe(directo.totalCommission)
  })

  it("en MANUAL respeta los porcentajes cargados a mano", () => {
    const plan = computeOperationCommission(
      baseOp({
        seller_secondary_id: "santi",
        commission_split_mode: "MANUAL",
        commission_pct_primary: 7,
        commission_pct_secondary: 28,
      }),
      profiles(["jose", 20], ["santi", 35, "ABSORB"])
    )

    expect(plan.rule).toBe("MANUAL")
    expect(plan.entries.map((e) => e.amount)).toEqual([70, 280])
  })

  it("el porcentaje guardado es el efectivo, no el crudo del vendedor", () => {
    const plan = computeOperationCommission(
      baseOp({ seller_secondary_id: "malena" }),
      profiles(["jose", 20], ["malena", 13])
    )

    // Invariante verificable: amount == margen × percentage / 100.
    for (const entry of plan.entries) {
      expect(entry.amount).toBeCloseTo((1000 * entry.percentage) / 100, 2)
    }
    expect(plan.entries.map((e) => e.percentage)).toEqual([10, 6.5])
  })

  it("con margen negativo el monto es 0, nunca negativo", () => {
    const plan = computeOperationCommission(
      baseOp({ margin_amount: -500, seller_secondary_id: "santi" }),
      profiles(["jose", 20], ["santi", 35])
    )

    expect(plan.entries.map((e) => e.amount)).toEqual([0, 0])
    expect(plan.totalCommission).toBe(0)
  })

  it("un vendedor sin porcentaje configurado deja warning y cobra 0", () => {
    const plan = computeOperationCommission(baseOp(), profiles(["jose", null]))

    expect(plan.entries[0].amount).toBe(0)
    expect(plan.warnings).toEqual([{ code: "missing_percentage", sellerId: "jose" }])
  })

  it("el mismo vendedor como principal y secundario genera un solo registro", () => {
    const plan = computeOperationCommission(
      baseOp({ seller_secondary_id: "jose" }),
      profiles(["jose", 20])
    )

    expect(plan.entries).toHaveLength(1)
    expect(plan.entries[0].amount).toBe(200)
  })

  it("sin vendedor no hay plan", () => {
    const plan = computeOperationCommission(baseOp({ seller_id: "" }), profiles())
    expect(plan.entries).toEqual([])
    expect(plan.rule).toBe("NONE")
  })
})

// ── VIB-102: comisión del administrador del asesor independiente ───────────

describe("computeOperationCommission — administrador del vendedor", () => {
  it("reparte la venta de un free entre free, administrador y agencia", () => {
    // El caso exacto que planteó el cliente: free 50%, administrador 5%,
    // agencia el resto.
    const plan = computeOperationCommission(
      baseOp({ seller_id: "free" }),
      profiles(["free", 50, "HALF", ["mica", 5]])
    )

    expect(plan.entries).toEqual([
      { sellerId: "free", role: "PRIMARY", percentage: 50, amount: 500 },
      {
        sellerId: "mica",
        role: "ADVISOR_MANAGER",
        percentage: 5,
        amount: 50,
        sourceSellerId: "free",
      },
    ])
    expect(plan.totalCommission).toBe(550)
    // Lo que queda para la agencia es el residuo, no un número guardado.
    expect(1000 - plan.totalCommission).toBe(450)
    expect(plan.hasAdvisorManagerCommission).toBe(true)
  })

  it("el administrador cobra sobre el margen completo en una venta compartida", () => {
    const plan = computeOperationCommission(
      baseOp({ seller_id: "free", seller_secondary_id: "santi" }),
      profiles(["free", 50, "HALF", ["mica", 5]], ["santi", 20])
    )

    // free y santi se reparten la mitad de lo suyo; mica cobra su 5% entero.
    expect(plan.entries).toEqual([
      { sellerId: "free", role: "PRIMARY", percentage: 25, amount: 250 },
      { sellerId: "santi", role: "SECONDARY", percentage: 10, amount: 100 },
      {
        sellerId: "mica",
        role: "ADVISOR_MANAGER",
        percentage: 5,
        amount: 50,
        sourceSellerId: "free",
      },
    ])
  })

  it("no depende de si el free quedó cargado como principal o secundario", () => {
    const comoPrincipal = computeOperationCommission(
      baseOp({ seller_id: "free", seller_secondary_id: "santi" }),
      profiles(["free", 50, "HALF", ["mica", 5]], ["santi", 20])
    )
    const comoSecundario = computeOperationCommission(
      baseOp({ seller_id: "santi", seller_secondary_id: "free" }),
      profiles(["free", 50, "HALF", ["mica", 5]], ["santi", 20])
    )

    const montos = (p: typeof comoPrincipal) =>
      Object.fromEntries(p.entries.map((e) => [e.sellerId, e.amount]))

    expect(montos(comoSecundario)).toEqual(montos(comoPrincipal))
  })

  it("un administrador de los dos vendedores cobra una sola vez", () => {
    const plan = computeOperationCommission(
      baseOp({ seller_id: "free-a", seller_secondary_id: "free-b" }),
      profiles(["free-a", 50, "HALF", ["mica", 5]], ["free-b", 40, "HALF", ["mica", 5]])
    )

    const mica = plan.entries.filter((e) => e.sellerId === "mica")
    expect(mica).toHaveLength(1)
    expect(mica[0].percentage).toBe(5)
  })

  it("dos administradores distintos cobran cada uno lo suyo", () => {
    const plan = computeOperationCommission(
      baseOp({ seller_id: "free-a", seller_secondary_id: "free-b" }),
      profiles(["free-a", 50, "HALF", ["mica", 5]], ["free-b", 40, "HALF", ["rama", 3]])
    )

    expect(
      plan.entries
        .filter((e) => e.role === "ADVISOR_MANAGER")
        .map((e) => [e.sellerId, e.amount])
    ).toEqual([
      ["mica", 50],
      ["rama", 30],
    ])
  })

  it("un administrador asignado sin porcentaje no cobra y deja warning", () => {
    const plan = computeOperationCommission(
      baseOp({ seller_id: "free" }),
      profiles(["free", 50, "HALF", ["mica", null]])
    )

    expect(plan.entries).toHaveLength(1)
    expect(plan.hasAdvisorManagerCommission).toBe(false)
    expect(plan.warnings).toContainEqual({
      code: "manager_missing_percentage",
      sellerId: "free",
      managerId: "mica",
    })
  })

  it("si el administrador además vendió la operación, cobra en una sola fila", () => {
    // El unique (operation_id, seller_id) impide dos filas para la misma
    // persona: los dos porcentajes se acumulan en la suya.
    const plan = computeOperationCommission(
      baseOp({ seller_id: "free", seller_secondary_id: "mica" }),
      profiles(["free", 50, "HALF", ["mica", 5]], ["mica", 20])
    )

    const mica = plan.entries.filter((e) => e.sellerId === "mica")
    expect(mica).toHaveLength(1)
    // 10 por vender (mitad de su 20%) + 5 por administrar al free.
    expect(mica[0]).toEqual({ sellerId: "mica", role: "SECONDARY", percentage: 15, amount: 150 })
    // La bandera sigue en true: la fila tiene que persistirse con kind SELLER.
    expect(plan.hasAdvisorManagerCommission).toBe(true)
  })

  it("el snapshot de porcentajes de la operación no incluye al administrador", () => {
    const plan = computeOperationCommission(
      baseOp({ seller_id: "free" }),
      profiles(["free", 50, "HALF", ["mica", 5]])
    )

    expect(plan.pctPrimary).toBe(50)
    expect(plan.pctSecondary).toBeNull()
  })

  it("con margen no positivo el administrador no cobra", () => {
    const plan = computeOperationCommission(
      baseOp({ seller_id: "free", margin_amount: -100 }),
      profiles(["free", 50, "HALF", ["mica", 5]])
    )

    expect(plan.entries.map((e) => e.amount)).toEqual([0, 0])
    expect(plan.totalCommission).toBe(0)
  })

  it("en MANUAL el administrador igual cobra: es otra configuración", () => {
    const plan = computeOperationCommission(
      baseOp({
        seller_id: "free",
        seller_secondary_id: "santi",
        commission_split_mode: "MANUAL",
        commission_pct_primary: 30,
        commission_pct_secondary: 10,
      }),
      profiles(["free", 50, "HALF", ["mica", 5]], ["santi", 20])
    )

    expect(plan.rule).toBe("MANUAL")
    expect(plan.entries.map((e) => [e.sellerId, e.amount])).toEqual([
      ["free", 300],
      ["santi", 100],
      ["mica", 50],
    ])
  })
})

// ── applyCommissionPlan ────────────────────────────────────────────────────

interface FakeRecord {
  id: string
  seller_id: string
  status?: string | null
  amount?: number | null
  amount_paid?: number | null
  settled_at?: string | null
}

function createSupabase(existing: FakeRecord[]) {
  const updates: Array<{ id: string; values: any }> = []
  const inserts: any[] = []
  const deletes: string[] = []

  const from = () => {
    const state: any = { filters: {}, op: "select", values: null }

    const builder: any = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") {
            return (resolve: any) => {
              if (state.op === "update") {
                updates.push({ id: state.filters.id, values: state.values })
                resolve({ data: { id: state.filters.id }, error: null })
              } else if (state.op === "insert") {
                inserts.push(state.values)
                resolve({ data: { id: `new-${inserts.length}` }, error: null })
              } else if (state.op === "delete") {
                deletes.push(state.filters.id)
                resolve({ data: null, error: null })
              } else {
                resolve({ data: existing, error: null })
              }
            }
          }
          return (...args: any[]) => {
            const name = String(prop)
            if (name === "update" || name === "insert" || name === "delete") {
              state.op = name
              state.values = args[0] ?? null
            }
            if (name === "eq") state.filters[args[0]] = args[1]
            return builder
          }
        },
      }
    )
    return builder
  }

  return { client: { from } as any, updates, inserts, deletes }
}

type PlanRole = "PRIMARY" | "SECONDARY" | "ADVISOR_MANAGER"

const planOf = (entries: Array<[string, PlanRole, number, number, string?]>) => ({
  entries: entries.map(([sellerId, role, percentage, amount, sourceSellerId]) => ({
    sellerId,
    role,
    percentage,
    amount,
    ...(role === "ADVISOR_MANAGER" ? { sourceSellerId: sourceSellerId ?? null } : {}),
  })),
  totalCommission: entries.reduce((acc, e) => acc + e[3], 0),
  rule: "HALF_HALF" as const,
  absorberId: null,
  warnings: [],
  pctPrimary: entries[0]?.[2] ?? null,
  pctSecondary: entries[1]?.[2] ?? null,
  hasAdvisorManagerCommission: entries.some((e) => e[1] === "ADVISOR_MANAGER"),
})

describe("applyCommissionPlan", () => {
  it("no revive una comisión saldada: ni la recalcula ni la borra (VIB-94)", async () => {
    // Deuda vieja cerrada sin pago. Si el recálculo la pisara, la agencia
    // volvería a deberla apenas alguien edite la operación.
    const { client, updates, deletes } = createSupabase([
      { id: "cr-vieja", seller_id: "jose", status: "PENDING", amount: 100, settled_at: "2026-07-31T00:00:00Z" },
    ])

    const result = await applyCommissionPlan(client, baseOp(), planOf([["jose", "PRIMARY", 10, 999]]))

    expect(updates).toEqual([])
    expect(result.skipped).toEqual([{ sellerId: "jose", reason: "settled" }])

    // Y tampoco se borra cuando el vendedor deja de estar en la operación.
    const { client: client2, deletes: deletes2 } = createSupabase([
      { id: "cr-vieja", seller_id: "ex-vendedor", status: "PENDING", amount: 100, settled_at: "2026-07-31T00:00:00Z" },
    ])
    const result2 = await applyCommissionPlan(client2, baseOp(), planOf([["jose", "PRIMARY", 10, 50]]))

    expect(deletes).toEqual([])
    expect(deletes2).toEqual([])
    expect(result2.skipped).toEqual([{ sellerId: "ex-vendedor", reason: "settled" }])
  })

  it("crea los registros que faltan, con org_id", async () => {
    const { client, inserts } = createSupabase([])

    const result = await applyCommissionPlan(
      client,
      baseOp({ seller_secondary_id: "santi" }),
      planOf([
        ["jose", "PRIMARY", 10, 100],
        ["santi", "SECONDARY", 25, 250],
      ])
    )

    expect(result.written).toHaveLength(2)
    // Antes se insertaban sin org_id y quedaban fuera de toda query scopeada.
    expect(inserts.map((i) => i.org_id)).toEqual(["org-1", "org-1"])
    expect(inserts.map((i) => i.amount)).toEqual([100, 250])
  })

  it("marca el kind de las comisiones de administrador (VIB-102)", async () => {
    const { client, inserts } = createSupabase([])

    await applyCommissionPlan(
      client,
      baseOp({ seller_id: "free" }),
      planOf([
        ["free", "PRIMARY", 50, 500],
        ["mica", "ADVISOR_MANAGER", 5, 50, "free"],
      ])
    )

    expect(inserts.map((i) => [i.seller_id, i.kind, i.source_seller_id])).toEqual([
      ["free", "SELLER", null],
      ["mica", "ADVISOR_MANAGER", "free"],
    ])
  })

  it("no manda las columnas de VIB-102 si la operación no tiene administrador", async () => {
    // Desplegar el código antes de la migración no debe romper TODAS las
    // comisiones: sin administradores, el payload es el de siempre.
    const { client, inserts } = createSupabase([])

    await applyCommissionPlan(client, baseOp(), planOf([["jose", "PRIMARY", 10, 100]]))

    expect(inserts).toHaveLength(1)
    expect(inserts[0]).not.toHaveProperty("kind")
    expect(inserts[0]).not.toHaveProperty("source_seller_id")
  })

  it("no crea comisiones en 0 para un vendedor sin porcentaje configurado", async () => {
    // Una organización que todavía no cargó los porcentajes de sus vendedores no
    // tiene que llenarse de comisiones en $0, una por cada operación que toque.
    const { client, inserts } = createSupabase([])

    const result = await applyCommissionPlan(client, baseOp(), planOf([["jose", "PRIMARY", 0, 0]]))

    expect(inserts).toEqual([])
    expect(result.written).toEqual([])
  })

  it("corrige a la baja: un registro mal creado puede cerrarse en 0", async () => {
    // El código viejo hacía early-return cuando el total era 0, así que jamás
    // podía arreglar una comisión inflada ni cerrar una que no correspondía.
    const { client, updates } = createSupabase([
      { id: "rec-1", seller_id: "jose", status: "PENDING", amount: 999, amount_paid: 0 },
    ])

    await applyCommissionPlan(client, baseOp(), planOf([["jose", "PRIMARY", 0, 0]]))

    expect(updates).toHaveLength(1)
    expect(updates[0].values.amount).toBe(0)
  })

  it("no pisa una comisión ya pagada", async () => {
    const { client, updates } = createSupabase([
      { id: "rec-1", seller_id: "jose", status: "PAID", amount: 500, amount_paid: 500 },
    ])

    const result = await applyCommissionPlan(
      client,
      baseOp(),
      planOf([["jose", "PRIMARY", 20, 200]])
    )

    expect(updates).toHaveLength(0)
    expect(result.skipped).toEqual([{ sellerId: "jose", reason: "paid" }])
  })

  it("no pisa una comisión con pago parcial aunque siga en PENDING", async () => {
    // Mirar solo `status` no alcanza: el pago parcial deja PENDING con
    // amount_paid > 0, y recalcularlo movería plata ya cobrada.
    const { client, updates } = createSupabase([
      { id: "rec-1", seller_id: "jose", status: "PENDING", amount: 500, amount_paid: 120 },
    ])

    const result = await applyCommissionPlan(
      client,
      baseOp(),
      planOf([["jose", "PRIMARY", 20, 200]])
    )

    expect(updates).toHaveLength(0)
    expect(result.skipped).toEqual([{ sellerId: "jose", reason: "partially_paid" }])
  })

  it("elimina la comisión del vendedor que salió de la operación", async () => {
    const { client, deletes } = createSupabase([
      { id: "rec-1", seller_id: "jose", status: "PENDING", amount: 100, amount_paid: 0 },
      { id: "rec-viejo", seller_id: "ex-socio", status: "PENDING", amount: 80, amount_paid: 0 },
    ])

    const result = await applyCommissionPlan(
      client,
      baseOp(),
      planOf([["jose", "PRIMARY", 20, 200]])
    )

    expect(deletes).toEqual(["rec-viejo"])
    expect(result.removed).toEqual([{ sellerId: "ex-socio", amount: 80 }])
  })

  it("no elimina la comisión de un ex socio si ya tiene plata movida", async () => {
    const { client, deletes } = createSupabase([
      { id: "rec-1", seller_id: "jose", status: "PENDING", amount: 100, amount_paid: 0 },
      { id: "rec-viejo", seller_id: "ex-socio", status: "PENDING", amount: 80, amount_paid: 80 },
    ])

    const result = await applyCommissionPlan(
      client,
      baseOp(),
      planOf([["jose", "PRIMARY", 20, 200]])
    )

    expect(deletes).toEqual([])
    expect(result.skipped).toEqual([{ sellerId: "ex-socio", reason: "partially_paid" }])
  })

  it("un secundario con 0 legítimo se escribe igual", async () => {
    // El código viejo comprobaba `&& secondaryCommission` (truthy), así que un
    // 0 legítimo dejaba intacto el registro anterior.
    const { client, updates } = createSupabase([
      { id: "rec-2", seller_id: "santi", status: "PENDING", amount: 300, amount_paid: 0 },
    ])

    await applyCommissionPlan(
      client,
      baseOp({ seller_secondary_id: "santi" }),
      planOf([
        ["jose", "PRIMARY", 20, 200],
        ["santi", "SECONDARY", 0, 0],
      ])
    )

    expect(updates).toEqual([expect.objectContaining({ id: "rec-2" })])
    expect(updates[0].values.amount).toBe(0)
  })
})
