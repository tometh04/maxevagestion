/**
 * INVARIANTES DE LA ETAPA CONTABLE (VIB-134)
 *
 * Hasta agosto 2026 el motor de asientos nunca había generado un asiento de
 * venta, costo ni comisión: `createJournalEntry` exigía una cuenta financiera
 * por línea y moría contra "Ventas de Viajes", que es una cuenta de resultado.
 * Al habilitarlo (B0) se activó por primera vez un camino que nadie había
 * ejecutado, y aparecieron efectos colaterales en código que asumía que
 * "movimiento de tipo X" equivalía a "movió plata".
 *
 * Esta suite fija el contrato que separa CONTABILIDAD de TESORERÍA:
 *
 *   Un movimiento de dinero SIEMPRE tiene cuenta financiera (`account_id`).
 *   Una línea de asiento contable NUNCA la tiene.
 *
 * Ese discriminador es el que usan hoy los reportes de resultado, el marcado de
 * comisiones pagadas y la reversión de comisiones para no confundir un
 * devengamiento con un pago. Si alguien lo rompe, se rompe en silencio: los
 * síntomas son comisiones pagadas que nadie pagó y gastos duplicados.
 */

import {
  createJournalEntry,
  createSaleJournalEntry,
  type JournalEntryLine,
} from "../journal-entries"
import { ACCOUNT_CODES } from "../account-codes"
import * as ledger from "../ledger"

jest.mock("../ledger", () => ({
  createLedgerMovement: jest.fn(),
}))

// ------------------------------------------------------------------
// Mock mínimo de Supabase (mismo enfoque que journal-entries.test.ts)
// ------------------------------------------------------------------
function createMockSupabase(chartAccounts: any[] = []) {
  const calls: Array<{ table: string; ops: string[]; payload?: any }> = []

  const from = jest.fn((table: string) => {
    const state = { table, ops: [] as string[], payload: undefined as any }
    calls.push(state)
    const chain: any = {}
    for (const m of ["select", "eq", "in", "ilike", "limit", "order", "not", "is"]) {
      chain[m] = jest.fn(() => {
        state.ops.push(m)
        return chain
      })
    }
    chain.insert = jest.fn((p: any) => {
      state.ops.push("insert")
      state.payload = p
      return chain
    })
    chain.update = jest.fn((p: any) => {
      state.ops.push("update")
      state.payload = p
      return chain
    })
    chain.delete = jest.fn(() => {
      state.ops.push("delete")
      return chain
    })
    chain.single = jest.fn(async () =>
      state.ops.includes("insert")
        ? {
            data: {
              id: "je-1",
              entry_number: 1,
              entry_date: "2026-01-15",
              description: "x",
              source: "MANUAL",
              total_amount: 0,
              currency: "ARS",
            },
            error: null,
          }
        : { data: null, error: null }
    )
    chain.maybeSingle = jest.fn(async () => ({ data: null }))
    chain.then = (ok: any, err: any) =>
      Promise.resolve(
        state.table === "chart_of_accounts"
          ? { data: chartAccounts, error: null }
          : { data: null, error: null }
      ).then(ok, err)
    return chain
  })

  // La RPC atómica (VIB-134/B1-B2) se simula ausente a propósito: estos tests
  // fijan los invariantes del camino JS, que sigue vivo como fallback de la
  // ventana de deploy. La transacción tiene su propio suite.
  const rpc = jest.fn(async () => ({
    data: null,
    error: { code: "PGRST202", message: "function not found" },
  }))

  return { client: { from, rpc } as any, calls }
}

const line = (over: Partial<JournalEntryLine> = {}): JournalEntryLine => ({
  chart_account_id: "chart-1",
  debit_amount: 100,
  ...over,
})

beforeEach(() => {
  jest.clearAllMocks()
  let n = 0
  ;(ledger.createLedgerMovement as jest.Mock).mockImplementation(async () => ({
    id: `mov-${++n}`,
  }))
})

