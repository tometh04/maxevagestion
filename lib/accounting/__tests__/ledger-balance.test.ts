/**
 * Tests para getAccountBalancesBatch — fórmula de cálculo de saldos.
 *
 * Bug histórico: cuando un (account_id, type) tenía MIXTO de movements legacy
 * (sin debit_amount/credit_amount) y partida doble (con d/c), la fórmula vieja
 * descartaba los legacy. Resultado: saldos enormemente negativos en el Plan de
 * Cuentas del 17/04 (Caja ARS aparecía -$182M cuando el saldo real era +$44M).
 *
 * Estos tests usan data derivada del caso real de Caja ARS de Maxeva.
 */

import { getAccountBalancesBatch } from "../ledger"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

type AggRow = {
  account_id: string
  type: string
  legacy_original: number
  legacy_ars: number
  total_debit: number
  total_credit: number
}

function createMockSupabase(params: {
  accountsRow: { id: string; initial_balance: string; currency: "ARS" | "USD"; chart_account_id: string }
  chartRow: { id: string; category: string; subcategory: string | null }
  aggRows: AggRow[]
}) {
  const accountsFrom = {
    select: jest.fn().mockReturnThis(),
    in: jest.fn().mockResolvedValue({ data: [params.accountsRow], error: null }),
  }
  const chartFrom = {
    select: jest.fn().mockReturnThis(),
    in: jest.fn().mockResolvedValue({ data: [params.chartRow], error: null }),
  }

  const from = jest.fn((table: string) => {
    if (table === "financial_accounts") return accountsFrom
    if (table === "chart_of_accounts") return chartFrom
    throw new Error(`unexpected table ${table}`)
  })

  const rpc = jest.fn().mockResolvedValue({ data: params.aggRows, error: null })

  return { from, rpc } as unknown as SupabaseClient<Database>
}

