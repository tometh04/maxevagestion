/**
 * @jest-environment node
 *
 * Qué movimientos de caja cuentan como gasto.
 *
 * Reportado por Lozada: anularon un retiro de USD 3.610 —lo sacaron del saldo
 * de la caja— y les seguía figurando en gastos. La lectura de gastos filtraba
 * por tipo y categoría, pero no miraba si el movimiento había sido revertido ni
 * si estaba excluido del saldo, así que la plata quedaba contada como gasto en
 * el reporte y en el resumen mensual.
 */

import { fetchExpenses } from "../fetch-expenses"

/** Movimiento de caja tipo EXPENSE, con lo mínimo que lee la query. */
function movimiento(over: Record<string, any> = {}) {
  return {
    id: "cm-1",
    type: "EXPENSE",
    category: "Otros",
    amount: 3610,
    currency: "USD",
    movement_date: "2026-08-03T19:31:00+00:00",
    created_at: "2026-08-03T19:31:00+00:00",
    notes: "RETIRO MAXI",
    financial_account_id: "acc-1",
    category_id: null,
    ledger_movement_id: "lm-1",
    financial_accounts: { id: "acc-1", name: "Caja USD", currency: "USD" },
    ledger_movements: { affects_balance: true },
    users: { id: "u-1", name: "Yamil" },
    ...over,
  }
}

/**
 * Mock del query builder. Registra los filtros pedidos sobre cash_movements
 * (para poder afirmar que la exclusión de revertidos se pide a la base) y
 * devuelve las filas configuradas.
 */
function makeSupabase(cashMovements: any[]) {
  const isCalls: Array<[string, any]> = []
  const client = {
    from: jest.fn((table: string) => {
      const rows = table === "cash_movements" ? cashMovements : []
      const builder: any = {
        select: jest.fn(() => builder),
        eq: jest.fn(() => builder),
        neq: jest.fn(() => builder),
        not: jest.fn(() => builder),
        gte: jest.fn(() => builder),
        lte: jest.fn(() => builder),
        in: jest.fn(() => builder),
        order: jest.fn(() => builder),
        is: jest.fn((col: string, val: any) => {
          if (table === "cash_movements") isCalls.push([col, val])
          return builder
        }),
        then: (resolve: any) => Promise.resolve({ data: rows, error: null }).then(resolve),
      }
      return builder
    }),
  }
  return { client, isCalls }
}

async function gastosVariables(cashMovements: any[]) {
  const { client, isCalls } = makeSupabase(cashMovements)
  const { expenses, totals } = await fetchExpenses({
    supabase: client,
    orgId: "org-1",
    type: "variable",
  })
  return { expenses, totals, isCalls }
}

describe("fetchExpenses — gastos variables", () => {
  it("cuenta un movimiento normal", async () => {
    const { expenses, totals } = await gastosVariables([movimiento()])
    expect(expenses).toHaveLength(1)
    expect(totals.usd).toBe(3610)
  })

  it("le pide a la base excluir los movimientos revertidos", async () => {
    const { isCalls } = await gastosVariables([movimiento()])
    expect(isCalls).toContainEqual(["reversed_at", null])
  })

  it("no cuenta un movimiento excluido del saldo", async () => {
    // Es el caso de Lozada: sacado de la caja, seguía sumando en gastos.
    const { expenses, totals } = await gastosVariables([
      movimiento({ ledger_movements: { affects_balance: false } }),
    ])
    expect(expenses).toEqual([])
    expect(totals.usd).toBe(0)
  })

  it("tolera el embed to-one envuelto en array", async () => {
    const { expenses } = await gastosVariables([
      movimiento({ ledger_movements: [{ affects_balance: false }] }),
    ])
    expect(expenses).toEqual([])
  })

  it("un movimiento sin asiento vinculado sigue contando", async () => {
    // Sin asiento no hay nada que lo excluya: no se pierde plata por un dato
    // que falta.
    const { expenses } = await gastosVariables([
      movimiento({ ledger_movement_id: null, ledger_movements: null }),
    ])
    expect(expenses).toHaveLength(1)
  })

  it("mezcla: solo quedan los que cuentan", async () => {
    const { expenses, totals } = await gastosVariables([
      movimiento({ id: "ok-1", amount: 100 }),
      movimiento({ id: "excluido", amount: 3610, ledger_movements: { affects_balance: false } }),
      movimiento({ id: "ok-2", amount: 50, currency: "ARS" }),
    ])
    expect(expenses.map((e: any) => e.id).sort()).toEqual(["ok-1", "ok-2"])
    expect(totals.usd).toBe(100)
    expect(totals.ars).toBe(50)
  })
})
