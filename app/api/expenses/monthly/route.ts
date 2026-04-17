import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { roundMoney } from "@/lib/currency"
import { startOfDayAR, endOfDayAR } from "@/lib/utils/date-range"

/**
 * GET /api/expenses/monthly
 * Shows PAID expenses in the selected date range:
 * 1. Recurring expenses: from ledger_movements type=EXPENSE with concept "Gasto recurrente:"
 *    (only appear when actually paid via the "Pagar" button)
 * 2. Variable expenses: from cash_movements type=EXPENSE filtered by date
 *    (appear immediately when created, since they're paid on creation)
 * Excludes OPERATOR_PAYMENT concepts.
 */
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const adminDb = createAdminClient()
    const { searchParams } = new URL(request.url)

    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")
    const currencyParam = searchParams.get("currency")
    const typeFilter = searchParams.get("type") // "recurring", "variable", or null for all

    const allExpenses: any[] = []

    // 1. RECURRING EXPENSES (paid): from ledger_movements
    if (!typeFilter || typeFilter === "recurring") {
      let recQuery = (adminDb.from("ledger_movements") as any)
        .select(`
          id, type, concept, currency, amount_original,
          movement_date, created_at, account_id, notes, receipt_number,
          financial_accounts:account_id (id, name, currency),
          users:created_by (id, name)
        `)
        .eq("type", "EXPENSE")
        .like("concept", "Gasto recurrente:%")
        .order("movement_date", { ascending: false })

      if (dateFrom) recQuery = recQuery.gte("movement_date", startOfDayAR(dateFrom))
      if (dateTo) recQuery = recQuery.lte("movement_date", endOfDayAR(dateTo))
      if (currencyParam && currencyParam !== "ALL") recQuery = recQuery.eq("currency", currencyParam)

      const { data: recurring, error: recError } = await recQuery

      if (!recError && recurring) {
        for (const e of recurring) {
          const description = (e.concept || "")
            .replace("Gasto recurrente: ", "")
            .replace("Gasto recurrente:", "")
            .trim()

          allExpenses.push({
            id: e.id,
            expense_type: "recurring",
            description,
            provider_name: null,
            category: "Recurrente",
            amount: Number(e.amount_original),
            currency: e.currency,
            movement_date: e.movement_date,
            notes: e.notes,
            financial_accounts: e.financial_accounts,
            users: e.users,
            is_paid: true,
          })
        }
      }
    }

    // 2. VARIABLE EXPENSES: from cash_movements type=EXPENSE (paid on creation)
    if (!typeFilter || typeFilter === "variable") {
      let varQuery = (supabase.from("cash_movements") as any)
        .select(`
          id, type, category, amount, currency,
          movement_date, created_at, notes,
          financial_account_id, category_id,
          financial_accounts:financial_account_id (id, name, currency),
          users:user_id (id, name)
        `)
        .eq("type", "EXPENSE")
        .not("category", "in", '("OPERATOR_PAYMENT","Pago Operador","Pago Cliente")')
        .order("movement_date", { ascending: false })

      if (dateFrom) varQuery = varQuery.gte("movement_date", startOfDayAR(dateFrom))
      if (dateTo) varQuery = varQuery.lte("movement_date", endOfDayAR(dateTo))
      if (currencyParam && currencyParam !== "ALL") varQuery = varQuery.eq("currency", currencyParam)
      if (user.role === "SELLER") varQuery = varQuery.eq("user_id", user.id)

      const { data: variables, error: varError } = await varQuery

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
            is_paid: true,
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
