/**
 * @jest-environment node
 *
 * Lectura de los movimientos de resultado financiero.
 *
 * Estos asientos no cuelgan de ninguna operación y `ledger_movements` no tiene
 * `agency_id`: la única atribución posible es la oficina de la cuenta por la
 * que se movió la plata. Y son los únicos movimientos del sistema que se
 * identifican por concepto, así que los filtros que se le piden a la base son
 * parte del contrato, no un detalle de implementación.
 */

import { fetchFinancialResults } from "../fetch-financial-results"

/** Asiento de ledger, con lo mínimo que lee la query. */
function asiento(over: Record<string, any> = {}) {
  return {
    id: "lm-1",
    concept: "Ganancia financiera por depósito - REC-1",
    currency: "ARS",
    amount_original: 12000,
    movement_date: "2026-06-30T03:00:00+00:00",
    account_id: "acc-ganancia",
    receipt_number: "REC-1",
    ...over,
  }
}

/**
 * Mock del query builder. Devuelve filas distintas según el `type` pedido
 * (INCOME vs EXPENSE) y registra los filtros para poder afirmar sobre ellos.
 */
function makeSupabase(
  byType: { INCOME?: any[]; EXPENSE?: any[] },
  accounts: any[] = []
) {
  const eqCalls: Array<[string, any]> = []
  const isCalls: Array<[string, any]> = []
  const likeCalls: Array<[string, any]> = []
  const gteCalls: Array<[string, any]> = []
  const lteCalls: Array<[string, any]> = []

  const client = {
    from: jest.fn((table: string) => {
      let ledgerType: string | null = null
      const builder: any = {
        select: jest.fn(() => builder),
        eq: jest.fn((col: string, val: any) => {
          if (table === "ledger_movements") {
            eqCalls.push([col, val])
            if (col === "type") ledgerType = val
          }
          return builder
        }),
        like: jest.fn((col: string, val: any) => {
          likeCalls.push([col, val])
          return builder
        }),
        is: jest.fn((col: string, val: any) => {
          isCalls.push([col, val])
          return builder
        }),
        gte: jest.fn((col: string, val: any) => {
          gteCalls.push([col, val])
          return builder
        }),
        lte: jest.fn((col: string, val: any) => {
          lteCalls.push([col, val])
          return builder
        }),
        order: jest.fn(() => builder),
        range: jest.fn(() => builder),
        then: (resolve: any) => {
          const rows =
            table === "financial_accounts"
              ? accounts
              : (byType as any)[ledgerType ?? ""] ?? []
          return Promise.resolve({ data: rows, error: null }).then(resolve)
        },
      }
      return builder
    }),
  }

  return { client, eqCalls, isCalls, likeCalls, gteCalls, lteCalls }
}

async function leer(
  byType: { INCOME?: any[]; EXPENSE?: any[] },
  extra: Partial<Parameters<typeof fetchFinancialResults>[0]> = {},
  accounts: any[] = []
) {
  const mock = makeSupabase(byType, accounts)
  const result = await fetchFinancialResults({
    supabase: mock.client,
    orgId: "org-1",
    ...extra,
  })
  return { ...result, ...mock }
}

describe("fetchFinancialResults — filtros pedidos a la base", () => {
  it("filtra por org, tipo y concepto", async () => {
    const { eqCalls, likeCalls } = await leer({ INCOME: [asiento()] })
    expect(eqCalls).toContainEqual(["org_id", "org-1"])
    expect(eqCalls).toContainEqual(["type", "INCOME"])
    expect(eqCalls).toContainEqual(["type", "EXPENSE"])
    expect(likeCalls).toContainEqual(["concept", "Ganancia financiera%"])
    expect(likeCalls).toContainEqual(["concept", "Costo financiero%"])
  })

  it("descarta los movimientos reversados y los excluidos del saldo", async () => {
    // Un asiento reversado no movió plata neta: si lo contáramos, el neteo del
    // reporte quedaría inflado por una operación que se deshizo.
    const { isCalls, eqCalls } = await leer({ INCOME: [asiento()] })
    expect(isCalls).toContainEqual(["reversed_at", null])
    expect(eqCalls).toContainEqual(["affects_balance", true])
  })

  it("filtra por fecha de negocio, no por una ventana de instantes (VIB-178)", async () => {
    // Antes se comparaba `movement_date` contra los bordes del día argentino.
    // Como la mayoría de los movimientos guarda una fecha sin hora —medianoche
    // UTC— esa ventana se comía el primer día del mes siguiente y perdía el
    // primero del propio: agosto traía 117 movimientos de septiembre.
    const { gteCalls, lteCalls } = await leer(
      { INCOME: [asiento()] },
      { dateFrom: "2026-06-01", dateTo: "2026-06-30" }
    )
    expect(gteCalls).toContainEqual(["movement_day", "2026-06-01"])
    expect(lteCalls).toContainEqual(["movement_day", "2026-06-30"])
  })
})

