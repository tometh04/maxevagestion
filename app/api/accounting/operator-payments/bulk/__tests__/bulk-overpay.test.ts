/**
 * @jest-environment node
 *
 * Pago masivo a operadores — la plata no sale si la deuda no se puede aplicar.
 *
 * El 2026-09-04 Lozada pagó tres deudas de Eurovips por un importe mayor al
 * cargado: el egreso se asentó, el UPDATE de la deuda rebotó contra el CHECK
 * `paid_amount <= amount * 1.01` y el item se salteó. Resultado: USD 4.914,36
 * fuera de la caja, las deudas intactas y ningún pago en la operación.
 *
 * Lo que se fija acá es el orden y el criterio: primero se aplica la deuda,
 * recién después se mueve la plata, y un sobrepago fuera de tolerancia se
 * rechaza antes de tocar la cuenta.
 */

import { POST } from "@/app/api/accounting/operator-payments/bulk/route"
import { createLedgerMovement } from "@/lib/accounting/ledger"

let mockSupabase: any

jest.mock("@/lib/auth", () => ({
  getCurrentUser: jest.fn(async () => ({ user: { id: "u-1", org_id: "org-1", role: "ADMIN" } })),
}))

jest.mock("@/lib/supabase/server", () => ({
  createServerClient: jest.fn(async () => mockSupabase),
  createAdminClient: jest.fn(() => mockSupabase),
}))

jest.mock("@/lib/accounting/ledger", () => ({
  createLedgerMovement: jest.fn(async () => ({ id: "lm-1" })),
  getOrCreateDefaultAccount: jest.fn(async () => "acc-costos"),
  validateSufficientBalance: jest.fn(async () => ({ valid: true })),
  isAccountingOnlyAccount: jest.fn(async () => false),
}))

jest.mock("@/lib/accounting/exchange-rates", () => ({
  getExchangeRate: jest.fn(async () => 1000),
  getLatestExchangeRate: jest.fn(async () => 1000),
  getExchangeRateWithFallback: jest.fn(async () => ({ rate: 1000, source: "test" })),
}))

jest.mock("@/lib/accounting/movement-journal", () => ({
  createMovementJournalEntry: jest.fn(async () => ({ id: "je-1" })),
  COUNTERPART_CODES: { OPERATOR_PAYMENT: "2.1.01" },
}))

const DEBT_ID = "86723e07-e85a-4799-aff4-f17b92c33b9c"
const OPERATION_ID = "96c1ca75-e37b-4737-a824-c6c6019fbf06"

/** Updates que llegaron a `operator_payments`, en orden. */
let debtUpdates: any[] = []
/** Inserts que llegaron a `payments`. */
let paymentInserts: any[] = []

function setup({
  debtAmount = 2619.08,
  debtUpdateError = null as { message: string } | null,
} = {}) {
  debtUpdates = []
  paymentInserts = []

  const rows: Record<string, any> = {
    financial_accounts: { id: "acc-usd", currency: "USD", type: "CASH_USD", org_id: "org-1" },
    operator_payments: {
      id: DEBT_ID,
      operation_id: OPERATION_ID,
      operator_id: "op-eurovips",
      amount: String(debtAmount),
      paid_amount: "0.00",
      currency: "USD",
      status: "PENDING",
      org_id: "org-1",
    },
    operations: {
      seller_id: "s-1",
      operator_id: "op-eurovips",
      agency_id: "ag-1",
      operator_cost: "6186.52",
      sale_amount_total: "7030",
    },
    chart_of_accounts: null,
  }

  function resolve(table: string, op: string) {
    if (op === "update") {
      if (table === "operator_payments") {
        return debtUpdateError
          ? { data: null, error: debtUpdateError }
          : { data: [{ id: DEBT_ID }], error: null }
      }
      return { data: null, error: null }
    }
    if (op === "insert") {
      return { data: { id: "pay-1" }, error: null }
    }
    // Los selects sobre ledger_movements son chequeos de duplicado: nunca hay.
    if (table === "ledger_movements") return { data: [], error: null }
    return { data: rows[table] ?? null, error: null }
  }

  function query(table: string) {
    let op = "select"
    const q: any = {}
    for (const method of ["select", "eq", "neq", "in", "order", "limit", "gte", "lte", "is", "not"]) {
      q[method] = () => q
    }
    q.insert = (payload: any) => {
      op = "insert"
      if (table === "payments") paymentInserts.push(payload)
      return q
    }
    q.update = (payload: any) => {
      op = "update"
      if (table === "operator_payments") debtUpdates.push(payload)
      return q
    }
    q.single = () => Promise.resolve(resolve(table, op))
    q.maybeSingle = () => Promise.resolve(resolve(table, op))
    q.then = (onOk: any, onErr: any) => Promise.resolve(resolve(table, op)).then(onOk, onErr)
    return q
  }

  mockSupabase = { from: (table: string) => query(table) }
}

function request(amountToPay: number) {
  return new Request("http://localhost/api/accounting/operator-payments/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      payments: [
        { operator_payment_id: DEBT_ID, operation_id: OPERATION_ID, amount_to_pay: amountToPay },
      ],
      payment_account_id: "acc-usd",
      payment_currency: "USD",
      receipt_number: "1111",
      payment_date: "2026-09-04",
    }),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe("POST /api/accounting/operator-payments/bulk", () => {
  it("rechaza el pago que supera la tolerancia sin mover plata de la cuenta", async () => {
    setup({ debtAmount: 100 })

    const response = await POST(request(120))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(createLedgerMovement).not.toHaveBeenCalled()
    expect(debtUpdates).toHaveLength(0)
    expect(body.details.join(" ")).toContain("supera en más del 10%")
  })

  it("no asienta el egreso si la deuda no se pudo aplicar", async () => {
    setup({
      debtUpdateError: {
        message: 'new row violates check constraint "operator_payments_paid_amount_capped"',
      },
    })

    const response = await POST(request(2679.36))
    const body = await response.json()

    expect(createLedgerMovement).not.toHaveBeenCalled()
    expect(paymentInserts).toHaveLength(0)
    expect(response.status).toBe(500)
    expect(body.details.join(" ")).toContain("No se movió plata de la cuenta")
  })

  it("sube la deuda al importe pagado en el mismo update y registra el pago", async () => {
    setup()

    const response = await POST(request(2679.36))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.processed).toHaveLength(1)

    // Mismo update: la base valida paid_amount <= amount * 1.01 por fila.
    expect(debtUpdates[0]).toMatchObject({
      paid_amount: 2679.36,
      amount: 2679.36,
      status: "PAID",
    })

    expect(createLedgerMovement).toHaveBeenCalled()
    expect(paymentInserts[0]).toMatchObject({
      operation_id: OPERATION_ID,
      operator_payment_id: DEBT_ID,
      source: "OPERATOR_BULK",
      direction: "EXPENSE",
      amount: 2679.36,
      status: "PAID",
    })
  })
})
