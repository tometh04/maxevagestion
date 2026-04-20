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
import { getExchangeRateWithFallback } from "@/lib/accounting/exchange-rates"
import { roundMoney } from "@/lib/currency"

const CLASSIFICATION_LABELS: Record<string, string> = {
  GASTOS_AGENCIA: "Gastos Agencia",
  VENTAS: "Ventas",
  RETIRO_PERSONAL: "Retiro Personal",
}

/**
 * POST /api/expenses/cc-payment
 * Create a credit card payment breakdown with multiple items
 */
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()

    if (!canPerformAction(user, "accounting", "write") && !canPerformAction(user, "cash", "write")) {
      return NextResponse.json({ error: "No tiene permiso para crear pagos de tarjeta" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const adminDb = createAdminClient() as any
    const body = await request.json()

    const {
      credit_card_account_id,
      source_account_id,
      total_amount,
      currency,
      exchange_rate: userExchangeRate,
      payment_date,
      notes,
      items,
    } = body

    // Validate required fields
    if (!credit_card_account_id || !source_account_id || !total_amount || !currency || !payment_date) {
      return NextResponse.json(
        { error: "Faltan campos requeridos: tarjeta, cuenta origen, monto, moneda, fecha" },
        { status: 400 }
      )
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Debe agregar al menos un item" }, { status: 400 })
    }

    const totalNum = roundMoney(Number(total_amount))
    if (totalNum <= 0) {
      return NextResponse.json({ error: "El monto total debe ser mayor a 0" }, { status: 400 })
    }

    // Validate source account exists and currency matches
    const { data: sourceAccount, error: sourceError } = await (supabase.from("financial_accounts") as any)
      .select("id, currency, name")
      .eq("id", source_account_id)
      .eq("is_active", true)
      .single()

    if (sourceError || !sourceAccount) {
      return NextResponse.json({ error: "Cuenta origen no encontrada o inactiva" }, { status: 404 })
    }

    if (sourceAccount.currency !== currency) {
      return NextResponse.json(
        { error: `La cuenta origen debe estar en ${currency}` },
        { status: 400 }
      )
    }

    // Validate credit card account exists
    const { data: ccAccount, error: ccError } = await (supabase.from("financial_accounts") as any)
      .select("id, name, type")
      .eq("id", credit_card_account_id)
      .eq("is_active", true)
      .single()

    if (ccError || !ccAccount) {
      return NextResponse.json({ error: "Tarjeta de crédito no encontrada o inactiva" }, { status: 404 })
    }

    // Validate items
    const validClassifications = ["GASTOS_AGENCIA", "VENTAS", "RETIRO_PERSONAL"]
    let itemsTotal = 0

    for (const item of items) {
      if (!item.classification || !validClassifications.includes(item.classification)) {
        return NextResponse.json(
          { error: `Clasificación inválida: ${item.classification}` },
          { status: 400 }
        )
      }
      if (!item.description || !item.amount) {
        return NextResponse.json(
          { error: "Cada item debe tener descripción y monto" },
          { status: 400 }
        )
      }
      const itemAmount = roundMoney(Number(item.amount))
      if (itemAmount <= 0) {
        return NextResponse.json({ error: "El monto de cada item debe ser mayor a 0" }, { status: 400 })
      }
      itemsTotal += itemAmount
    }

    // Validate sum matches total
    if (Math.abs(roundMoney(itemsTotal) - totalNum) > 0.01) {
      return NextResponse.json(
        { error: `La suma de los items (${roundMoney(itemsTotal)}) no coincide con el total (${totalNum})` },
        { status: 400 }
      )
    }

    // Validate sufficient balance in source account
    const balanceCheck = await validateSufficientBalance(
      source_account_id,
      totalNum,
      currency as "ARS" | "USD",
      supabase
    )
    if (!balanceCheck.valid) {
      return NextResponse.json(
        { error: balanceCheck.error || "Saldo insuficiente en cuenta origen" },
        { status: 400 }
      )
    }

    // Get exchange rate for USD
    let exchangeRate: number | null = null
    if (currency === "USD") {
      const rateDate = payment_date ? new Date(payment_date) : new Date()
      const rateResult = await getExchangeRateWithFallback(supabase, rateDate, "cc-payment")
      exchangeRate = rateResult.rate
    } else if (userExchangeRate) {
      exchangeRate = Number(userExchangeRate)
    }

    // SaaS Pilar 2: inyectar org_id en el group para que quede tenant-scoped.
    const userOrgId = (user as any).org_id || null

    // Create cc_payment_groups record
    const { data: group, error: groupError } = await adminDb
      .from("cc_payment_groups")
      .insert({
        credit_card_account_id,
        source_account_id,
        org_id: userOrgId,
        total_amount: totalNum,
        currency,
        exchange_rate: exchangeRate,
        payment_date,
        notes: notes || null,
        created_by: user.id,
      })
      .select()
      .single()

    if (groupError || !group) {
      console.error("Error creating cc_payment_group:", groupError)
      return NextResponse.json({ error: "Error al crear grupo de pago" }, { status: 500 })
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

    // Get category names for enrichment
    const categoryIds = items.map((i: any) => i.category_id).filter(Boolean)
    let categoryMap = new Map<string, string>()
    if (categoryIds.length > 0) {
      const { data: cats } = await (supabase.from("recurring_payment_categories") as any)
        .select("id, name")
        .in("id", categoryIds)
      if (cats) {
        for (const c of cats) categoryMap.set(c.id, c.name)
      }
    }

    // Create items: cash_movement + ledger_movement for each
    const createdMovements: string[] = []
    const movementDate = new Date(payment_date).toISOString()

    for (const item of items) {
      const itemAmount = roundMoney(Number(item.amount))
      const classLabel = CLASSIFICATION_LABELS[item.classification] || item.classification
      const categoryName = item.category_id ? categoryMap.get(item.category_id) || "Gastos Variables" : "Gastos Variables"

      const concept = `Pago TC: ${item.description} (${classLabel})`

      // Create cash_movement (tenant-scoped via org_id)
      const movementData: Record<string, any> = {
        user_id: user.id,
        org_id: userOrgId,
        type: "EXPENSE",
        category: categoryName,
        category_id: item.category_id || null,
        amount: itemAmount,
        currency,
        financial_account_id: source_account_id,
        cash_box_id: cashBoxId,
        movement_date: movementDate,
        notes: item.description,
        is_touristic: false,
        movement_category: "ADMINISTRATIVE",
        expense_classification: item.classification,
        cc_payment_group_id: group.id,
      }

      const { data: movement, error: movError } = await adminDb
        .from("cash_movements")
        .insert(movementData)
        .select()
        .single()

      if (movError) {
        console.error("Error creating cash_movement for cc-payment item:", movError)
        // Rollback: delete already-created movements and the group
        if (createdMovements.length > 0) {
          await adminDb.from("cash_movements").delete().in("id", createdMovements)
        }
        await adminDb.from("cc_payment_groups").delete().eq("id", group.id)
        return NextResponse.json({ error: `Error al crear item: ${movError.message}` }, { status: 500 })
      }

      createdMovements.push(movement.id)

      // Calculate ARS equivalent
      const amountARS = calculateARSEquivalent(itemAmount, currency as "ARS" | "USD", exchangeRate)
      const amountARSRounded = roundMoney(amountARS)

      // Create ledger movement
      try {
        const { id: ledgerMovementId } = await createLedgerMovement(
          {
            operation_id: null,
            lead_id: null,
            type: "EXPENSE",
            concept,
            currency: currency as "ARS" | "USD",
            amount_original: itemAmount,
            exchange_rate: currency === "USD" ? exchangeRate : userExchangeRate ? Number(userExchangeRate) : null,
            amount_ars_equivalent: amountARSRounded,
            method: "CASH",
            account_id: source_account_id,
            seller_id: null,
            operator_id: null,
            receipt_number: null,
            notes: `${classLabel}: ${item.description}`,
            created_by: user.id,
            movement_date: movementDate,
          },
          supabase
        )

        // Link ledger to cash_movement
        if (ledgerMovementId) {
          await adminDb
            .from("cash_movements")
            .update({ ledger_movement_id: ledgerMovementId })
            .eq("id", movement.id)
        }
      } catch (ledgerError: any) {
        console.error("Error creating ledger movement for cc-payment:", ledgerError)
        // Continue - the cash_movement is already created
      }
    }

    // Invalidate balance cache
    await invalidateBalanceCache(source_account_id)

    return NextResponse.json({
      group_id: group.id,
      movement_ids: createdMovements,
      items_count: createdMovements.length,
    })
  } catch (error: any) {
    const errMsg = error?.message || "Error desconocido al crear pago de tarjeta"
    console.error("Error in POST /api/expenses/cc-payment:", errMsg, error?.stack)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}

/**
 * GET /api/expenses/cc-payment
 * List credit card payment groups with their items
 */
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()

    if (!canPerformAction(user, "accounting", "read") && !canPerformAction(user, "cash", "read")) {
      return NextResponse.json({ error: "No tiene permiso para ver pagos de tarjeta" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")

    // Fetch cc_payment_groups
    let query = (supabase.from("cc_payment_groups") as any)
      .select("*")
      .order("payment_date", { ascending: false })

    if (dateFrom) query = query.gte("payment_date", dateFrom)
    if (dateTo) query = query.lte("payment_date", dateTo)

    const { data: groups, error } = await query

    if (error) {
      console.error("Error fetching cc payment groups:", error)
      return NextResponse.json({ error: "Error al obtener pagos de tarjeta" }, { status: 500 })
    }

    if (!groups || groups.length === 0) {
      return NextResponse.json({ groups: [] })
    }

    // Get financial account names
    const accountIds = new Set<string>()
    for (const g of groups) {
      accountIds.add(g.credit_card_account_id)
      accountIds.add(g.source_account_id)
    }

    const { data: accounts } = await (supabase.from("financial_accounts") as any)
      .select("id, name, currency, type")
      .in("id", Array.from(accountIds))

    const accountMap = new Map((accounts || []).map((a: any) => [a.id, a]))

    // Get items per group
    const groupIds = groups.map((g: any) => g.id)
    const { data: items } = await (supabase.from("cash_movements") as any)
      .select("id, amount, currency, notes, expense_classification, cc_payment_group_id, category, category_id")
      .in("cc_payment_group_id", groupIds)

    const itemsByGroup = new Map<string, any[]>()
    for (const item of items || []) {
      const list = itemsByGroup.get(item.cc_payment_group_id) || []
      list.push(item)
      itemsByGroup.set(item.cc_payment_group_id, list)
    }

    // Enrich groups
    const enriched = groups.map((g: any) => ({
      ...g,
      credit_card: accountMap.get(g.credit_card_account_id) || null,
      source_account: accountMap.get(g.source_account_id) || null,
      items: itemsByGroup.get(g.id) || [],
    }))

    return NextResponse.json({ groups: enriched })
  } catch (error: any) {
    console.error("Error in GET /api/expenses/cc-payment:", error)
    return NextResponse.json({ error: "Error al obtener pagos de tarjeta" }, { status: 500 })
  }
}
