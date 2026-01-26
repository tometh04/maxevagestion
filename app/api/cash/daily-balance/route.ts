import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getAccountBalance } from "@/lib/accounting/ledger"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    
    const { searchParams } = new URL(request.url)
    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")
    const agencyId = searchParams.get("agencyId") || null

    if (!dateFrom || !dateTo) {
      return NextResponse.json({ error: "Faltan parámetros dateFrom y dateTo" }, { status: 400 })
    }

    // Obtener cuentas financieras de efectivo y caja de ahorro (opcionalmente filtradas por agencia)
    let query = (supabase.from("financial_accounts") as any)
      .select("*")
      .in("type", ["CASH_ARS", "CASH_USD", "SAVINGS_ARS", "SAVINGS_USD"])
    if (agencyId) {
      query = query.eq("agency_id", agencyId)
    }
    const { data: accounts } = await query

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ dailyBalances: [] })
    }

    // Calcular balance diario
    const startDate = new Date(dateFrom)
    const endDate = new Date(dateTo)
    const dailyBalances: Array<{ date: string; balance: number }> = []

    // Iterar por cada día en el rango
    for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
      const dateStr = date.toISOString().split("T")[0]
      let totalBalance = 0

      // Calcular balance de cada cuenta hasta ese día
      // Las cajas ARS y USD son independientes - cada una usa su propia moneda
      for (const account of accounts) {
        try {
          const accountCurrency = account.currency as "ARS" | "USD"

          // Obtener balance inicial
          const initialBalance = parseFloat(account.initial_balance || "0")
          
          // Para cuentas ARS, usar amount_ars_equivalent
          // Para cuentas USD, usar amount_original (pero ya las omitimos arriba)
          const { data: movements } = await (supabase.from("ledger_movements") as any)
            .select("amount_original, amount_ars_equivalent, type, currency")
            .eq("account_id", account.id)
            .lte("created_at", `${dateStr}T23:59:59`)

          let accountBalance = initialBalance
          if (movements) {
            for (const movement of movements) {
              // Para ARS: usar amount_ars_equivalent
              // Para USD: usar amount_original (aunque no deberían estar aquí)
              const amount = accountCurrency === "ARS" 
                ? parseFloat(movement.amount_ars_equivalent || "0")
                : parseFloat(movement.amount_original || "0")
              
              if (movement.type === "INCOME" || movement.type === "FX_GAIN") {
                accountBalance += amount
              } else if (movement.type === "EXPENSE" || movement.type === "FX_LOSS" || movement.type === "COMMISSION" || movement.type === "OPERATOR_PAYMENT") {
                accountBalance -= amount
              }
            }
          }

          totalBalance += accountBalance
        } catch (error) {
          console.error(`Error calculating balance for account ${account.id}:`, error)
        }
      }

      dailyBalances.push({
        date: dateStr,
        balance: totalBalance,
      })
    }

    return NextResponse.json({ dailyBalances })
  } catch (error) {
    console.error("Error in GET /api/cash/daily-balance:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

