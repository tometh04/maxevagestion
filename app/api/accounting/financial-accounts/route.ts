import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getAccountBalance } from "@/lib/accounting/ledger"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Get all financial accounts
    const { data: accounts, error: accountsError } = await (supabase.from("financial_accounts") as any)
      .select("*")
      .order("type", { ascending: true })
      .order("currency", { ascending: true })

    if (accountsError) {
      console.error("Error fetching financial accounts:", accountsError)
      return NextResponse.json({ error: "Error al obtener cuentas financieras" }, { status: 500 })
    }

    // Calculate balance for each account
    const accountsWithBalance = await Promise.all(
      (accounts || []).map(async (account: any) => {
        try {
          const balance = await getAccountBalance(account.id, supabase)
          return {
            ...account,
            current_balance: balance,
          }
        } catch (error) {
          console.error(`Error calculating balance for account ${account.id}:`, error)
          return {
            ...account,
            current_balance: account.initial_balance || 0,
          }
        }
      })
    )

    return NextResponse.json({ accounts: accountsWithBalance })
  } catch (error) {
    console.error("Error in GET /api/accounting/financial-accounts:", error)
    return NextResponse.json({ error: "Error al obtener cuentas financieras" }, { status: 500 })
  }
}

