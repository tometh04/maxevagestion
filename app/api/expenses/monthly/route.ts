import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { roundMoney } from "@/lib/currency"

/**
 * GET /api/expenses/monthly
 * Unified monthly expenses view combining:
 * 1. Active recurring expenses (always show for any month)
 * 2. Variable expenses from cash_movements (filtered by date)
 * Excludes OPERATOR_PAYMENT (those are operational costs, not agency expenses)
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

    const allExpenses: any[] = []

    // 1. RECURRING EXPENSES: always show active ones for any selected month
    if (!typeFilter || typeFilter === "recurring") {
      const { data: recurring, error: recError } = await (supabase.from("recurring_payments") as any)
        .select("*")
        .eq("is_active", true)

      if (!recError && recurring) {
        for (const r of recurring) {
          if (currencyParam && currencyParam !== "ALL" && r.currency !== currencyParam) continue

          allExpenses.push({
            id: `rec-${r.id}`,
            recurring_id: r.id,
            expense_type: "recurring",
            description: r.description || r.provider_name || "Gasto recurrente",
            provider_name: r.provider_name || null,
            category: r.category_name || "Recurrente",
            amount: Number(r.amount),
            currency: r.currency || "ARS",
            movement_date: r.next_due_date || r.created_at,
            notes: r.notes || null,
            financial_accounts: null,
            users: null,
            is_paid: false, // Can be enriched later with payment status
          })
        }
      }
    }

    // 2. VARIABLE EXPENSES: from cash_movements filtered by date
    if (!typeFilter || typeFilter === "variable") {
      let query = (supabase.from("cash_movements") as any)
        .select(`
          id, type, category, amount, currency,
          movement_date, created_at, notes,
          financial_account_id, category_id,
          financial_accounts:financial_account_id (id, name, currency),
          users:user_id (id, name)
        `)
        .eq("type", "EXPENSE")
        .neq("category", "OPERATOR_PAYMENT")
        .order("movement_date", { ascending: false })

      if (dateFrom) query = query.gte("movement_date", `${dateFrom}T00:00:00`)
      if (dateTo) query = query.lte("movement_date", `${dateTo}T23:59:59`)
      if (currencyParam && currencyParam !== "ALL") query = query.eq("currency", currencyParam)
      if (user.role === "SELLER") query = query.eq("user_id", user.id)

      const { data: variables, error: varError } = await query

      if (!varError && variables) {
        for (const v of variables) {
          allExpenses.push({
            id: v.id,
            expense_type: "variable",
            description: v.category || v.notes || "Gasto variable",
            provider_name: null,
            category: v.category || null,
            amount: Number(v.amount),
            currency: v.currency,
            movement_date: v.movement_date,
            notes: v.notes,
            financial_accounts: v.financial_accounts,
            users: v.users,
            is_paid: true, // Variable expenses are always paid (they are cash movements)
          })
        }
      }
    }

    // Sort all by movement_date descending
    allExpenses.sort((a, b) => new Date(b.movement_date).getTime() - new Date(a.movement_date).getTime())

    // Calculate totals
    let totalARS = 0
    let totalUSD = 0
    let countRecurring = 0
    let countVariable = 0
    for (const e of allExpenses) {
      if (e.currency === "ARS") totalARS += e.amount
      else if (e.currency === "USD") totalUSD += e.amount
      if (e.expense_type === "recurring") countRecurring++
      else countVariable++
    }

    return NextResponse.json({
      expenses: allExpenses,
      totals: {
        ars: roundMoney(totalARS),
        usd: roundMoney(totalUSD),
        count: allExpenses.length,
        countRecurring,
        countVariable,
      },
    })
  } catch (error: any) {
    console.error("Error in GET /api/expenses/monthly:", error)
    return NextResponse.json({ error: "Error al obtener egresos" }, { status: 500 })
  }
}
