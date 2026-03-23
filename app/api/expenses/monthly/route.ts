import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { roundMoney } from "@/lib/currency"

/**
 * GET /api/expenses/monthly
 * Unified monthly expenses view: all cash_movements with type=EXPENSE
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
    const typeFilter = searchParams.get("type") // "recurring", "variable", or null for all

    // Query cash_movements with type=EXPENSE
    let query = (supabase.from("cash_movements") as any)
      .select(`
        id, type, category, amount, currency,
        movement_date, created_at, notes,
        financial_account_id, operation_id, category_id,
        financial_accounts:financial_account_id (id, name, currency),
        users:user_id (id, name)
      `)
      .eq("type", "EXPENSE")
      .order("movement_date", { ascending: false })

    if (dateFrom) query = query.gte("movement_date", `${dateFrom}T00:00:00`)
    if (dateTo) query = query.lte("movement_date", `${dateTo}T23:59:59`)
    if (currencyParam && currencyParam !== "ALL") query = query.eq("currency", currencyParam)
    if (user.role === "SELLER") query = query.eq("user_id", user.id)

    const { data: expenses, error } = await query

    if (error) {
      console.error("Error fetching monthly expenses:", error)
      return NextResponse.json({ error: "Error al obtener egresos" }, { status: 500 })
    }

    // Classify based on category text patterns
    const enriched = (expenses || []).map((e: any) => {
      const cat = (e.category || "").toLowerCase()
      const isRecurring = cat.includes("recurrente") || cat.includes("recurring")
      return {
        ...e,
        expense_type: isRecurring ? "recurring" : "variable",
        description: e.category || e.notes || "Gasto",
      }
    })

    // Apply type filter if specified
    const filtered = typeFilter
      ? enriched.filter((e: any) => e.expense_type === typeFilter)
      : enriched

    // Calculate totals
    let totalARS = 0
    let totalUSD = 0
    let countRecurring = 0
    let countVariable = 0
    for (const e of filtered) {
      if (e.currency === "ARS") totalARS += Number(e.amount)
      else if (e.currency === "USD") totalUSD += Number(e.amount)
      if (e.expense_type === "recurring") countRecurring++
      else countVariable++
    }

    return NextResponse.json({
      expenses: filtered,
      totals: {
        ars: roundMoney(totalARS),
        usd: roundMoney(totalUSD),
        count: filtered.length,
        countRecurring,
        countVariable,
      },
    })
  } catch (error: any) {
    console.error("Error in GET /api/expenses/monthly:", error)
    return NextResponse.json({ error: "Error al obtener egresos" }, { status: 500 })
  }
}
