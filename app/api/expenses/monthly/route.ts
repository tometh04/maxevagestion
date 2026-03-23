import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { roundMoney } from "@/lib/currency"

/**
 * GET /api/expenses/monthly
 * Unified monthly expenses view: all ledger_movements with type=EXPENSE
 * This includes both variable expenses and recurring payment transactions
 */
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")
    const currencyParam = searchParams.get("currency")

    // Query ledger_movements with type=EXPENSE
    let query = (supabase.from("ledger_movements") as any)
      .select(`
        id, type, concept, currency, amount_original, amount_ars_equivalent,
        exchange_rate, method, notes, receipt_number,
        movement_date, created_at, account_id,
        financial_accounts:account_id (id, name, currency),
        users:created_by (id, name)
      `)
      .eq("type", "EXPENSE")
      .order("movement_date", { ascending: false })

    if (dateFrom) query = query.gte("movement_date", `${dateFrom}T00:00:00`)
    if (dateTo) query = query.lte("movement_date", `${dateTo}T23:59:59`)
    if (currencyParam && currencyParam !== "ALL") query = query.eq("currency", currencyParam)
    if (user.role === "SELLER") query = query.eq("created_by", user.id)

    const { data: expenses, error } = await query

    if (error) {
      console.error("Error fetching monthly expenses:", error)
      return NextResponse.json({ error: "Error al obtener egresos" }, { status: 500 })
    }

    // Classify: recurring vs variable based on concept prefix
    const enriched = (expenses || []).map((e: any) => ({
      ...e,
      expense_type: e.concept?.startsWith("Gasto recurrente:") ? "recurring" : "variable",
      description: e.concept?.replace("Gasto recurrente: ", "").replace("Gasto: ", "") || e.concept,
    }))

    // Calculate totals
    let totalARS = 0
    let totalUSD = 0
    let countRecurring = 0
    let countVariable = 0
    for (const e of enriched) {
      if (e.currency === "ARS") totalARS += Number(e.amount_original)
      else if (e.currency === "USD") totalUSD += Number(e.amount_original)
      if (e.expense_type === "recurring") countRecurring++
      else countVariable++
    }

    return NextResponse.json({
      expenses: enriched,
      totals: {
        ars: roundMoney(totalARS),
        usd: roundMoney(totalUSD),
        count: enriched.length,
        countRecurring,
        countVariable,
      },
    })
  } catch (error: any) {
    console.error("Error in GET /api/expenses/monthly:", error)
    return NextResponse.json({ error: "Error al obtener egresos" }, { status: 500 })
  }
}
