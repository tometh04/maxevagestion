import { NextResponse } from "next/server"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction, getScopedAgenciesForUser } from "@/lib/permissions-api"
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

    // Cross-tenant fix (2026-05-18): exigir org_id explícito y validar que
    // financial_account_id y category_id pertenezcan al org del user.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    const userOrgId = (user as any).org_id as string

    const supabase = await createServerClient()
    // adminDb justificado: cash_movements/ledger pueden tener triggers que
    // requieren bypass del filtro RLS para escribir asientos contables.
    // Igual filtramos por org en todas las queries.
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
      agency_id,
    } = body

    // Validate required fields
    if (!description || !amount || !currency || !financial_account_id || !movement_date) {
      return NextResponse.json(
        { error: "Faltan campos requeridos: descripción, monto, moneda, cuenta financiera, fecha" },
        { status: 400 }
      )
    }

    // Resolver la oficina del gasto. Antes el endpoint nunca seteaba agency_id
    // y dependía del trigger autofill (SELECT ... LIMIT 1 sobre user_agencies),
    // que para usuarios multi-oficina (Madero+Rosario) caía en la primera
    // agencia o en NULL ("Todas"). Ahora el agency_id viene del selector del
    // diálogo y se valida contra las oficinas que el usuario puede ver.
    // Mismo patrón que /api/recurring-payments.
    const scopedAgencies = await getScopedAgenciesForUser(supabase, user)
    let resolvedAgencyId: string | null = null
    if (agency_id) {
      if (!scopedAgencies.some((a) => a.id === agency_id)) {
        return NextResponse.json(
          { error: "La oficina seleccionada no es válida" },
          { status: 400 }
        )
      }
      resolvedAgencyId = agency_id
    } else if (scopedAgencies.length === 1) {
      // Org con una sola oficina: asignarla automáticamente.
      resolvedAgencyId = scopedAgencies[0].id
    } else if (scopedAgencies.length > 1) {
      // Hay varias oficinas pero no se eligió ninguna: rechazar para evitar
      // gastos "globales" accidentales (visibles en todas las oficinas).
      return NextResponse.json(
        { error: "Debe seleccionar una oficina para el gasto" },
        { status: 400 }
      )
    }

    const amountNum = roundMoney(Number(amount))
    if (amountNum <= 0) {
      return NextResponse.json({ error: "El monto debe ser mayor a 0" }, { status: 400 })
    }

    // Validate financial account exists, currency matches y pertenece al org.
    const { data: financialAccount, error: accountError } = await (supabase.from("financial_accounts") as any)
      .select("id, currency")
      .eq("id", financial_account_id)
      .eq("is_active", true)
      .eq("org_id", userOrgId)
      .single()

    if (accountError || !financialAccount) {
      return NextResponse.json({ error: "Cuenta financiera no encontrada o inactiva" }, { status: 404 })
    }

    if (financialAccount.currency !== currency) {
      return NextResponse.json({ error: `La cuenta financiera debe estar en ${currency}` }, { status: 400 })
    }

    // Get category name for the text category field (backward compat) — scopeado por org
    let categoryName = "Gastos Variables"
    if (category_id) {
      const { data: cat } = await (supabase.from("recurring_payment_categories") as any)
        .select("name")
        .eq("id", category_id)
        .eq("org_id", userOrgId)
        .single()
      if (!cat) {
        return NextResponse.json({ error: "Categoría no encontrada" }, { status: 404 })
      }
      categoryName = cat.name
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

    // Bug fix 2026-05-06: antes construíamos `concept = "Gasto: ..."` pero
    // nunca lo persistíamos — la descripción del user se perdía silently.
    // El cash_movement no tiene un campo `description` separado, así que
    // anteponemos la descripción al campo `notes` para que se preserve.
    const concept = provider_name
      ? `${description} (${provider_name})`
      : description
    const finalNotes = notes ? `${concept} — ${notes}` : concept

    // Create cash_movement
    // SaaS Pilar 2: inyectar org_id desde el user para que el row nuevo
    // caiga en la org correcta (RLS sino lo marca inaccesible en lecturas).
    const movementData: Record<string, any> = {
      user_id: user.id,
      org_id: userOrgId,
      type: "EXPENSE",
      category: categoryName,
      category_id: category_id || null,
      amount: amountNum,
      currency,
      financial_account_id,
      cash_box_id: cashBoxId,
      movement_date,
      notes: finalNotes,
      is_touristic: false,
      movement_category: "ADMINISTRATIVE",
      agency_id: resolvedAgencyId,
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
      // Rollback cash_movement (acotar por id — el row lo acabamos de crear)
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
    // Cross-tenant fix (2026-05-18): no confiar en RLS, filtrar org_id explícito.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    const userOrgId = (user as any).org_id as string

    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")
    const categoryId = searchParams.get("categoryId")
    const currencyParam = searchParams.get("currency")
    const agencyId = searchParams.get("agencyId")

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
      .eq("org_id", userOrgId)
      .order("movement_date", { ascending: false })

    if (dateFrom) query = query.gte("movement_date", dateFrom)
    if (dateTo) query = query.lte("movement_date", endOfDayAR(dateTo))
    if (categoryId) query = query.eq("category_id", categoryId)
    if (currencyParam && currencyParam !== "ALL") query = query.eq("currency", currencyParam)
    if (agencyId && agencyId !== "ALL") query = query.eq("agency_id", agencyId)
    if (user.role === "SELLER") query = query.eq("user_id", user.id)

    const { data: expenses, error } = await query

    if (error) {
      console.error("Error fetching variable expenses:", error)
      return NextResponse.json({ error: "Error al obtener gastos" }, { status: 500 })
    }

    // Get categories for enrichment (scopeado por org)
    const { data: categories } = await (supabase.from("recurring_payment_categories") as any)
      .select("id, name, color")
      .eq("is_active", true)
      .eq("org_id", userOrgId)

    const categoryMap = new Map((categories || []).map((c: any) => [c.id, c]))

    // Get receipt counts per expense. expense_receipts no tiene org_id directo;
    // los expenseIds ya fueron filtrados por org arriba via cash_movements.
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

    // Get financial account names (scopeado por org)
    const { data: accounts } = await (supabase.from("financial_accounts") as any)
      .select("id, name, currency")
      .eq("is_active", true)
      .eq("org_id", userOrgId)

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
