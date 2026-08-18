/**
 * TESTS DE CARACTERIZACIÓN — Motor de asientos contables (VIB-130)
 *
 * Estos tests NO proponen un diseño nuevo: fijan el comportamiento VIGENTE de
 * `journal-entries.ts` para poder migrar `createJournalEntry` a una RPC atómica
 * (VIB-134) sin regresiones silenciosas.
 *
 * Cubren:
 *  - validateJournalBalance (tolerancia de centavo)
 *  - Validaciones de createJournalEntry: mínimo 2 líneas, balance, Debe XOR Haber
 *  - Camino feliz: 1 ledger_movement por línea + update de partida doble
 *  - Rollback manual en JS (el que VIB-134 va a reemplazar por una transacción)
 *  - Idempotencia de los asientos automáticos, incluido el chequeo FRÁGIL por
 *    `ILIKE "Costo%"` del asiento de costo
 */

import {
  validateJournalBalance,
  createJournalEntry,
  createSaleJournalEntry,
  createCostJournalEntry,
  type JournalEntryLine,
} from "../journal-entries"
import { ACCOUNT_CODES } from "../account-codes"
import * as ledger from "../ledger"

jest.mock("../ledger", () => ({
  createLedgerMovement: jest.fn(),
}))

// ------------------------------------------------------------------
// Mock de Supabase: `from(table)` devuelve una cadena encadenable que
// registra las operaciones, para poder afirmar sobre el rollback.
// ------------------------------------------------------------------

type QueryResult = { data?: any; error?: any }

interface MockConfig {
  /** Resultado del INSERT en journal_entries (.insert().select().single()) */
  journalEntryInsert?: QueryResult
  /** Resultado del chequeo de idempotencia (.maybeSingle() sobre journal_entries) */
  existingJournalEntry?: QueryResult
  /** Filas devueltas por chart_of_accounts */
  chartAccounts?: any[]
  /** Resultado de la búsqueda de financial_account (.maybeSingle()) */
  financialAccount?: QueryResult
  /** Resultados del UPDATE de partida doble, consumidos en orden */
  updateResults?: QueryResult[]
}

interface RecordedCall {
  table: string
  ops: string[]
  args: any[][]
  payload?: any
}

function createMockSupabase(cfg: MockConfig = {}) {
  const calls: RecordedCall[] = []
  let updateCount = 0

  const from = jest.fn((table: string) => {
    const state: RecordedCall = { table, ops: [], args: [] }
    calls.push(state)

    const chain: any = {}
    const record = (op: string) => (...args: any[]) => {
      state.ops.push(op)
      state.args.push([op, ...args])
      return chain
    }

    for (const m of ["select", "eq", "in", "ilike", "limit", "order", "neq", "is"]) {
      chain[m] = jest.fn(record(m))
    }
    chain.insert = jest.fn((payload: any) => {
      state.ops.push("insert")
      state.payload = payload
      return chain
    })
    chain.update = jest.fn((payload: any) => {
      state.ops.push("update")
      state.payload = payload
      return chain
    })
    chain.delete = jest.fn(record("delete"))

    const resolve = (): QueryResult => {
      if (state.table === "chart_of_accounts") {
        return { data: cfg.chartAccounts ?? [], error: null }
      }
      if (state.ops.includes("update")) {
        const r = cfg.updateResults?.[updateCount] ?? { error: null }
        updateCount++
        return r
      }
      return { data: null, error: null }
    }

    chain.single = jest.fn(async () => {
      if (state.ops.includes("insert")) {
        return (
          cfg.journalEntryInsert ?? {
            data: {
              id: "je-1",
              entry_number: 1,
              entry_date: "2026-01-15",
              description: state.payload?.description ?? "",
              source: state.payload?.source ?? "MANUAL",
              total_amount: state.payload?.total_amount ?? 0,
              currency: state.payload?.currency ?? "ARS",
            },
            error: null,
          }
        )
      }
      return { data: null, error: null }
    })

    chain.maybeSingle = jest.fn(async () => {
      if (state.table === "journal_entries") return cfg.existingJournalEntry ?? { data: null }
      if (state.table === "financial_accounts") {
        return cfg.financialAccount ?? { data: { id: "fa-1" }, error: null }
      }
      return { data: null, error: null }
    })

    // La cadena es "thenable": `await client.from(x).update(y).eq(...)` resuelve acá.
    chain.then = (onOk: any, onErr: any) => Promise.resolve(resolve()).then(onOk, onErr)

    return chain
  })

  return { client: { from } as any, calls, from }
}

