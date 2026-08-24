/**
 * VIB-142 — Asientos de los movimientos de plata.
 *
 * Lo que fijan estos tests es sobre todo lo que NO tiene que pasar: que asentar
 * un cobro o un pago no toque el movimiento original ni el saldo de ninguna
 * cuenta. Esa es la condición que hace que esto se pueda correr sobre datos de
 * clientes en producción.
 */
import {
  createMovementJournalEntry,
  COUNTERPART_CODES,
} from "../movement-journal"
import { ACCOUNT_CODES } from "../account-codes"
import * as journal from "../journal-entries"

jest.mock("../journal-entries", () => ({
  createJournalEntry: jest.fn(),
  resolveAccountIds: jest.fn(),
}))

interface MockConfig {
  /** Fila de ledger_movements devuelta (null = no existe) */
  movement?: any
  /** Fila de financial_accounts devuelta */
  financialAccount?: any
  /** Códigos resueltos del plan */
  accountIds?: Record<string, string>
}

const MOVIMIENTO_BASE = {
  id: "mov-1",
  org_id: "org-1",
  operation_id: "op-1",
  account_id: "fa-banco",
  concept: "Cobro cliente",
  currency: "USD",
  amount_original: 500,
  exchange_rate: 1400,
  movement_date: "2026-08-24T00:00:00.000Z",
  created_by: "user-1",
  journal_entry_id: null,
}

function createMockSupabase(cfg: MockConfig = {}) {
  const updates: any[] = []

  const from = jest.fn((table: string) => {
    const chain: any = {}
    for (const m of ["select", "eq"]) chain[m] = jest.fn(() => chain)
    chain.update = jest.fn((payload: any) => {
      updates.push({ table, payload })
      return chain
    })
    chain.insert = jest.fn(() => chain)
    chain.maybeSingle = jest.fn(async () => {
      if (table === "ledger_movements") {
        return { data: cfg.movement === undefined ? MOVIMIENTO_BASE : cfg.movement }
      }
      if (table === "financial_accounts") {
        return {
          data:
            cfg.financialAccount === undefined
              ? { chart_account_id: "chart-banco" }
              : cfg.financialAccount,
        }
      }
      return { data: null }
    })
    chain.then = (ok: any, err: any) => Promise.resolve({ data: null, error: null }).then(ok, err)
    return chain
  })

  return { client: { from } as any, updates }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(journal.createJournalEntry as jest.Mock).mockResolvedValue({ id: "je-1" })
  ;(journal.resolveAccountIds as jest.Mock).mockImplementation(async (codes: string[]) =>
    Object.fromEntries(codes.map((c) => [c, `chart-${c}`]))
  )
})

describe("createMovementJournalEntry — no toca la plata", () => {
  it("NO escribe sobre el movimiento original", async () => {
    // Es el punto entero del diseño: getAccountBalancesBatch calcula el saldo
    // por una rama distinta según si el movimiento tiene debit/credit seteados,
    // así que escribirle encima puede mover el saldo de una cuenta real.
    const { client, updates } = createMockSupabase()

    await createMovementJournalEntry(
      { movementId: "mov-1", counterpartCode: COUNTERPART_CODES.CUSTOMER_COLLECTION, direction: "IN" },
      client
    )

    expect(updates).toHaveLength(0)
  })

  it("las líneas del asiento no llevan cuenta financiera ni afectan saldo", async () => {
    const { client } = createMockSupabase()

    await createMovementJournalEntry(
      { movementId: "mov-1", counterpartCode: COUNTERPART_CODES.CUSTOMER_COLLECTION, direction: "IN" },
      client
    )

    const params = (journal.createJournalEntry as jest.Mock).mock.calls[0][0]
    for (const linea of params.lines) {
      expect(linea.financial_account_id).toBeUndefined()
      expect(linea.affects_balance).toBeUndefined()
    }
  })
})

