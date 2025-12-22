import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getAccountBalance } from "@/lib/accounting/ledger"

// Forzar ruta dinámica
export const dynamic = 'force-dynamic'

/**
 * GET /api/analytics/pending-balances
 * Obtiene los balances reales de "Cuentas por Cobrar" y "Cuentas por Pagar"
 */
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Obtener cuenta "Cuentas por Cobrar" (account_code: 1.1.03)
    const { data: accountsReceivableChart } = await (supabase.from("chart_of_accounts") as any)
      .select("id")
      .eq("account_code", "1.1.03")
      .eq("is_active", true)
      .maybeSingle()

    let accountsReceivableBalance = 0
    if (accountsReceivableChart) {
      const { data: accountsReceivableAccounts } = await (supabase.from("financial_accounts") as any)
        .select("id")
        .eq("chart_account_id", accountsReceivableChart.id)
        .eq("is_active", true)

      if (accountsReceivableAccounts && accountsReceivableAccounts.length > 0) {
        for (const account of accountsReceivableAccounts) {
          try {
            const balance = await getAccountBalance(account.id, supabase)
            accountsReceivableBalance += balance
          } catch (error) {
            console.error(`Error calculating balance for account ${account.id}:`, error)
          }
        }
      }
    }

    // Obtener cuenta "Cuentas por Pagar" (account_code: 2.1.01)
    const { data: accountsPayableChart } = await (supabase.from("chart_of_accounts") as any)
      .select("id")
      .eq("account_code", "2.1.01")
      .eq("is_active", true)
      .maybeSingle()

    let accountsPayableBalance = 0
    if (accountsPayableChart) {
      const { data: accountsPayableAccounts } = await (supabase.from("financial_accounts") as any)
        .select("id")
        .eq("chart_account_id", accountsPayableChart.id)
        .eq("is_active", true)

      if (accountsPayableAccounts && accountsPayableAccounts.length > 0) {
        for (const account of accountsPayableAccounts) {
          try {
            const balance = await getAccountBalance(account.id, supabase)
            accountsPayableBalance += balance
          } catch (error) {
            console.error(`Error calculating balance for account ${account.id}:`, error)
          }
        }
      }
    }

    return NextResponse.json({
      accountsReceivable: Math.max(0, accountsReceivableBalance), // Solo valores positivos (lo que nos deben)
      accountsPayable: Math.max(0, accountsPayableBalance), // Solo valores positivos (lo que debemos)
    })
  } catch (error: any) {
    console.error("Error in GET /api/analytics/pending-balances:", error)
    return NextResponse.json({ 
      accountsReceivable: 0,
      accountsPayable: 0,
      error: error.message 
    }, { status: 500 })
  }
}