const line = (over: Partial<JournalEntryLine> = {}): JournalEntryLine => ({
  chart_account_id: "chart-1",
  financial_account_id: "fa-1",
  debit_amount: 100,
  ...over,
})

const baseParams = (lines: JournalEntryLine[]) => ({
  entry_date: "2026-01-15",
  description: "Asiento de prueba",
  source: "MANUAL" as const,
  lines,
})

beforeEach(() => {
  jest.clearAllMocks()
  let seq = 0
  ;(ledger.createLedgerMovement as jest.Mock).mockImplementation(async () => ({
    id: `mov-${++seq}`,
  }))
})

// ==================================================================
describe("validateJournalBalance", () => {
  it("considera válido un asiento con Debe === Haber", () => {
    const r = validateJournalBalance([
      line({ debit_amount: 1000, credit_amount: null }),
      line({ debit_amount: null, credit_amount: 1000 }),
    ])
    expect(r.valid).toBe(true)
    expect(r.totalDebit).toBe(1000)
    expect(r.totalCredit).toBe(1000)
    expect(r.difference).toBe(0)
  })

  it("tolera diferencias menores a un centavo (redondeo)", () => {
    const r = validateJournalBalance([
      line({ debit_amount: 100.005, credit_amount: null }),
      line({ debit_amount: null, credit_amount: 100 }),
    ])
    expect(r.valid).toBe(true)
    expect(r.difference).toBeLessThan(0.01)
  })

  it("rechaza una diferencia de un centavo o más", () => {
    const r = validateJournalBalance([
      line({ debit_amount: 100.01, credit_amount: null }),
      line({ debit_amount: null, credit_amount: 100 }),
    ])
    expect(r.valid).toBe(false)
    expect(r.difference).toBeCloseTo(0.01, 5)
  })

  it("trata null/undefined como cero", () => {
    const r = validateJournalBalance([
      { chart_account_id: "c1" } as JournalEntryLine,
      { chart_account_id: "c2", debit_amount: null, credit_amount: null } as JournalEntryLine,
    ])
    expect(r.totalDebit).toBe(0)
    expect(r.totalCredit).toBe(0)
    expect(r.valid).toBe(true)
  })
})

// ==================================================================
describe("createJournalEntry — validaciones", () => {
  it("rechaza un asiento con menos de 2 líneas", async () => {
    const { client } = createMockSupabase()
    await expect(createJournalEntry(baseParams([line()]), client)).rejects.toThrow(
      "al menos 2 líneas"
    )
  })

  it("rechaza un asiento desbalanceado", async () => {
    const { client } = createMockSupabase()
    await expect(
      createJournalEntry(
        baseParams([
          line({ debit_amount: 1000, credit_amount: null }),
          line({ debit_amount: null, credit_amount: 900 }),
        ]),
        client
      )
    ).rejects.toThrow(/desbalanceado/i)
  })

  it("no escribe nada en la base si el asiento está desbalanceado", async () => {
    const { client, calls } = createMockSupabase()
    await expect(
      createJournalEntry(
        baseParams([
          line({ debit_amount: 1000, credit_amount: null }),
          line({ debit_amount: null, credit_amount: 900 }),
        ]),
        client
      )
    ).rejects.toThrow()
    expect(calls).toHaveLength(0)
    expect(ledger.createLedgerMovement).not.toHaveBeenCalled()
  })

  it("rechaza una línea sin Debe ni Haber", async () => {
    const { client } = createMockSupabase()
    await expect(
      createJournalEntry(
        baseParams([
          line({ debit_amount: null, credit_amount: null }),
          line({ debit_amount: null, credit_amount: 0 }),
        ]),
        client
      )
    ).rejects.toThrow(/debe tener Debe o Haber/i)
  })

  it("rechaza una línea con Debe y Haber simultáneos", async () => {
    const { client } = createMockSupabase()
    // Ojo: el asiento tiene que estar BALANCEADO para llegar a esta validación
    // (ver el test de orden de validaciones más abajo).
    await expect(
      createJournalEntry(
        baseParams([
          line({ debit_amount: 100, credit_amount: 100 }),
          line({ debit_amount: 100, credit_amount: 100 }),
        ]),
        client
      )
    ).rejects.toThrow(/no puede tener Debe y Haber/i)
  })

  it("valida el balance ANTES que el Debe XOR Haber por línea", async () => {
    const { client } = createMockSupabase()
    // Una línea con Debe y Haber a la vez, pero además desbalanceada:
    // gana el mensaje de desbalance, no el de la línea.
    await expect(
      createJournalEntry(
        baseParams([
          line({ debit_amount: 100, credit_amount: 100 }),
          line({ debit_amount: null, credit_amount: 100 }),
        ]),
        client
      )
    ).rejects.toThrow(/desbalanceado/i)
  })
})

