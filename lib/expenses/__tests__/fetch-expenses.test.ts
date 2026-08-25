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
    agency_id: null,
    is_touristic: false,
    ...over,
  }
}

/** Asiento de gasto recurrente, tal como lo lee la rama de fijos. */
function recurrente(over: Record<string, any> = {}) {
  return {
    id: "lm-9",
    type: "EXPENSE",
    concept: "Gasto recurrente: Alquiler",
    currency: "ARS",
    amount_original: 500000,
    category_id: null,
    movement_date: "2026-08-01T12:00:00+00:00",
    created_at: "2026-08-01T12:00:00+00:00",
    account_id: "acc-1",
    notes: null,
    receipt_number: null,
    financial_accounts: { id: "acc-1", name: "Caja ARS", currency: "ARS" },
    users: { id: "u-1", name: "Yamil" },
    ...over,
  }
}

/**
 * Mock del query builder. Registra los filtros pedidos sobre cash_movements
 * (para poder afirmar que la exclusión de revertidos se pide a la base) y
 * devuelve las filas configuradas.
 */
function makeSupabase(cashMovements: any[], extraTables: Record<string, any[]> = {}) {
  const isCalls: Array<[string, any]> = []
  const eqCalls: Array<[string, any]> = []
  const likeCalls: Array<[string, any]> = []
  const notCalls: Array<[string, string, any]> = []
  const ledgerNotCalls: Array<[string, string, any]> = []
  const selectedColumns: string[] = []
  const client = {
    from: jest.fn((table: string) => {
      const rows =
        table === "cash_movements" ? cashMovements : extraTables[table] ?? []
      const builder: any = {
        select: jest.fn((cols?: string) => {
          if (table === "cash_movements" && cols) selectedColumns.push(cols)
          return builder
        }),
        eq: jest.fn((col: string, val: any) => {
          if (table === "cash_movements") eqCalls.push([col, val])
          return builder
        }),
        neq: jest.fn(() => builder),
        not: jest.fn((col: string, op: string, val: any) => {
          if (table === "cash_movements") notCalls.push([col, op, val])
          if (table === "ledger_movements") ledgerNotCalls.push([col, op, val])
          return builder
        }),
        like: jest.fn((col: string, val: any) => {
          if (table === "ledger_movements") likeCalls.push([col, val])
          return builder
        }),
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
  return { client, isCalls, eqCalls, likeCalls, notCalls, ledgerNotCalls, selectedColumns }
}

async function gastosVariables(
  cashMovements: any[],
  extra: Partial<Parameters<typeof fetchExpenses>[0]> = {},
  extraTables: Record<string, any[]> = {}
) {
  const { client, isCalls, eqCalls, notCalls, selectedColumns } = makeSupabase(cashMovements, extraTables)
  const { expenses, totals, excludedTouristic } = await fetchExpenses({
    supabase: client,
    orgId: "org-1",
    type: "variable",
    ...extra,
  })
  return { expenses, totals, excludedTouristic, isCalls, eqCalls, notCalls, selectedColumns }
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

/**
 * Turístico = plata que ya redujo el margen de la operación. El reporte de
 * Gastos la muestra (es un egreso real de la caja); cualquier reporte que reste
 * gastos CONTRA el margen tiene que sacarla o la cuenta dos veces.
 */
describe("fetchExpenses — excludeTouristic", () => {
  it("por defecto no cambia nada (el reporte de Gastos sigue igual)", async () => {
    const { expenses, excludedTouristic } = await gastosVariables([
      movimiento({ id: "turistico", is_touristic: true }),
      movimiento({ id: "normal" }),
    ])
    expect(expenses.map((e: any) => e.id).sort()).toEqual(["normal", "turistico"])
    expect(excludedTouristic).toBe(0)
  })

  it("descarta los turísticos y los cuenta", async () => {
    const { expenses, totals, excludedTouristic } = await gastosVariables(
      [
        movimiento({ id: "turistico", amount: 1000, is_touristic: true }),
        movimiento({ id: "normal", amount: 200 }),
      ],
      { excludeTouristic: true }
    )
    expect(expenses.map((e: any) => e.id)).toEqual(["normal"])
    expect(totals.usd).toBe(200)
    expect(excludedTouristic).toBe(1)
  })

  it("descarta la devolución al cliente también por turístico", async () => {
    // CUSTOMER_REFUND ya se excluye por categoría en la query (ver el bloque
    // "salidas que no son gasto"), pero además viaja con is_touristic = true: ya
    // bajó la venta, así que un reporte contra-margen tampoco puede restarla.
    const { expenses, excludedTouristic } = await gastosVariables(
      [movimiento({ id: "refund", category: "CUSTOMER_REFUND", is_touristic: true })],
      { excludeTouristic: true }
    )
    expect(expenses).toEqual([])
    expect(excludedTouristic).toBe(1)
  })

  it("conserva las filas viejas con is_touristic en null", async () => {
    // La columna es nullable con DEFAULT true: un .eq("is_touristic", false) en
    // la query las borraría en silencio. Por eso el filtro es === true.
    const { expenses } = await gastosVariables(
      [movimiento({ id: "legacy", is_touristic: null })],
      { excludeTouristic: true }
    )
    expect(expenses.map((e: any) => e.id)).toEqual(["legacy"])
  })

  it("no le pide a la base filtrar por is_touristic", async () => {
    const { eqCalls, selectedColumns } = await gastosVariables([movimiento()], {
      excludeTouristic: true,
    })
    expect(eqCalls.map(([col]) => col)).not.toContain("is_touristic")
    expect(selectedColumns.join(" ")).toContain("is_touristic")
  })
})

/**
 * Salidas de caja que NO son gasto de agencia. Ambas se resuelven en la query
 * (el reporte de Gastos y su PDF la comparten):
 *  - CUSTOMER_REFUND (el "vuelto") se excluye por categoría, siempre.
 *  - is_agency_expense = false marca a mano una salida puntual como no-gasto
 *    (comisión pagada por fuera, baja financiera, aéreos mal cargados). Los
 *    históricos son true por default, así que el reporte no cambia para nadie.
 */
describe("fetchExpenses — salidas que no son gasto", () => {
  it("le pide a la base excluir la devolución al cliente por categoría", async () => {
    const { notCalls } = await gastosVariables([movimiento()])
    const categoryNotIn = notCalls.find(([col, op]) => col === "category" && op === "in")
    expect(categoryNotIn).toBeDefined()
    expect(String(categoryNotIn?.[2])).toContain("CUSTOMER_REFUND")
  })

  it("le pide a la base excluir las salidas marcadas como no-gasto", async () => {
    const { eqCalls } = await gastosVariables([movimiento()])
    expect(eqCalls).toContainEqual(["is_agency_expense", true])
  })
})

/**
 * Techo de oficinas visibles. Sin esto, un ADMIN scopeado a una oficina
 * comparaba el margen de SU oficina contra los gastos de toda la org.
 */
describe("fetchExpenses — agencyIds", () => {
  it("deja pasar solo las oficinas visibles", async () => {
    const { expenses } = await gastosVariables(
      [
        movimiento({ id: "rosario", agency_id: "ag-1" }),
        movimiento({ id: "madero", agency_id: "ag-2" }),
      ],
      { agencyIds: ["ag-1"] }
    )
    expect(expenses.map((e: any) => e.id)).toEqual(["rosario"])
  })

  it("los gastos sin oficina entran siempre (costos compartidos)", async () => {
    // Alquiler, sueldos y contador no pertenecen a ninguna oficina: recortarlos
    // por alcance inflaría la ganancia de quien ve una sola.
    const { expenses } = await gastosVariables(
      [movimiento({ id: "contador", agency_id: null })],
      { agencyIds: ["ag-1"] }
    )
    expect(expenses.map((e: any) => e.id)).toEqual(["contador"])
  })

  it("sin agencyIds no restringe nada", async () => {
    const { expenses } = await gastosVariables([
      movimiento({ id: "rosario", agency_id: "ag-1" }),
      movimiento({ id: "madero", agency_id: "ag-2" }),
    ])
    expect(expenses).toHaveLength(2)
  })

  it("también recorta los gastos recurrentes", async () => {
    const { client } = makeSupabase([], {
      ledger_movements: [
        recurrente({ id: "alq-rosario", concept: "Gasto recurrente: Alquiler Rosario" }),
        recurrente({ id: "alq-madero", concept: "Gasto recurrente: Alquiler Madero" }),
      ],
      recurring_payments: [
        { description: "Alquiler Rosario", category_id: null, agency_id: "ag-1" },
        { description: "Alquiler Madero", category_id: null, agency_id: "ag-2" },
      ],
      financial_accounts: [{ id: "acc-1", agency_id: null }],
    })
    const { expenses } = await fetchExpenses({
      supabase: client,
      orgId: "org-1",
      type: "recurring",
      agencyIds: ["ag-1"],
    })
    expect(expenses.map((e: any) => e.id)).toEqual(["alq-rosario"])
  })
})

describe("fetchExpenses — retiros de socios", () => {
  it("le pide a la base solo los asientos de gasto recurrente", async () => {
    // Los retiros de socios van a ledger_movements con concepto
    // "Retiro socio: ...". Lo único que los mantiene fuera de gastos es este
    // LIKE. Importa para el societario: resta gastos de la ganancia ANTES de
    // repartirla, así que un retiro contado como gasto se le descontaría dos
    // veces al socio.
    const { client, likeCalls } = makeSupabase([], {
      financial_accounts: [{ id: "acc-1", agency_id: null }],
    })
    await fetchExpenses({ supabase: client, orgId: "org-1", type: "recurring" })
    expect(likeCalls).toContainEqual(["concept", "Gasto recurrente:%"])
  })
})

// ==================================================================
// VIB-142 — Las líneas de asiento no son gastos
//
// Reportado por Lozada: "tiré el reporte de gastos y hay muchísimos gastos
// duplicados, vi 58 millones y dije qué pasó".
//
// Los gastos fijos se buscan en ledger_movements por type EXPENSE y concepto
// "Gasto recurrente:%". Las líneas de asiento copian el concepto del
// movimiento que las origina y llevan el mismo type, así que cada gasto real
// sumaba además sus DOS líneas contables (el Debe del gasto y el Haber del
// banco) y el reporte mostraba el triple: ARS 59.174.119 donde iban 20.250.040.
//
// El discriminador es el invariante del módulo: un movimiento de dinero
// siempre tiene cuenta financiera, una línea de asiento nunca.
// ==================================================================
describe("fetchExpenses — gastos fijos vs líneas de asiento", () => {
  it("le pide a la base excluir las líneas de asiento", async () => {
    const { client, ledgerNotCalls } = makeSupabase([], {
      ledger_movements: [recurrente()],
    })

    await fetchExpenses({ supabase: client, orgId: "org-1", type: "recurring" })

    expect(ledgerNotCalls).toContainEqual(["account_id", "is", null])
  })

  it("el filtro va sobre la misma query que busca el concepto del gasto fijo", async () => {
    // Si el filtro quedara en otra query, el duplicado vuelve.
    const { client, likeCalls, ledgerNotCalls } = makeSupabase([], {
      ledger_movements: [recurrente()],
    })

    await fetchExpenses({ supabase: client, orgId: "org-1", type: "recurring" })

    expect(likeCalls).toContainEqual(["concept", "Gasto recurrente:%"])
    expect(ledgerNotCalls.length).toBeGreaterThan(0)
  })
})
