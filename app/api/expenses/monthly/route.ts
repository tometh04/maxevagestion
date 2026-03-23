import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { roundMoney } from "@/lib/currency"

/**
 * GET /api/expenses/monthly
 * Shows PAID expenses in the selected date range.
 * Queries ledger_movements type=EXPENSE filtered by movement_date.
 * Classifies as "recurring" or "variable" based on concept prefix.
 * Excludes OPERATOR_PAYMENT concepts.
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

    // Query ledger_movements type=EXPENSE filtered by date
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

    // Filter and classify expenses
    const allExpenses: any[] = []

    for (const e of (expenses || [])) {
      const concept = e.concept || ""

      // Skip operator payments
      if (
        concept.includes("OPERATOR_PAYMENT") ||
        concept.includes("Pago operador") ||
        concept.includes("Pago a operador") ||
        concept.includes("Cobro cliente") ||
        concept.includes("Pago Cliente")
      ) continue

      // Classify as recurring or variable
      const isRecurring = concept.startsWith("Gasto recurrente:")
      const expenseType = isRecurring ? "recurring" : "variable"

      // Apply type filter
      if (typeFilter && typeFilter !== expenseType) continue

      // Clean description
      let description = concept
      if (isRecurring) {
        description = concept.replace("Gasto recurrente: ", "").replace("Gasto recurrente:", "")
      } else if (concept.startsWith("Gasto:")) {
        description = concept.replace("Gasto: ", "").replace("Gasto:", "")
      }

      allExpenses.push({
        id: e.id,
        expense_type: expenseType,
        description: description.trim(),
        provider_name: null,
        category: isRecurring ? "Recurrente" : "Variable",
        amount: Number(e.amount_original),
        currency: e.currency,
        movement_date: e.movement_date,
        notes: e.notes,
        financial_accounts: e.financial_accounts,
        users: e.users,
        is_paid: true, // All entries here are paid (they are ledger movements)
      })
    }

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