// ==================================================================
describe("createJournalEntry — camino feliz", () => {
  it("crea el asiento y un ledger_movement por línea, con la partida doble aplicada", async () => {
    const { client, calls } = createMockSupabase()

    const entry = await createJournalEntry(
      baseParams([
        line({ debit_amount: 1000, credit_amount: null, concept: "Debe" }),
        line({ debit_amount: null, credit_amount: 1000, concept: "Haber" }),
      ]),
      client
    )

    expect(entry.id).toBe("je-1")
    expect(entry.movement_ids).toEqual(["mov-1", "mov-2"])
    expect(ledger.createLedgerMovement).toHaveBeenCalledTimes(2)

    const updates = calls.filter((c) => c.table === "ledger_movements" && c.ops.includes("update"))
    expect(updates).toHaveLength(2)
    // Línea de Debe: debit_amount seteado, credit_amount en null
    expect(updates[0].payload).toMatchObject({
      journal_entry_id: "je-1",
      debit_amount: 1000,
      credit_amount: null,
    })
    // Línea de Haber: al revés
    expect(updates[1].payload).toMatchObject({
      journal_entry_id: "je-1",
      debit_amount: null,
      credit_amount: 1000,
    })
  })

  it("registra el total del asiento como la suma del Debe", async () => {
    const { client, calls } = createMockSupabase()

    await createJournalEntry(
      baseParams([
        line({ debit_amount: 600, credit_amount: null }),
        line({ debit_amount: 400, credit_amount: null }),
        line({ debit_amount: null, credit_amount: 1000 }),
      ]),
      client
    )

    const insert = calls.find((c) => c.table === "journal_entries" && c.ops.includes("insert"))
    expect(insert?.payload).toMatchObject({ total_amount: 1000, is_balanced: true })
  })

  it("convierte a ARS usando el exchange_rate cuando la moneda es USD", async () => {
    const { client } = createMockSupabase()

    await createJournalEntry(
      {
        ...baseParams([
          line({ debit_amount: 100, credit_amount: null }),
          line({ debit_amount: null, credit_amount: 100 }),
        ]),
        currency: "USD",
        exchange_rate: 1500,
      },
      client
    )

    const firstMovement = (ledger.createLedgerMovement as jest.Mock).mock.calls[0][0]
    expect(firstMovement.amount_original).toBe(100)
    expect(firstMovement.amount_ars_equivalent).toBe(150000)
    expect(firstMovement.exchange_rate).toBe(1500)
  })
})

// ==================================================================
describe("createJournalEntry — rollback manual (lo que VIB-134 reemplaza)", () => {
  it("borra los movimientos ya creados y el asiento si falla una línea posterior", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {})
    // La primera línea actualiza bien; la segunda falla.
    const { client, calls } = createMockSupabase({
      updateResults: [{ error: null }, { error: { message: "update falló" } }],
    })

    await expect(
      createJournalEntry(
        baseParams([
          line({ debit_amount: 1000, credit_amount: null }),
          line({ debit_amount: null, credit_amount: 1000 }),
        ]),
        client
      )
    ).rejects.toThrow(/update falló/)

    const deletes = calls.filter((c) => c.ops.includes("delete"))
    // 1) borra los movimientos acumulados por id, 2) los residuales por
    // journal_entry_id (defensa extra), 3) el journal_entry.
    expect(deletes).toHaveLength(3)
    expect(deletes[0].table).toBe("ledger_movements")
    expect(deletes[0].args.some(([op]) => op === "in")).toBe(true)
    expect(deletes[1].table).toBe("ledger_movements")
    expect(deletes[2].table).toBe("journal_entries")

    consoleSpy.mockRestore()
  })

  it("falla y revierte si la cuenta contable no tiene cuenta financiera vinculada", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {})
    const { client, calls } = createMockSupabase({ financialAccount: { data: null } })

    await expect(
      createJournalEntry(
        baseParams([
          line({ financial_account_id: null, debit_amount: 1000, credit_amount: null }),
          line({ financial_account_id: null, debit_amount: null, credit_amount: 1000 }),
        ]),
        client
      )
    ).rejects.toThrow(/No se encontró cuenta financiera/)

    // Revierte el journal_entry aunque no se haya creado ningún movimiento.
    const deletedEntry = calls.find(
      (c) => c.table === "journal_entries" && c.ops.includes("delete")
    )
    expect(deletedEntry).toBeDefined()

    consoleSpy.mockRestore()
  })

  it("propaga el error del INSERT del asiento sin intentar crear movimientos", async () => {
    const { client } = createMockSupabase({
      journalEntryInsert: { data: null, error: { message: "insert falló" } },
    })

    await expect(
      createJournalEntry(
        baseParams([
          line({ debit_amount: 1000, credit_amount: null }),
          line({ debit_amount: null, credit_amount: 1000 }),
        ]),
        client
      )
    ).rejects.toThrow(/Error creando asiento contable/)

    expect(ledger.createLedgerMovement).not.toHaveBeenCalled()
  })
})