describe("createMovementJournalEntry — sentido del asiento", () => {
  it("un cobro deja Debe en la cuenta financiera y Haber en Cuentas por Cobrar", async () => {
    const { client } = createMockSupabase()

    await createMovementJournalEntry(
      { movementId: "mov-1", counterpartCode: COUNTERPART_CODES.CUSTOMER_COLLECTION, direction: "IN" },
      client
    )

    const [debe, haber] = (journal.createJournalEntry as jest.Mock).mock.calls[0][0].lines
    expect(debe).toMatchObject({ chart_account_id: "chart-banco", debit_amount: 500 })
    expect(haber).toMatchObject({
      chart_account_id: `chart-${ACCOUNT_CODES.CUENTAS_POR_COBRAR}`,
      credit_amount: 500,
    })
  })

  it("un pago a operador deja Debe en Cuentas por Pagar y Haber en la cuenta financiera", async () => {
    const { client } = createMockSupabase()

    await createMovementJournalEntry(
      { movementId: "mov-1", counterpartCode: COUNTERPART_CODES.OPERATOR_PAYMENT, direction: "OUT" },
      client
    )

    const [debe, haber] = (journal.createJournalEntry as jest.Mock).mock.calls[0][0].lines
    expect(debe).toMatchObject({
      chart_account_id: `chart-${ACCOUNT_CODES.CUENTAS_POR_PAGAR}`,
      debit_amount: 500,
    })
    expect(haber).toMatchObject({ chart_account_id: "chart-banco", credit_amount: 500 })
  })

  it("todos los gastos van por ahora a Gastos Administrativos", () => {
    expect(COUNTERPART_CODES.EXPENSE).toBe(ACCOUNT_CODES.GASTOS_ADMIN)
  })
})

describe("createMovementJournalEntry — idempotencia y contexto", () => {
  it("no asienta dos veces el mismo movimiento", async () => {
    const { client } = createMockSupabase({
      movement: { ...MOVIMIENTO_BASE, journal_entry_id: "je-previo" },
    })

    const r = await createMovementJournalEntry(
      { movementId: "mov-1", counterpartCode: COUNTERPART_CODES.CUSTOMER_COLLECTION, direction: "IN" },
      client
    )

    expect(r).toBeNull()
    expect(journal.createJournalEntry).not.toHaveBeenCalled()
  })

  it("se traga la carrera perdida contra otro request (unique violation)", async () => {
    const { client } = createMockSupabase()
    ;(journal.createJournalEntry as jest.Mock).mockRejectedValue({
      code: "23505",
      message: 'duplicate key value violates unique constraint "journal_entries_source_movement_unique"',
    })

    const r = await createMovementJournalEntry(
      { movementId: "mov-1", counterpartCode: COUNTERPART_CODES.CUSTOMER_COLLECTION, direction: "IN" },
      client
    )

    expect(r).toBeNull()
  })

  it("manda el org y el movimiento de origen, y respeta el TC real del movimiento", async () => {
    const { client } = createMockSupabase()

    await createMovementJournalEntry(
      { movementId: "mov-1", counterpartCode: COUNTERPART_CODES.CUSTOMER_COLLECTION, direction: "IN" },
      client
    )

    expect((journal.createJournalEntry as jest.Mock).mock.calls[0][0]).toMatchObject({
      org_id: "org-1",
      source_movement_id: "mov-1",
      exchange_rate: 1400,
      currency: "USD",
      entry_date: "2026-08-24",
    })
  })

  it("resuelve la cuenta del plan SCOPEADA por organización", async () => {
    const { client } = createMockSupabase()

    await createMovementJournalEntry(
      { movementId: "mov-1", counterpartCode: COUNTERPART_CODES.CUSTOMER_COLLECTION, direction: "IN", orgId: "org-9" },
      client
    )

    expect(journal.resolveAccountIds).toHaveBeenCalledWith(
      [ACCOUNT_CODES.CUENTAS_POR_COBRAR],
      client,
      "org-9"
    )
  })
})

describe("createMovementJournalEntry — casos que se saltean sin romper", () => {
  const casos: [string, MockConfig][] = [
    ["el movimiento no existe", { movement: null }],
    ["el movimiento no tiene cuenta financiera", { movement: { ...MOVIMIENTO_BASE, account_id: null } }],
    ["el importe es cero", { movement: { ...MOVIMIENTO_BASE, amount_original: 0 } }],
    ["la cuenta financiera no está mapeada al plan", { financialAccount: { chart_account_id: null } }],
  ]

  it.each(casos)("devuelve null si %s", async (_caso, cfg) => {
    const { client, updates } = createMockSupabase(cfg)

    const r = await createMovementJournalEntry(
      { movementId: "mov-1", counterpartCode: COUNTERPART_CODES.CUSTOMER_COLLECTION, direction: "IN" },
      client
    )

    expect(r).toBeNull()
    expect(journal.createJournalEntry).not.toHaveBeenCalled()
    expect(updates).toHaveLength(0)
  })

  it("devuelve null si falta la cuenta del plan, sin lanzar", async () => {
    const { client } = createMockSupabase()
    ;(journal.resolveAccountIds as jest.Mock).mockResolvedValue({})

    const r = await createMovementJournalEntry(
      { movementId: "mov-1", counterpartCode: COUNTERPART_CODES.CUSTOMER_COLLECTION, direction: "IN" },
      client
    )

    expect(r).toBeNull()
    expect(journal.createJournalEntry).not.toHaveBeenCalled()
  })
})
