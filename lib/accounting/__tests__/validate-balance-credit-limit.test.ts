/**
 * Tests para validateSufficientBalance — línea de crédito / giro en descubierto.
 *
 * Hasta migration 130 la función bloqueaba TODO egreso que dejara la cuenta en
 * negativo. Ahora, si la cuenta tiene `credit_limit > 0`, el saldo puede bajar
 * hasta -credit_limit (giro en descubierto configurable por cuenta). Con
 * credit_limit = 0 (default) se preserva el comportamiento legacy.
 *
 * Estrategia de mock: con chart_account_id = null, el saldo queda determinado por
 * initial_balance (sin movimientos en ledger). getAccountBalance delega en
 * getAccountBalancesBatch, que consulta financial_accounts con `.in(...)` y agrega
 * los movimientos por RPC `execute_readonly_query`. Con aggRows vacío el saldo es
 * el initial_balance. Eso nos deja fijar balance, currency y credit_limit.
 */

import { validateSufficientBalance } from "../ledger"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

let idCounter = 0
function uniqueAccountId() {
  idCounter += 1
  return `33333333-3333-3333-3333-${String(idCounter).padStart(12, "0")}`
}

function createMock(params: {
  balance: number
  currency: "ARS" | "USD"
  creditLimit: number
}): { supabase: SupabaseClient<Database>; accountId: string } {
  const accountId = uniqueAccountId()
  // Row usado por dos consumidores:
  //  - getAccountBalancesBatch: lee id/initial_balance/currency/chart_account_id vía .in()
  //  - validateSufficientBalance: lee credit_limit vía .select("*").eq().single()
  const accountRow = {
    id: accountId,
    initial_balance: String(params.balance),
    currency: params.currency,
    chart_account_id: null,
    credit_limit: params.creditLimit,
  }
  const accountsFrom: any = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: accountRow, error: null }),
    in: jest.fn().mockResolvedValue({ data: [accountRow], error: null }),
  }

  const from = jest.fn((table: string) => {
    if (table === "financial_accounts") return accountsFrom
    throw new Error(`unexpected table ${table}`)
  })
  // RPC de agregación: sin movimientos → saldo = initial_balance
  const rpc = jest.fn().mockResolvedValue({ data: [], error: null })
  return { supabase: { from, rpc } as unknown as SupabaseClient<Database>, accountId }
}

describe("validateSufficientBalance — línea de crédito", () => {
  it("credit_limit=0: rechaza un egreso que deja la cuenta en negativo (legacy)", async () => {
    const { supabase, accountId } = createMock({ balance: 100, currency: "ARS", creditLimit: 0 })
    const res = await validateSufficientBalance(accountId, 200, "ARS", supabase)
    expect(res.valid).toBe(false)
  })

  it("credit_limit=0: permite un egreso exacto que deja saldo en 0", async () => {
    const { supabase, accountId } = createMock({ balance: 100, currency: "ARS", creditLimit: 0 })
    const res = await validateSufficientBalance(accountId, 100, "ARS", supabase)
    expect(res.valid).toBe(true)
  })

  it("credit_limit=5000: permite pagar 2000 con saldo -1000 (queda en -3000)", async () => {
    // Escenario exacto del cliente: -1000 en la cuenta, paga 2000 → -3000, dentro del límite
    const { supabase, accountId } = createMock({ balance: -1000, currency: "ARS", creditLimit: 5000 })
    const res = await validateSufficientBalance(accountId, 2000, "ARS", supabase)
    expect(res.valid).toBe(true)
    expect(res.currentBalance).toBeCloseTo(-1000, 2)
  })

  it("credit_limit=5000: permite el egreso que llega justo al límite (-5000)", async () => {
    const { supabase, accountId } = createMock({ balance: -1000, currency: "ARS", creditLimit: 5000 })
    const res = await validateSufficientBalance(accountId, 4000, "ARS", supabase)
    expect(res.valid).toBe(true)
  })

  it("credit_limit=5000: rechaza el egreso que excede el límite (-5001)", async () => {
    const { supabase, accountId } = createMock({ balance: -1000, currency: "ARS", creditLimit: 5000 })
    const res = await validateSufficientBalance(accountId, 4001, "ARS", supabase)
    expect(res.valid).toBe(false)
    expect(res.error).toContain("Saldo insuficiente")
  })

  it("credit_limit alto funciona como flotante sin tope práctico", async () => {
    const { supabase, accountId } = createMock({ balance: -1000, currency: "USD", creditLimit: 1_000_000 })
    const res = await validateSufficientBalance(accountId, 50_000, "USD", supabase)
    expect(res.valid).toBe(true)
  })
})