// ==================================================================
describe("Invariante: una línea de asiento no es un movimiento de dinero", () => {
  it("nace SIN cuenta financiera", async () => {
    const { client } = createMockSupabase()

    await createJournalEntry(
      {
        entry_date: "2026-01-15",
        description: "Asiento",
        source: "MANUAL",
        lines: [
          line({ debit_amount: 1000 }),
          line({ debit_amount: null, credit_amount: 1000 }),
        ],
      },
      client
    )

    // Sin cuenta financiera, ninguna pantalla que sume por `account_id` puede
    // recogerla: ni saldos, ni caja, ni validación de saldo suficiente.
    for (const call of (ledger.createLedgerMovement as jest.Mock).mock.calls) {
      expect(call[0].account_id).toBeNull()
    }
  })

  it("nace SIN afectar el saldo", async () => {
    const { client } = createMockSupabase()

    await createJournalEntry(
      {
        entry_date: "2026-01-15",
        description: "Asiento",
        source: "MANUAL",
        lines: [
          line({ debit_amount: 1000 }),
          line({ debit_amount: null, credit_amount: 1000 }),
        ],
      },
      client
    )

    // Doble protección: aunque alguien le asignara cuenta, no debería mover
    // saldo. La plata ya la movió el cobro o el pago correspondiente.
    for (const call of (ledger.createLedgerMovement as jest.Mock).mock.calls) {
      expect(call[0].affects_balance).toBe(false)
    }
  })

  it("no se cae cuando la cuenta contable no tiene cuenta financiera", async () => {
    // Es el caso de TODA cuenta de resultado. Que esto lanzara excepción es lo
    // que mantuvo el motor de asientos inutilizado hasta agosto de 2026.
    const { client } = createMockSupabase()

    const entry = await createJournalEntry(
      {
        entry_date: "2026-01-15",
        description: "Venta",
        source: "AUTO_CONFIRMATION",
        lines: [
          line({ chart_account_id: "cuenta-de-resultado", debit_amount: 1000 }),
          line({ chart_account_id: "otra", debit_amount: null, credit_amount: 1000 }),
        ],
      },
      client
    )

    expect(entry.movement_ids).toHaveLength(2)
  })
})

// ==================================================================
describe("Invariante: el asiento se resuelve dentro de su organización", () => {
  it("filtra el plan de cuentas por org", async () => {
    const { client, calls } = createMockSupabase([
      { id: "cpc", account_code: ACCOUNT_CODES.CUENTAS_POR_COBRAR },
      { id: "ventas", account_code: ACCOUNT_CODES.VENTAS },
    ])

    await createSaleJournalEntry(
      {
        id: "op-1",
        org_id: "org-42",
        sale_amount_total: 1000,
        sale_currency: "USD",
      } as any,
      client
    )

    // Cada agencia tiene su propio plan con los mismos códigos: sin filtro por
    // org la resolución es ambigua y puede cruzar tenants.
    const chart = calls.find((c) => c.table === "chart_of_accounts")
    expect(chart).toBeDefined()
    expect(chart!.ops).toContain("eq")
  })
})

// ==================================================================
describe("Invariante: el asiento no dispara efectos de tesorería", () => {
  it("una línea de comisión sin cuenta NO marca la comisión como pagada", async () => {
    // El asiento de comisión se crea al CONFIRMAR la operación. Si marcara la
    // comisión como pagada, el vendedor figuraría cobrado sin haber cobrado.
    // El guard vive en createLedgerMovement (ver ledger-commission-paid.test.ts);
    // acá se fija que el asiento efectivamente genera líneas sin cuenta, que es
    // la condición de la que depende ese guard.
    const { client } = createMockSupabase()

    await createJournalEntry(
      {
        entry_date: "2026-01-15",
        description: "Comisiones OP-001",
        source: "AUTO_COMMISSION",
        operation_id: "op-1",
        lines: [
          line({ debit_amount: 500, legacy_type: "COMMISSION" }),
          line({
            debit_amount: null,
            credit_amount: 500,
            legacy_type: "COMMISSION",
            seller_id: "seller-1",
          }),
        ],
      },
      client
    )

    const conComision = (ledger.createLedgerMovement as jest.Mock).mock.calls.filter(
      (c) => c[0].type === "COMMISSION"
    )
    expect(conComision.length).toBeGreaterThan(0)
    for (const call of conComision) {
      expect(call[0].account_id).toBeNull()
    }
  })
})

// ==================================================================
describe("Invariante: validaciones antes de tocar la base", () => {
  it("un asiento desbalanceado no escribe nada", async () => {
    const { client, calls } = createMockSupabase()

    await expect(
      createJournalEntry(
        {
          entry_date: "2026-01-15",
          description: "Roto",
          source: "MANUAL",
          lines: [
            line({ debit_amount: 1000 }),
            line({ debit_amount: null, credit_amount: 900 }),
          ],
        },
        client
      )
    ).rejects.toThrow(/desbalanceado/i)

    expect(calls).toHaveLength(0)
    expect(ledger.createLedgerMovement).not.toHaveBeenCalled()
  })

  it("un asiento de una sola línea no escribe nada", async () => {
    const { client, calls } = createMockSupabase()

    await expect(
      createJournalEntry(
        {
          entry_date: "2026-01-15",
          description: "Roto",
          source: "MANUAL",
          lines: [line({ debit_amount: 1000 })],
        },
        client
      )
    ).rejects.toThrow(/al menos 2 líneas/)

    expect(calls).toHaveLength(0)
  })
})