// ==================================================================
describe("asientos automáticos — idempotencia", () => {
  const operation = {
    id: "op-1234567890",
    sale_amount_total: 1000,
    sale_currency: "USD",
    file_code: "OP-001",
    operation_date: "2026-01-15",
  }

  it("createSaleJournalEntry no duplica si ya existe un asiento AUTO_CONFIRMATION", async () => {
    const { client } = createMockSupabase({
      existingJournalEntry: { data: { id: "je-previo" } },
    })

    const result = await createSaleJournalEntry(operation, client)

    expect(result).toBeNull()
    expect(ledger.createLedgerMovement).not.toHaveBeenCalled()
  })

  it("createSaleJournalEntry no hace nada si la venta es cero", async () => {
    const { client, calls } = createMockSupabase()

    const result = await createSaleJournalEntry({ ...operation, sale_amount_total: 0 }, client)

    expect(result).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it("createSaleJournalEntry arma Debe CxC / Haber Ventas por el total de la venta", async () => {
    const { client, calls } = createMockSupabase({
      chartAccounts: [
        { id: "cpc-id", account_code: ACCOUNT_CODES.CUENTAS_POR_COBRAR },
        { id: "ventas-id", account_code: ACCOUNT_CODES.VENTAS },
      ],
    })

    const result = await createSaleJournalEntry(operation, client)

    expect(result).toBe("je-1")
    const updates = calls.filter((c) => c.table === "ledger_movements" && c.ops.includes("update"))
    expect(updates[0].payload).toMatchObject({ chart_account_id: "cpc-id", debit_amount: 1000 })
    expect(updates[1].payload).toMatchObject({ chart_account_id: "ventas-id", credit_amount: 1000 })
  })

  it("createSaleJournalEntry devuelve null (sin romper el flujo) si faltan las cuentas del plan", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {})
    const { client } = createMockSupabase({ chartAccounts: [] })

    const result = await createSaleJournalEntry(operation, client)

    expect(result).toBeNull()
    consoleSpy.mockRestore()
  })

  it("createCostJournalEntry se apoya en un ILIKE 'Costo%' para no duplicar (chequeo frágil, ver VIB-134/B3)", async () => {
    const { client, calls } = createMockSupabase({
      existingJournalEntry: { data: { id: "je-costo-previo" } },
    })

    const result = await createCostJournalEntry(
      { id: "op-1234567890", operator_cost: 500, file_code: "OP-001" },
      [{ operator_id: "operador-1", cost: 500, product_type: "HOTEL" }],
      client
    )

    expect(result).toBeNull()
    // La idempotencia del costo depende de la DESCRIPCIÓN, no de una clave:
    // comparte `source` con el asiento de venta y por eso filtra por texto.
    const check = calls.find((c) => c.table === "journal_entries" && c.ops.includes("ilike"))
    expect(check).toBeDefined()
    expect(check?.args.find(([op]) => op === "ilike")).toEqual(["ilike", "description", "Costo%"])
  })

  it("createCostJournalEntry no hace nada si no hay costo de operador", async () => {
    const { client, calls } = createMockSupabase()

    const result = await createCostJournalEntry(
      { id: "op-1234567890", operator_cost: 0 },
      [],
      client
    )

    expect(result).toBeNull()
    expect(calls).toHaveLength(0)
  })
})