describe("getAccountBalancesBatch — fórmula de saldos", () => {
  // ID único por test para evitar cache hit entre tests (el módulo mantiene
  // un balanceCache en memoria con TTL > duración del test run).
  let counter = 0
  const newIds = () => {
    counter += 1
    const suffix = String(counter).padStart(12, "0")
    return {
      accountId: `11111111-1111-1111-1111-${suffix}`,
      chartId: `22222222-2222-2222-2222-${suffix}`,
    }
  }

  it("cuenta ACTIVO con movements MIXTO (legacy + partida doble) los suma aditivamente", async () => {
    const { accountId, chartId } = newIds()
    // Escenario real de Caja ARS del 17/04:
    // - Initial balance: $4,119,515
    // - EXPENSE: 169 legacy, total $184.5M, 0 debit/credit
    // - INCOME: 60 movements, 1 con debit=$2.5M, 59 legacy sumando $305.6M
    // - OPERATOR_PAYMENT: 30 movements, 2 con credit=$5M, 28 legacy sumando $78.6M
    const supabase = createMockSupabase({
      accountsRow: {
        id: accountId,
        initial_balance: "4119515",
        currency: "ARS",
        chart_account_id: chartId,
      },
      chartRow: { id: chartId, category: "ACTIVO", subcategory: "CAJA" },
      aggRows: [
        { account_id: accountId, type: "EXPENSE",          legacy_original: 184529954.17, legacy_ars: 184529954.17, total_debit: 0,       total_credit: 0 },
        { account_id: accountId, type: "INCOME",           legacy_original: 305604893.09, legacy_ars: 305604893.09, total_debit: 2500000, total_credit: 0 },
        { account_id: accountId, type: "OPERATOR_PAYMENT", legacy_original:  78542961.60, legacy_ars:  78542961.60, total_debit: 0,       total_credit: 5053200 },
      ],
    })

    const result = await getAccountBalancesBatch([accountId], supabase)

    // Cálculo esperado:
    // Initial: 4,119,515
    // EXPENSE:          (A) 0 - 0 = 0; (B) -184,529,954.17
    // INCOME:           (A) +2,500,000; (B) +305,604,893.09
    // OPERATOR_PAYMENT: (A) 0 - 5,053,200 = -5,053,200; (B) -78,542,961.60
    // movementsSum = -184,529,954.17 + 2,500,000 + 305,604,893.09 - 5,053,200 - 78,542,961.60 = 39,978,777.32
    // final = 4,119,515 + 39,978,777.32 = 44,098,292.32
    expect(result[accountId]).toBeCloseTo(44098292.32, 2)
  })

  it("cuenta ACTIVO con SOLO legacy calcula INCOME suma y EXPENSE resta", async () => {
    const { accountId, chartId } = newIds()
    const supabase = createMockSupabase({
      accountsRow: { id: accountId, initial_balance: "0", currency: "ARS", chart_account_id: chartId },
      chartRow: { id: chartId, category: "ACTIVO", subcategory: "CAJA" },
      aggRows: [
        { account_id: accountId, type: "INCOME",  legacy_original: 1000, legacy_ars: 1000, total_debit: 0, total_credit: 0 },
        { account_id: accountId, type: "EXPENSE", legacy_original:  300, legacy_ars:  300, total_debit: 0, total_credit: 0 },
      ],
    })

    const result = await getAccountBalancesBatch([accountId], supabase)

    expect(result[accountId]).toBeCloseTo(700, 2)
  })

  it("cuenta ACTIVO con SOLO partida doble usa debit - credit (debit-natural)", async () => {
    const { accountId, chartId } = newIds()
    const supabase = createMockSupabase({
      accountsRow: { id: accountId, initial_balance: "0", currency: "ARS", chart_account_id: chartId },
      chartRow: { id: chartId, category: "ACTIVO", subcategory: "CAJA" },
      aggRows: [
        { account_id: accountId, type: "INCOME", legacy_original: 0, legacy_ars: 0, total_debit: 1500, total_credit: 200 },
      ],
    })

    const result = await getAccountBalancesBatch([accountId], supabase)

    expect(result[accountId]).toBeCloseTo(1300, 2)
  })

  it("cuenta PASIVO invierte la convención: EXPENSE suma, INCOME resta (legacy)", async () => {
    const { accountId, chartId } = newIds()
    const supabase = createMockSupabase({
      accountsRow: { id: accountId, initial_balance: "0", currency: "ARS", chart_account_id: chartId },
      chartRow: { id: chartId, category: "PASIVO", subcategory: "CUENTAS_POR_PAGAR" },
      aggRows: [
        { account_id: accountId, type: "EXPENSE", legacy_original: 500, legacy_ars: 500, total_debit: 0, total_credit: 0 },
        { account_id: accountId, type: "INCOME",  legacy_original: 100, legacy_ars: 100, total_debit: 0, total_credit: 0 },
      ],
    })

    const result = await getAccountBalancesBatch([accountId], supabase)

    // PASIVO: EXPENSE suma (+500), INCOME resta (-100) → +400
    expect(result[accountId]).toBeCloseTo(400, 2)
  })

  it("cuenta USD usa legacy_original (no legacy_ars)", async () => {
    const { accountId, chartId } = newIds()
    const supabase = createMockSupabase({
      accountsRow: { id: accountId, initial_balance: "1000", currency: "USD", chart_account_id: chartId },
      chartRow: { id: chartId, category: "ACTIVO", subcategory: "CAJA" },
      aggRows: [
        // legacy_original difiere de legacy_ars para probar que se usa el correcto
        { account_id: accountId, type: "INCOME", legacy_original: 500, legacy_ars: 600000, total_debit: 0, total_credit: 0 },
      ],
    })

    const result = await getAccountBalancesBatch([accountId], supabase)

    // Debe usar legacy_original (500) no legacy_ars (600k): 1000 + 500 = 1500
    expect(result[accountId]).toBeCloseTo(1500, 2)
  })
})
