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
        id, type, category, amount, currency, exchange_rate,
        movement_date, created_at, notes, reference,
        account_id, payment_id, recurring_expense_id,
        financial_accounts:account_id (id, name, currency),
        users:user_id (id, name),
        recurring_expenses:recurring_expense_id (id, description, provider_name)
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

    // Classify: recurring vs variable based on recurring_expense_id
    const enriched = (expenses || []).map((e: any) => ({
      ...e,
      expense_type: e.recurring_expense_id ? "recurring" : "variable",
      description: e.recurring_expenses?.description || e.category || e.notes || "Gasto",
      provider_name: e.recurring_expenses?.provider_name || null,
    }))

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
