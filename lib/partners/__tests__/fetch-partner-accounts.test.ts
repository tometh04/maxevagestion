/**
 * @jest-environment node
 *
 * Aislamiento de tenant en las tablas de socios.
 *
 * `partner_profit_allocations` tiene `org_id` nullable y `partner_withdrawals`
 * no tiene `org_id` ni policy de RLS: lo único que las separa de los datos de
 * otro tenant es el filtro `partner_id ∈ (socios de la org)`. Estos tests fijan
 * que ese filtro se pida SIEMPRE, incluso cuando la org no tiene socios.
 */

import { fetchOrgPartners, fetchPartnerAllocations } from "../fetch-partner-accounts"

interface QueryLog {
  table: string
  filters: Array<[string, any]>
}

function makeSupabase(rowsByTable: Record<string, any[]>) {
  const queries: QueryLog[] = []
  const client = {
    from: jest.fn((table: string) => {
      const log: QueryLog = { table, filters: [] }
      queries.push(log)
      const builder: any = {
        select: jest.fn(() => builder),
        eq: jest.fn((col: string, val: any) => {
          log.filters.push([`eq:${col}`, val])
          return builder
        }),
        in: jest.fn((col: string, val: any) => {
          log.filters.push([`in:${col}`, val])
          return builder
        }),
        order: jest.fn(() => builder),
        then: (resolve: any) =>
          Promise.resolve({ data: rowsByTable[table] ?? [], error: null }).then(resolve),
      }
      return builder
    }),
  }
  return { client, queries }
}

const SOCIOS = [
  { id: "p-1", partner_name: "Yamil", profit_percentage: 60, is_active: true },
  { id: "p-2", partner_name: "Santi", profit_percentage: 40, is_active: true },
  { id: "p-3", partner_name: "Ex socio", profit_percentage: 0, is_active: false },
]

describe("fetchOrgPartners", () => {
  it("scopea por org_id y separa activos de todos", async () => {
    const { client, queries } = makeSupabase({ partner_accounts: SOCIOS })
    const { partners, activeIds, allIds } = await fetchOrgPartners(client, "org-1")

    expect(queries[0].table).toBe("partner_accounts")
    expect(queries[0].filters).toContainEqual(["eq:org_id", "org-1"])
    expect(partners).toHaveLength(3)
    expect(activeIds).toEqual(["p-1", "p-2"])
    expect(allIds).toEqual(["p-1", "p-2", "p-3"])
  })

  it("normaliza el porcentaje nulo a 0", async () => {
    const { client } = makeSupabase({
      partner_accounts: [{ id: "p-1", partner_name: "Nuevo", profit_percentage: null, is_active: true }],
    })
    const { partners } = await fetchOrgPartners(client, "org-1")
    expect(partners[0].percentage).toBe(0)
  })

  it("devuelve vacío si la lectura falla", async () => {
    const client = {
      from: jest.fn(() => {
        const builder: any = {
          select: jest.fn(() => builder),
          eq: jest.fn(() => builder),
          order: jest.fn(() => builder),
          then: (resolve: any) =>
            Promise.resolve({ data: null, error: { message: "boom" } }).then(resolve),
        }
        return builder
      }),
    }
    await expect(fetchOrgPartners(client, "org-1")).resolves.toEqual({
      partners: [],
      activeIds: [],
      allIds: [],
    })
  })
})

describe("fetchPartnerAllocations", () => {
  const ALLOCATIONS = [
    { partner_id: "p-1", year: 2026, month: 7, profit_amount: 6000, currency: "USD", exchange_rate: 1450, status: "ALLOCATED" },
    { partner_id: "p-2", year: 2026, month: 7, profit_amount: 4000, currency: "USD", exchange_rate: 1450, status: "ALLOCATED" },
    { partner_id: "p-1", year: 2026, month: 9, profit_amount: 999, currency: "USD", exchange_rate: null, status: "ALLOCATED" },
  ]

  it("filtra siempre por partner_id y por año", async () => {
    const { client, queries } = makeSupabase({ partner_profit_allocations: ALLOCATIONS })
    await fetchPartnerAllocations(client, ["p-1", "p-2"], ["2026-07"])

    const q = queries.find((x) => x.table === "partner_profit_allocations")!
    expect(q.filters).toContainEqual(["in:partner_id", ["p-1", "p-2"]])
    expect(q.filters).toContainEqual(["in:year", [2026]])
  })

  it("NO filtra por org_id (la columna es nullable y perdería filas viejas)", async () => {
    const { client, queries } = makeSupabase({ partner_profit_allocations: ALLOCATIONS })
    await fetchPartnerAllocations(client, ["p-1"], ["2026-07"])

    const q = queries.find((x) => x.table === "partner_profit_allocations")!
    expect(q.filters.map(([f]) => f)).not.toContain("eq:org_id")
  })

  it("recorta los meses fuera del rango en memoria", async () => {
    const { client } = makeSupabase({ partner_profit_allocations: ALLOCATIONS })
    const rows = await fetchPartnerAllocations(client, ["p-1", "p-2"], ["2026-07"])

    expect(rows.map((r) => r.monthKey)).toEqual(["2026-07", "2026-07"])
    expect(rows[0]).toMatchObject({ partnerId: "p-1", amount: 6000, currency: "USD", exchangeRate: 1450 })
  })

  it("sin socios no emite la query (una sin filtro saldría sin scope de tenant)", async () => {
    const { client, queries } = makeSupabase({ partner_profit_allocations: ALLOCATIONS })
    const rows = await fetchPartnerAllocations(client, [], ["2026-07"])

    expect(rows).toEqual([])
    expect(queries).toHaveLength(0)
  })

  it("sin meses tampoco emite la query", async () => {
    const { client, queries } = makeSupabase({ partner_profit_allocations: ALLOCATIONS })
    await fetchPartnerAllocations(client, ["p-1"], [])
    expect(queries).toHaveLength(0)
  })

  it("resuelve las distribuciones de un socio dado de baja", async () => {
    // Se pasa `allIds`, no `activeIds`: una distribución vieja de un socio
    // inactivo desaparecería del histórico.
    const { client } = makeSupabase({
      partner_profit_allocations: [
        { partner_id: "p-3", year: 2026, month: 7, profit_amount: 1000, currency: "USD", exchange_rate: null, status: "ALLOCATED" },
      ],
    })
    const rows = await fetchPartnerAllocations(client, ["p-1", "p-2", "p-3"], ["2026-07"])
    expect(rows.map((r) => r.partnerId)).toEqual(["p-3"])
  })
})
