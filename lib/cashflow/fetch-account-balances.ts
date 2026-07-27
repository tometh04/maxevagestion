/**
 * Saldos actuales de las cuentas financieras, para el Reporte de Caja (VIB-67).
 *
 * `financial_accounts` no tiene columna de saldo: el saldo es siempre derivado
 * del ledger. Se usa `getAccountBalancesBatch()`, que resuelve todas las cuentas
 * en una sola agregación; el reporte de flujo de caja actual llama
 * `getAccountBalance()` cuenta por cuenta, que es el mismo dato pero N veces.
 */

import { getAccountBalancesBatch } from "@/lib/accounting/ledger"

export interface AccountBalanceRow {
  id: string
  name: string
  currency: string
  agencyName: string | null
  balance: number
}

export interface FetchAccountBalancesParams {
  supabase: any
  orgId: string
  agencyId?: string | null
  agencyIds?: string[]
}

export interface FetchAccountBalancesResult {
  accounts: AccountBalanceRow[]
  totals: { ARS: number; USD: number }
}

export async function fetchAccountBalances(
  params: FetchAccountBalancesParams
): Promise<FetchAccountBalancesResult> {
  const { supabase, orgId } = params
  const agencyId = params.agencyId && params.agencyId !== "ALL" ? params.agencyId : null
  const agencyIds = params.agencyIds ?? []

  let query = (supabase.from("financial_accounts") as any)
    .select("id, name, currency, initial_balance, agency_id, agencies:agency_id(name)")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("name", { ascending: true })

  if (agencyId) query = query.eq("agency_id", agencyId)
  else if (agencyIds.length > 0) query = query.in("agency_id", agencyIds)

  const { data: rows } = await query
  const accounts = (rows || []) as any[]
  if (accounts.length === 0) {
    return { accounts: [], totals: { ARS: 0, USD: 0 } }
  }

  let balances: Record<string, number> = {}
  try {
    balances = (await getAccountBalancesBatch(
      accounts.map((a) => a.id),
      supabase
    )) as any
  } catch (error) {
    console.warn("[cashflow-report] no se pudieron calcular los saldos:", error)
  }

  const totals = { ARS: 0, USD: 0 }
  const result: AccountBalanceRow[] = accounts.map((account) => {
    const balance = Number(
      balances?.[account.id] ?? account.initial_balance ?? 0
    )
    const currency = account.currency === "USD" ? "USD" : "ARS"
    totals[currency] += balance
    return {
      id: account.id,
      name: account.name || "Sin nombre",
      currency,
      agencyName: account.agencies?.name ?? null,
      balance,
    }
  })

  return { accounts: result, totals }
}