describe("fetchFinancialResults — filas", () => {
  it("separa la ganancia del costo", async () => {
    const { rows } = await leer({
      INCOME: [asiento({ id: "lm-in", amount_original: 12000 })],
      EXPENSE: [
        asiento({
          id: "lm-out",
          concept: "Costo financiero por depósito - REC-1",
          amount_original: 85000,
          account_id: "acc-caja-ars",
        }),
      ],
    })

    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.id === "lm-in")?.kind).toBe("INCOME")
    expect(rows.find((r) => r.id === "lm-out")?.kind).toBe("COST")
  })

  it("devuelve los importes en positivo: el signo lo pone el reporte", async () => {
    const { rows } = await leer({
      EXPENSE: [asiento({ concept: "Costo financiero", amount_original: -85000 })],
    })
    expect(rows[0].amount).toBe(85000)
  })

  it("conserva moneda, fecha y comprobante de cada movimiento", async () => {
    const { rows } = await leer({
      INCOME: [asiento({ currency: "usd", receipt_number: "REC-77" })],
    })
    expect(rows[0].currency).toBe("USD")
    expect(rows[0].movement_date).toBe("2026-06-30T03:00:00+00:00")
    expect(rows[0].receiptNumber).toBe("REC-77")
  })
})

describe("fetchFinancialResults — alcance por oficina", () => {
  const cuentas = [
    { id: "acc-centro", agency_id: "ag-centro" },
    { id: "acc-norte", agency_id: "ag-norte" },
    { id: "acc-sin-oficina", agency_id: null },
  ]

  it("atribuye el movimiento a la oficina de la cuenta", async () => {
    const { rows } = await leer(
      {
        INCOME: [
          asiento({ id: "centro", account_id: "acc-centro" }),
          asiento({ id: "norte", account_id: "acc-norte" }),
        ],
      },
      { agencyId: "ag-centro" },
      cuentas
    )
    expect(rows.map((r) => r.id)).toEqual(["centro"])
  })

  it("con agencyId 'ALL' no filtra por oficina", async () => {
    const { rows } = await leer(
      {
        INCOME: [
          asiento({ id: "centro", account_id: "acc-centro" }),
          asiento({ id: "norte", account_id: "acc-norte" }),
        ],
      },
      { agencyId: "ALL" },
      cuentas
    )
    expect(rows).toHaveLength(2)
  })

  it("recorta por el techo de oficinas visibles del usuario", async () => {
    // Sin esto, un ADMIN scopeado a una oficina vería el resultado financiero
    // de toda la organización.
    const { rows } = await leer(
      {
        INCOME: [
          asiento({ id: "centro", account_id: "acc-centro" }),
          asiento({ id: "norte", account_id: "acc-norte" }),
        ],
      },
      { agencyIds: ["ag-centro"] },
      cuentas
    )
    expect(rows.map((r) => r.id)).toEqual(["centro"])
  })

  it("los movimientos en cuentas sin oficina entran siempre", async () => {
    // Misma regla que los gastos compartidos: no pertenecen a ninguna oficina,
    // así que ninguna los pierde.
    const { rows } = await leer(
      { INCOME: [asiento({ id: "compartido", account_id: "acc-sin-oficina" })] },
      { agencyIds: ["ag-centro"] },
      cuentas
    )
    expect(rows.map((r) => r.id)).toEqual(["compartido"])
  })
})
