import { NextResponse } from "next/server"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"
import {
  createLedgerMovement,
  calculateARSEquivalent,
  validateSufficientBalance,
  invalidateBalanceCache,
} from "@/lib/accounting/ledger"
import { getExchangeRate, getLatestExchangeRate, getExchangeRateWithFallback } from "@/lib/accounting/exchange-rates"
import { roundMoney } from "@/lib/currency"
import { startOfDayAR, endOfDayAR } from "@/lib/utils/date-range"

/**
 * POST /api/expenses/variable
 * Create a variable (one-off) expense: cash_movement + ledger_movement
 */
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()

    if (!canPerformAction(user, "accounting", "write") && !canPerformAction(user, "cash", "write")) {
      return NextResponse.json({ error: "No tiene permiso para crear gastos" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const adminDb = createAdminClient() as any
    const body = await request.json()

    const {
      description,
      provider_name,
      category_id,
      amount,
      currency,
      exchange_rate: userExchangeRate,
      financial_account_id,
      movement_date,
      notes,
    } = body

    // Validate required fields
    if (!description || !amount || !currency || !financial_account_id || !movement_date) {
      return NextResponse.json(
        { error: "Faltan campos requeridos: descripción, monto, moneda, cuenta financiera, fecha" },
        { status: 400 }
      )
    }

    const amountNum = roundMoney(Number(amount))
    if (amountNum <= 0) {
      return NextResponse.json({ error: "El monto debe ser mayor a 0" }, { status: 400 })
    }

    // Validate financial account exists and currency matches
    const { data: financialAccount, error: accountError } = await (supabase.from("financial_accounts") as any)
      .select("id, currency")
      .eq("id", financial_account_id)
      .eq("is_active", true)
      .single()

    if (accountError || !financialAccount) {
      return NextResponse.json({ error: "Cuenta financiera no encontrada o inactiva" }, { status: 404 })
    }

    if (financialAccount.currency !== currency) {
      return NextResponse.json({ error: `La cuenta financiera debe estar en ${currency}` }, { status: 400 })
    }

    // Get category name for the text category field (backward compat)
    let categoryName = "Gastos Variables"
    if (category_id) {
      const { data: cat } = await (supabase.from("recurring_payment_categories") as any)
        .select("name")
        .eq("id", category_id)
        .single()
      if (cat) categoryName = cat.name
    }

    // Get default cash box
    const { data: defaultCashBox } = await supabase
      .from("cash_boxes")
      .select("id")
      .eq("currency", currency)
      .eq("is_default", true)
      .eq("is_active", true)
      .maybeSingle()
    const cashBoxId = (defaultCashBox as any)?.id || null

    // Build the concept string
    const concept = provider_name
      ? `Gasto: ${description} (${provider_name})`
      : `Gasto: ${description}`

    // Create cash_movement
    const movementData: Record<string, any> = {
      user_id: user.id,
      type: "EXPENSE",
      category: categoryName,
      category_id: category_id || null,
      amount: amountNum,
      currency,
      financial_account_id,
      cash_box_id: cashBoxId,
      movement_date,
      notes: notes || null,
      is_touristic: false,
      movement_category: "ADMINISTRATIVE",
    }

    const { data: movement, error: movError } = await adminDb
      .from("cash_movements")
      .insert(movementData)
      .select()
      .single()

    if (movError) {
      console.error("Error creating variable expense:", movError.message, movError.code, movError.details, movError.hint)
      return NextResponse.json({ error: `Error al crear gasto: ${movError.message}` }, { status: 500 })
    }

    // Calculate ARS equivalent
    let exchangeRate: number | null = null
    if (currency === "USD") {
      const rateDate = movement_date ? new Date(movement_date) : new Date()
      const rateResult = await getExchangeRateWithFallback(supabase, rateDate, "variable-expenses")
      exchangeRate = rateResult.rate
    } else if (userExchangeRate) {
      // ARS payment with exchange rate provided (for USD equivalent tracking)
      exchangeRate = Number(userExchangeRate)
    }

    const amountARS = calculateARSEquivalent(amountNum, currency as "ARS" | "USD", exchangeRate)
    const amountARSRounded = roundMoney(amountARS)

    // Validate sufficient balance
    const balanceCheck = await validateSufficientBalance(
      financial_account_id,
      amountNum,
      currency as "ARS" | "USD",
      supabase
    )
    if (!balanceCheck.valid) {
      // Rollback cash_movement
      await adminDb.from("cash_movements").delete().eq("id", movement.id)
      return NextResponse.json(
        { error: balanceCheck.error || "Saldo insuficiente en cuenta" },
        { status: 400 }
      )
    }

    // Create ledger movement
    const { id: ledgerMovementId } = await createLedgerMovement(
      {
        operation_id: null,
        lead_id: null,
        type: "EXPENSE",
        concept,
        currency: currency as "ARS" | "USD",
        amount_original: amountNum,
        exchange_rate: currency === "USD" ? exchangeRate : userExchangeRate ? Number(userExchangeRate) : null,
        amount_ars_equivalent: amountARSRounded,
        method: "CASH",
        account_id: financial_account_id,
        seller_id: null,
        operator_id: null,
        receipt_number: null,
        notes: notes || null,
        created_by: user.id,
        movement_date: movement_date || new Date().toISOString(),
      },
      supabase
    )

    // Link ledger to cash_movement
    if (ledgerMovementId) {
      await adminDb.from("cash_movements")
        .update({ ledger_movement_id: ledgerMovementId })
        .eq("id", movement.id)
    }

    return NextResponse.json({
      movement: { ...movement, ledger_movement_id: ledgerMovementId ?? null },
    })
  } catch (error: any) {
    const errMsg = error?.message || "Error desconocido al crear gasto"
    console.error("Error in POST /api/expenses/variable:", errMsg, error?.stack)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}

/**
 * GET /api/expenses/variable
 * List variable expenses with category and receipt info
 */
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")
    const categoryId = searchParams.get("categoryId")
    const currencyParam = searchParams.get("currency")

    // Fetch variable expenses (cash_movements with type=EXPENSE and is_touristic=false)
    let query = (supabase.from("cash_movements") as any)
      .select(`
        id, type, category, category_id, amount, currency, movement_date, notes,
        financial_account_id, ledger_movement_id, created_at,
        expense_classification, cc_payment_group_id,
        users:user_id (id, name)
      `)
      .eq("type", "EXPENSE")
      .eq("is_touristic", false)
      .order("movement_date", { ascending: false })

    if (dateFrom) query = query.gte("movement_date", dateFrom)
    if (dateTo) query = query.lte("movement_date", endOfDayAR(dateTo))
    if (categoryId) query = query.eq("category_id", categoryId)
    if (currencyParam && currencyParam !== "ALL") query = query.eq("currency", currencyParam)
    if (user.role === "SELLER") query = query.eq("user_id", user.id)

    const { data: expenses, error } = await query

    if (error) {
      console.error("Error fetching variable expenses:", error)
      return NextResponse.json({ error: "Error al obtener gastos" }, { status: 500 })
    }

    // Get categories for enrichment
    const { data: categories } = await (supabase.from("recurring_payment_categories") as any)
      .select("id, name, color")
      .eq("is_active", true)

    const categoryMap = new Map((categories || []).map((c: any) => [c.id, c]))

    // Get receipt counts per expense
    const expenseIds = (expenses || []).map((e: any) => e.id)
    let receiptCounts = new Map<string, number>()
    if (expenseIds.length > 0) {
      const { data: receipts } = await (supabase.from("expense_receipts") as any)
        .select("cash_movement_id")
        .in("cash_movement_id", expenseIds)

      if (receipts) {
        for (const r of receipts) {
          receiptCounts.set(r.cash_movement_id, (receiptCounts.get(r.cash_movement_id) || 0) + 1)
        }
      }
    }

    // Get financial account names
    const { data: accounts } = await (supabase.from("financial_accounts") as any)
      .select("id, name, currency")
      .eq("is_active", true)

    const accountMap = new Map((accounts || []).map((a: any) => [a.id, a]))

    // Enrich expenses
    const enriched = (expenses || []).map((e: any) => ({
      ...e,
      category_info: e.category_id ? categoryMap.get(e.category_id) || null : null,
      receipt_count: receiptCounts.get(e.id) || 0,
      financial_account: e.financial_account_id ? accountMap.get(e.financial_account_id) || null : null,
    }))

    // Calculate totals
    let totalARS = 0
    let totalUSD = 0
    for (const e of enriched) {
      if (e.currency === "ARS") totalARS += Number(e.amount)
      else if (e.currency === "USD") totalUSD += Number(e.amount)
    }

    return NextResponse.json({
      expenses: enriched,
      totals: { ars: roundMoney(totalARS), usd: roundMoney(totalUSD) },
    })
  } catch (error: any) {
    console.error("Error in GET /api/expenses/variable:", error)
    return NextResponse.json({ error: "Error al obtener gastos" }, { status: 500 })
  }
}
