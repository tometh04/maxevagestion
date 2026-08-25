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
import * as exchangeRates from "../exchange-rates"

jest.mock("../ledger", () => ({
  createLedgerMovement: jest.fn(),
}))

jest.mock("../exchange-rates", () => ({
  getExchangeRateWithFallback: jest.fn(),
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
  /** Filas de operators con cuenta de costo propia (VIB-144/I2) */
  operatorsWithOverride?: any[]
  /** Resultado de la búsqueda de financial_account (.maybeSingle()) */
  financialAccount?: QueryResult
  /** Resultados del UPDATE de partida doble, consumidos en orden */
  updateResults?: QueryResult[]
  /**
   * Respuesta de la RPC create_journal_entry_atomic (VIB-134/B1-B2).
   *
   * Por defecto simula que la función NO existe (PGRST202), que es la ventana
   * de deploy: así los tests de más abajo siguen ejercitando el camino JS con
   * su rollback manual, que es justamente lo que fijan.
   */
  atomicRpc?: QueryResult
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

    for (const m of ["select", "eq", "in", "ilike", "limit", "order", "neq", "is", "not", "gte", "lte"]) {
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
      if (state.table === "operators") {
        return { data: cfg.operatorsWithOverride ?? [], error: null }
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

  const rpc = jest.fn(async (_fn: string, _args: any) =>
    cfg.atomicRpc ?? { data: null, error: { code: "PGRST202", message: "function not found" } }
  )

  return { client: { from, rpc } as any, calls, from, rpc }
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
  ;(exchangeRates.getExchangeRateWithFallback as jest.Mock).mockResolvedValue({
    rate: 1300,
    source: "exact",
  })
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

  it("NO falla si la cuenta contable no tiene cuenta financiera: deja account_id nulo (VIB-134/B0)", async () => {
    const { client } = createMockSupabase({ financialAccount: { data: null } })

    // Antes esto lanzaba "No se encontró cuenta financiera" y mataba el asiento
    // entero. Era la razón por la que nunca se generó un asiento de venta:
    // "Ventas de Viajes" es una cuenta de resultado y no tiene caja detrás.
    const entry = await createJournalEntry(
      baseParams([
        line({ financial_account_id: null, debit_amount: 1000, credit_amount: null }),
        line({ financial_account_id: null, debit_amount: null, credit_amount: 1000 }),
      ]),
      client
    )

    expect(entry.movement_ids).toHaveLength(2)
    for (const call of (ledger.createLedgerMovement as jest.Mock).mock.calls) {
      expect(call[0].account_id).toBeNull()
    }
  })

  it("las líneas de asiento no impactan el saldo de cuentas financieras (VIB-134/B0)", async () => {
    const { client } = createMockSupabase()

    await createJournalEntry(
      baseParams([
        line({ debit_amount: 1000, credit_amount: null }),
        line({ debit_amount: null, credit_amount: 1000 }),
      ]),
      client
    )

    // Un asiento es contabilidad, no movimiento de dinero: si afectara el saldo
    // duplicaría la plata que ya movió el cobro o el pago correspondiente.
    for (const call of (ledger.createLedgerMovement as jest.Mock).mock.calls) {
      expect(call[0].affects_balance).toBe(false)
    }
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

  it("resuelve el plan de cuentas SCOPEADO por organización (VIB-145)", async () => {
    const { client, calls } = createMockSupabase({
      chartAccounts: [
        { id: "cpc-id", account_code: ACCOUNT_CODES.CUENTAS_POR_COBRAR },
        { id: "ventas-id", account_code: ACCOUNT_CODES.VENTAS },
      ],
    })

    await createSaleJournalEntry({ ...operation, org_id: "org-123" } as any, client)

    // El plan de cuentas es por org: sin este filtro, con los mismos códigos en
    // todas las organizaciones la resolución sería ambigua y podría cruzar
    // tenants si el caller usara un admin client.
    const chartQuery = calls.find((c) => c.table === "chart_of_accounts")
    expect(chartQuery).toBeDefined()
    expect(chartQuery?.args).toContainEqual(["eq", "org_id", "org-123"])
  })

  it("createSaleJournalEntry devuelve null (sin romper el flujo) si faltan las cuentas del plan", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {})
    const { client } = createMockSupabase({ chartAccounts: [] })

    const result = await createSaleJournalEntry(operation, client)

    expect(result).toBeNull()
    consoleSpy.mockRestore()
  })

  it("createCostJournalEntry se saltea por CLASE, no por la descripción (VIB-134/B3)", async () => {
    // Antes esto se resolvía con `ILIKE 'Costo%'` sobre la descripción, porque
    // venta y costo comparten source. Un asiento manual que empezara con
    // "Costo" bloqueaba al automático, y cambiar la redacción lo duplicaba.
    const { client, calls } = createMockSupabase({
      chartAccounts: [
        { id: "costo-id", account_code: ACCOUNT_CODES.COSTO_OPERADORES },
        { id: "cpp-id", account_code: ACCOUNT_CODES.CUENTAS_POR_PAGAR },
      ],
      existingJournalEntry: { data: { id: "je-costo-previo" } },
    })

    const result = await createCostJournalEntry(
      operation,
      [{ operator_id: "op-1", cost: 700, operators: { id: "op-1", name: "Delfos" } }] as any,
      client
    )

    expect(result).toBeNull()
    expect(ledger.createLedgerMovement).not.toHaveBeenCalled()

    // El chequeo filtra por entry_kind y ya no mira la descripción.
    const lookup = calls.find((c) => c.table === "journal_entries" && c.ops.includes("eq"))
    const filtros = (lookup?.args ?? []).filter((a) => a[0] === "eq").map((a) => a[1])
    expect(filtros).toContain("entry_kind")
    expect(lookup?.ops).not.toContain("ilike")
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

// ==================================================================
// VIB-134/B0 — Tipo de cambio de las líneas en USD
//
// `createLedgerMovement` (el de verdad) rechaza todo movimiento USD sin
// `exchange_rate`. Los asientos automáticos no lo pasaban, así que en una
// operación vendida en dólares el asiento moría en su PRIMERA línea, el
// rollback borraba el journal_entry y el caller se tragaba el error: cero
// asientos y cero rastro.
//
// Estos tests no se cayeron antes porque `createLedgerMovement` está mockeado
// y el mock no tiene esa precondición. Por eso acá se afirma explícitamente
// sobre el `exchange_rate` que recibe: es el contrato que el mock no valida.
// ==================================================================
describe("createJournalEntry — tipo de cambio en asientos USD", () => {
  const usdParams = (over: Record<string, any> = {}) => ({
    ...baseParams([
      line({ debit_amount: 100, credit_amount: null }),
      line({ debit_amount: null, credit_amount: 100 }),
    ]),
    currency: "USD" as const,
    ...over,
  })

  it("resuelve el TC de valuación cuando el caller no lo pasa", async () => {
    const { client } = createMockSupabase()

    await createJournalEntry(usdParams(), client)

    expect(exchangeRates.getExchangeRateWithFallback).toHaveBeenCalledWith(
      client,
      "2026-01-15",
      "journal-entry:MANUAL"
    )
    // Ninguna línea puede llegar sin TC: es lo que hacía fallar el asiento.
    for (const call of (ledger.createLedgerMovement as jest.Mock).mock.calls) {
      expect(call[0].exchange_rate).toBe(1300)
      expect(call[0].amount_ars_equivalent).toBe(100 * 1300)
    }
  })

  it("respeta el TC explícito del caller y no consulta la valuación", async () => {
    const { client } = createMockSupabase()

    await createJournalEntry(usdParams({ exchange_rate: 1500 }), client)

    expect(exchangeRates.getExchangeRateWithFallback).not.toHaveBeenCalled()
    for (const call of (ledger.createLedgerMovement as jest.Mock).mock.calls) {
      expect(call[0].exchange_rate).toBe(1500)
      expect(call[0].amount_ars_equivalent).toBe(100 * 1500)
    }
  })

  it("no consulta el TC para asientos en ARS", async () => {
    const { client } = createMockSupabase()

    await createJournalEntry(
      baseParams([
        line({ debit_amount: 100, credit_amount: null }),
        line({ debit_amount: null, credit_amount: 100 }),
      ]),
      client
    )

    expect(exchangeRates.getExchangeRateWithFallback).not.toHaveBeenCalled()
    for (const call of (ledger.createLedgerMovement as jest.Mock).mock.calls) {
      expect(call[0].exchange_rate).toBeNull()
      expect(call[0].amount_ars_equivalent).toBe(100)
    }
  })

  it("el asiento de venta de una operación en USD llega con TC en todas sus líneas", async () => {
    const { client } = createMockSupabase({
      chartAccounts: [
        { id: "cpc-id", account_code: ACCOUNT_CODES.CUENTAS_POR_COBRAR },
        { id: "ventas-id", account_code: ACCOUNT_CODES.VENTAS },
      ],
    })

    const result = await createSaleJournalEntry(
      {
        id: "op-1234567890",
        sale_amount_total: 1000,
        sale_currency: "USD",
        file_code: "OP-001",
        operation_date: "2026-01-15",
      },
      client
    )

    expect(result).toBe("je-1")
    expect(ledger.createLedgerMovement).toHaveBeenCalledTimes(2)
    for (const call of (ledger.createLedgerMovement as jest.Mock).mock.calls) {
      expect(call[0].currency).toBe("USD")
      expect(call[0].exchange_rate).toBe(1300)
    }
  })
})

// ==================================================================
// org_id explícito — procesos sin sesión (backfills, crons)
//
// El trigger `auto_set_org_id_from_auth` resuelve el org desde `auth.uid()`.
// Con service role no hay sesión, así que lo dejaría en NULL — y como el
// service role no pasa por RLS, el asiento entraría igual, huérfano de tenant.
// ==================================================================
describe("createJournalEntry — org_id explícito", () => {
  const dosLineas = () => [
    line({ debit_amount: 100, credit_amount: null }),
    line({ debit_amount: null, credit_amount: 100 }),
  ]

  it("graba el org_id que le pasan, en el asiento y en sus líneas", async () => {
    const { client, calls } = createMockSupabase()

    await createJournalEntry({ ...baseParams(dosLineas()), org_id: "org-42" }, client)

    const insert = calls.find((c) => c.table === "journal_entries" && c.ops.includes("insert"))
    expect(insert?.payload).toMatchObject({ org_id: "org-42" })
    for (const call of (ledger.createLedgerMovement as jest.Mock).mock.calls) {
      expect(call[0].org_id).toBe("org-42")
    }
  })

  it("sin org_id lo deja en null para que actúe el trigger de la sesión", async () => {
    const { client, calls } = createMockSupabase()

    await createJournalEntry(baseParams(dosLineas()), client)

    const insert = calls.find((c) => c.table === "journal_entries" && c.ops.includes("insert"))
    expect(insert?.payload.org_id).toBeNull()
  })

  it("el asiento de venta hereda el org de la operación y su TC explícito", async () => {
    const { client, calls } = createMockSupabase({
      chartAccounts: [
        { id: "cpc-id", account_code: ACCOUNT_CODES.CUENTAS_POR_COBRAR },
        { id: "ventas-id", account_code: ACCOUNT_CODES.VENTAS },
      ],
    })

    await createSaleJournalEntry(
      {
        id: "op-1234567890",
        org_id: "org-42",
        sale_amount_total: 1000,
        sale_currency: "USD",
        file_code: "OP-001",
        operation_date: "2024-03-25",
        // TC real de la operación: sin esto se valuaría al dólar de hoy una
        // operación de 2024.
        exchange_rate: 900,
      } as any,
      client
    )

    const insert = calls.find((c) => c.table === "journal_entries" && c.ops.includes("insert"))
    expect(insert?.payload).toMatchObject({ org_id: "org-42" })
    expect(exchangeRates.getExchangeRateWithFallback).not.toHaveBeenCalled()
    for (const call of (ledger.createLedgerMovement as jest.Mock).mock.calls) {
      expect(call[0].exchange_rate).toBe(900)
      expect(call[0].amount_ars_equivalent).toBe(1000 * 900)
    }
  })
})

// ==================================================================
// VIB-134/B1-B2 — Asiento atómico
//
// El camino viejo hace N+1 escrituras sueltas y compensa con un rollback
// manual en JS. Si ese rollback falla, queda un asiento DESBALANCEADO: peor
// que ninguno, porque descuadra el mayor en silencio. Ahora la base lo hace
// todo en una transacción.
// ==================================================================
describe("createJournalEntry — transacción en la base", () => {
  const dosLineas = () => [
    line({ debit_amount: 100, credit_amount: null }),
    line({ debit_amount: null, credit_amount: 100 }),
  ]

  const respuestaOk = {
    data: {
      id: "je-atomic",
      entry_number: 77,
      entry_date: "2026-01-15",
      description: "Asiento de prueba",
      source: "MANUAL",
      total_amount: 100,
      currency: "ARS",
      movement_ids: ["mov-a", "mov-b"],
    },
    error: null,
  }

  it("usa la RPC y no escribe nada suelto", async () => {
    const { client, calls, rpc } = createMockSupabase({ atomicRpc: respuestaOk })

    const entry = await createJournalEntry(baseParams(dosLineas()), client)

    expect(rpc).toHaveBeenCalledWith("create_journal_entry_atomic", expect.anything())
    expect(entry.id).toBe("je-atomic")
    expect(entry.movement_ids).toEqual(["mov-a", "mov-b"])
    // Nada de INSERT/UPDATE por fuera de la transacción.
    expect(calls).toHaveLength(0)
    expect(ledger.createLedgerMovement).not.toHaveBeenCalled()
  })

  it("le pasa a la base el contexto completo del asiento", async () => {
    const { client, rpc } = createMockSupabase({ atomicRpc: respuestaOk })

    await createJournalEntry(
      {
        ...baseParams(dosLineas()),
        org_id: "org-1",
        entry_kind: "SALE",
        source_movement_id: "mov-origen",
        operation_id: "op-1",
      },
      client
    )

    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_org_id: "org-1",
      p_entry_kind: "SALE",
      p_source_movement_id: "mov-origen",
      p_operation_id: "op-1",
      p_total_amount: 100,
    })
  })

  it("cae al camino viejo SOLO si la función todavía no existe", async () => {
    // Ventana de deploy: el código sale antes que la migración.
    const { client } = createMockSupabase()

    const entry = await createJournalEntry(baseParams(dosLineas()), client)

    expect(entry.id).toBe("je-1")
    expect(ledger.createLedgerMovement).toHaveBeenCalledTimes(2)
  })

  it("propaga cualquier otro error en vez de taparlo con el fallback", async () => {
    // Un error real no debe disfrazarse de "función no disponible": si la base
    // rechaza el asiento, hay que enterarse.
    const { client } = createMockSupabase({
      atomicRpc: { data: null, error: { code: "23505", message: "duplicate key" } },
    })

    await expect(createJournalEntry(baseParams(dosLineas()), client)).rejects.toThrow(
      /duplicate key/
    )
    expect(ledger.createLedgerMovement).not.toHaveBeenCalled()
  })
})

// ==================================================================
// VIB-144/I2 — Cuenta de costo propia por operador
//
// El criterio que manda es el del documento: un operador SIN la config nueva
// se tiene que comportar idéntico. El override solo cambia asientos futuros de
// los operadores que alguien configure a mano.
// ==================================================================
describe("createCostJournalEntry — cuenta de costo por operador", () => {
  const operation = {
    id: "op-1234567890",
    org_id: "org-1",
    sale_amount_total: 1000,
    sale_currency: "USD",
    file_code: "OP-001",
    operation_date: "2026-08-25",
    exchange_rate: 1500,
  }

  const patas = [
    { operator_id: "op-hotel", cost: 700, product_type: "HOTEL", operators: { id: "op-hotel", name: "Delfos" } },
  ]

  const plan = [
    { id: "cpp-id", account_code: ACCOUNT_CODES.CUENTAS_POR_PAGAR },
    { id: "costo-hoteleria", account_code: ACCOUNT_CODES.COSTO_HOTELERIA },
  ]

  it("sin config, imputa por tipo de producto igual que siempre", async () => {
    const { client, calls } = createMockSupabase({ chartAccounts: plan })

    await createCostJournalEntry(operation as any, patas as any, client)

    expect(cuentasDeLasLineas(calls)).toContain("costo-hoteleria")
  })

  it("con cuenta propia, imputa el costo ahí", async () => {
    const { client, calls } = createMockSupabase({
      chartAccounts: plan,
      operatorsWithOverride: [
        {
          id: "op-hotel",
          cost_chart_account_id: "cuenta-asistencia",
          chart_of_accounts: { id: "cuenta-asistencia", org_id: "org-1" },
        },
      ],
    })

    await createCostJournalEntry(operation as any, patas as any, client)

    const cuentas = cuentasDeLasLineas(calls)
    expect(cuentas).toContain("cuenta-asistencia")
    expect(cuentas).not.toContain("costo-hoteleria")
  })

  it("ignora una cuenta de OTRA organización y cae al default", async () => {
    // Un dato mal cargado no puede imputar el costo al plan de otra agencia.
    const { client, calls } = createMockSupabase({
      chartAccounts: plan,
      operatorsWithOverride: [
        {
          id: "op-hotel",
          cost_chart_account_id: "cuenta-ajena",
          chart_of_accounts: { id: "cuenta-ajena", org_id: "OTRA-ORG" },
        },
      ],
    })

    await createCostJournalEntry(operation as any, patas as any, client)

    const cuentas = cuentasDeLasLineas(calls)
    expect(cuentas).toContain("costo-hoteleria")
    expect(cuentas).not.toContain("cuenta-ajena")
  })
})

/**
 * Cuentas contables que quedaron en las líneas del asiento.
 *
 * La cuenta NO viaja en createLedgerMovement: se escribe en el UPDATE de
 * partida doble que viene después, así que hay que leerla de ahí.
 */
function cuentasDeLasLineas(calls: any[]): string[] {
  return calls
    .filter((c) => c.table === "ledger_movements" && c.ops.includes("update"))
    .map((c) => c.payload?.chart_account_id)
}
