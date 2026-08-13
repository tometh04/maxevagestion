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
import { getExchangeRateWithFallback } from "@/lib/accounting/exchange-rates"
import { roundMoney } from "@/lib/currency"
import { settleOperatorDebtForStatement } from "@/lib/accounting/cc-settle-operator-debt"

const CLASSIFICATION_LABELS: Record<string, string> = {
  GASTOS_AGENCIA: "Gastos Agencia",
  VENTAS: "Ventas",
  RETIRO_PERSONAL: "Retiro Personal",
}

const VALID_CLASSIFICATIONS = ["GASTOS_AGENCIA", "VENTAS", "RETIRO_PERSONAL"]

interface ResolvedLeg {
  currency: "ARS" | "USD"
  source_account_id: string
  total_amount: number
  exchange_rate: number | null
  cash_box_id: string | null
}

/**
 * POST /api/expenses/cc-payment
 *
 * Registra el pago de un resumen de tarjeta. Soporta MULTI-MONEDA: el pago puede
 * tener varias "patas" (una por moneda), cada una con su cuenta origen y su
 * total. Cada item lleva su moneda (elige la pata) y, si es gasto, su agencia
 * (atribución Madero/Rosario). Los items pueden ser:
 *  - EXPENSE (default): crea un gasto clasificado, con agency_id.
 *  - OPERATOR_SETTLEMENT: cancela una deuda de operador existente (la agencia
 *    sale de la operación).
 */
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()

    if (!canPerformAction(user, "accounting", "write") && !canPerformAction(user, "cash", "write")) {
      return NextResponse.json({ error: "No tiene permiso para crear pagos de tarjeta" }, { status: 403 })
    }

    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    const userOrgId = (user as any).org_id as string

    const supabase = await createServerClient()
    // adminDb justificado: cc_payment_groups/legs/cash_movements/ledger tienen
    // triggers que requieren bypass de RLS. Filtramos org_id en todas las queries.
    const adminDb = createAdminClient() as any
    const body = await request.json()

    const { credit_card_account_id, payment_date, notes, legs, items } = body

    if (!credit_card_account_id || !payment_date) {
      return NextResponse.json(
        { error: "Faltan campos requeridos: tarjeta y fecha" },
        { status: 400 }
      )
    }
    if (!Array.isArray(legs) || legs.length === 0) {
      return NextResponse.json({ error: "Debe indicar al menos una moneda con su cuenta origen" }, { status: 400 })
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Debe agregar al menos un item" }, { status: 400 })
    }

    // Validate credit card account (org).
    const { data: ccAccount, error: ccError } = await (supabase.from("financial_accounts") as any)
      .select("id, name, type")
      .eq("id", credit_card_account_id)
      .eq("is_active", true)
      .eq("org_id", userOrgId)
      .single()
    if (ccError || !ccAccount) {
      return NextResponse.json({ error: "Tarjeta de crédito no encontrada o inactiva" }, { status: 404 })
    }

    // Agencias que el user puede usar (para validar la atribución por item).
    const scopedAgencies = await getScopedAgenciesForUser(supabase, user)
    const scopedAgencyIds = new Set(scopedAgencies.map((a) => a.id))

    // -----------------------------------------------------------------------
    // Validar patas (una por moneda) y resolver TC + caja por moneda.
    // -----------------------------------------------------------------------
    const legByCurrency = new Map<string, ResolvedLeg>()
    for (const leg of legs) {
      const cur = leg?.currency
      if (cur !== "ARS" && cur !== "USD") {
        return NextResponse.json({ error: `Moneda inválida en una pata: ${cur}` }, { status: 400 })
      }
      if (legByCurrency.has(cur)) {
        return NextResponse.json({ error: `Hay dos patas en ${cur}; debe haber una por moneda` }, { status: 400 })
      }
      const legTotal = roundMoney(Number(leg.total_amount))
      if (!leg.total_amount || legTotal <= 0) {
        return NextResponse.json({ error: `El total en ${cur} debe ser mayor a 0` }, { status: 400 })
      }
      if (!leg.source_account_id) {
        return NextResponse.json({ error: `Falta la cuenta origen para ${cur}` }, { status: 400 })
      }

      const { data: acct, error: acctErr } = await (supabase.from("financial_accounts") as any)
        .select("id, currency, name")
        .eq("id", leg.source_account_id)
        .eq("is_active", true)
        .eq("org_id", userOrgId)
        .single()
      if (acctErr || !acct) {
        return NextResponse.json({ error: `Cuenta origen de ${cur} no encontrada o inactiva` }, { status: 404 })
      }
      if (acct.currency !== cur) {
        return NextResponse.json({ error: `La cuenta origen de ${cur} debe estar en ${cur}` }, { status: 400 })
      }

      // Tipo de cambio de la pata: USD usa el provisto o el fallback; ARS opcional.
      let exchangeRate: number | null = null
      if (cur === "USD") {
        if (leg.exchange_rate) {
          exchangeRate = Number(leg.exchange_rate)
        } else {
          const rateDate = payment_date ? new Date(payment_date) : new Date()
          const rateResult = await getExchangeRateWithFallback(supabase, rateDate, "cc-payment")
          exchangeRate = rateResult.rate
        }
      } else if (leg.exchange_rate) {
        exchangeRate = Number(leg.exchange_rate)
      }

      const { data: cashBox } = await supabase
        .from("cash_boxes")
        .select("id")
        .eq("currency", cur)
        .eq("is_default", true)
        .eq("is_active", true)
        .maybeSingle()

      legByCurrency.set(cur, {
        currency: cur,
        source_account_id: leg.source_account_id,
        total_amount: legTotal,
        exchange_rate: exchangeRate,
        cash_box_id: (cashBox as any)?.id || null,
      })
    }

    // -----------------------------------------------------------------------
    // Validar items (por moneda) — todo antes de escribir nada.
    // -----------------------------------------------------------------------
    const settlementByIndex = new Map<number, any>()
    const itemsTotalByCurrency = new Map<string, number>()

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const itemAmount = roundMoney(Number(item.amount))
      if (!item.amount || itemAmount <= 0) {
        return NextResponse.json({ error: "El monto de cada item debe ser mayor a 0" }, { status: 400 })
      }

      const itemCurrency = item.currency
      if (!legByCurrency.has(itemCurrency)) {
        return NextResponse.json(
          { error: `Hay un item en ${itemCurrency || "sin moneda"} pero no hay una cuenta origen para esa moneda` },
          { status: 400 }
        )
      }

      if (item.type === "OPERATOR_SETTLEMENT") {
        if (!item.operator_payment_id || !item.operation_id) {
          return NextResponse.json(
            { error: "Cada item de cancelación de deuda requiere la deuda y la operación" },
            { status: 400 }
          )
        }
        const { data: opPayment, error: opErr } = await (supabase.from("operator_payments") as any)
          .select("id, operation_id, operator_id, amount, paid_amount, currency, status")
          .eq("id", item.operator_payment_id)
          .eq("org_id", userOrgId)
          .single()
        if (opErr || !opPayment) {
          return NextResponse.json({ error: "La deuda seleccionada no existe" }, { status: 404 })
        }
        if (opPayment.currency !== itemCurrency) {
          return NextResponse.json(
            { error: `La deuda está en ${opPayment.currency} pero el item es en ${itemCurrency}` },
            { status: 400 }
          )
        }
        if (opPayment.operation_id !== item.operation_id) {
          return NextResponse.json({ error: "La deuda no corresponde a la operación indicada" }, { status: 400 })
        }
        const pending = roundMoney(Number(opPayment.amount || 0) - Number(opPayment.paid_amount || 0))
        if (pending <= 0) {
          return NextResponse.json({ error: "La deuda seleccionada ya está saldada" }, { status: 400 })
        }
        if (itemAmount - pending > 0.01) {
          return NextResponse.json(
            { error: `El monto a cancelar (${itemAmount}) supera el saldo pendiente de la deuda (${pending})` },
            { status: 400 }
          )
        }
        settlementByIndex.set(i, opPayment)
      } else {
        // EXPENSE (default)
        if (!item.classification || !VALID_CLASSIFICATIONS.includes(item.classification)) {
          return NextResponse.json({ error: `Clasificación inválida: ${item.classification}` }, { status: 400 })
        }
        if (!item.description) {
          return NextResponse.json({ error: "Cada gasto debe tener descripción y monto" }, { status: 400 })
        }
        // Agencia opcional (atribución); si viene, debe ser una que el user pueda usar.
        if (item.agency_id && !scopedAgencyIds.has(item.agency_id)) {
          return NextResponse.json({ error: "La agencia indicada en un gasto no es válida" }, { status: 400 })
        }
      }

      itemsTotalByCurrency.set(
        itemCurrency,
        roundMoney((itemsTotalByCurrency.get(itemCurrency) || 0) + itemAmount)
      )
    }

    // Por cada pata: la suma de sus items debe coincidir con su total, y debe
    // haber saldo suficiente en su cuenta origen.
    for (const [cur, leg] of Array.from(legByCurrency.entries())) {
      const sum = itemsTotalByCurrency.get(cur) || 0
      if (Math.abs(sum - leg.total_amount) > 0.01) {
        return NextResponse.json(
          { error: `En ${cur} la suma de los items (${sum}) no coincide con el total (${leg.total_amount})` },
          { status: 400 }
        )
      }
      const balanceCheck = await validateSufficientBalance(
        leg.source_account_id,
        leg.total_amount,
        cur as "ARS" | "USD",
        supabase
      )
      if (!balanceCheck.valid) {
        return NextResponse.json(
          { error: balanceCheck.error || `Saldo insuficiente en la cuenta de ${cur}` },
          { status: 400 }
        )
      }
    }

    // -----------------------------------------------------------------------
    // Crear grupo + patas.
    // -----------------------------------------------------------------------
    const legList = Array.from(legByCurrency.values())
    const isSingleCurrency = legList.length === 1
    // Compat: si es una sola moneda, poblar las columnas legacy del grupo; si
    // hay varias, quedan NULL (la verdad vive en cc_payment_legs).
    const primaryLeg = legList[0]

    const { data: group, error: groupError } = await adminDb
      .from("cc_payment_groups")
      .insert({
        credit_card_account_id,
        org_id: userOrgId,
        source_account_id: isSingleCurrency ? primaryLeg.source_account_id : null,
        currency: isSingleCurrency ? primaryLeg.currency : null,
        total_amount: isSingleCurrency ? primaryLeg.total_amount : null,
        exchange_rate: isSingleCurrency ? primaryLeg.exchange_rate : null,
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

    const { error: legsError } = await adminDb.from("cc_payment_legs").insert(
      legList.map((leg) => ({
        group_id: group.id,
        org_id: userOrgId,
        currency: leg.currency,
        source_account_id: leg.source_account_id,
        total_amount: leg.total_amount,
        exchange_rate: leg.exchange_rate,
      }))
    )
    if (legsError) {
      console.error("Error creating cc_payment_legs:", legsError)
      await adminDb.from("cc_payment_groups").delete().eq("id", group.id)
      return NextResponse.json({ error: "Error al crear las patas del pago" }, { status: 500 })
    }

    // Category names para enriquecer (scopeado por org).
    const categoryIds = items.map((i: any) => i.category_id).filter(Boolean)
    let categoryMap = new Map<string, string>()
    if (categoryIds.length > 0) {
      const { data: cats } = await (supabase.from("recurring_payment_categories") as any)
        .select("id, name")
        .in("id", categoryIds)
        .eq("org_id", userOrgId)
      if (cats) {
        for (const c of cats) categoryMap.set(c.id, c.name)
      }
    }

    // -----------------------------------------------------------------------
    // Crear items (cada uno desde la cuenta de su moneda).
    // -----------------------------------------------------------------------
    const createdMovements: string[] = []
    const movementDate = new Date(payment_date).toISOString()

    const rollbackAndFail = async (status: number, error: string) => {
      if (createdMovements.length > 0) {
        await adminDb.from("cash_movements").delete().in("id", createdMovements)
      }
      // El delete del grupo cascada a cc_payment_legs (ON DELETE CASCADE).
      await adminDb.from("cc_payment_groups").delete().eq("id", group.id)
      return NextResponse.json({ error }, { status })
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const itemAmount = roundMoney(Number(item.amount))
      const leg = legByCurrency.get(item.currency)!

      // Item "cancela deuda": liquida la deuda desde la cuenta de su moneda.
      if (item.type === "OPERATOR_SETTLEMENT") {
        const opPayment = settlementByIndex.get(i)
        try {
          await settleOperatorDebtForStatement({
            supabase,
            adminDb,
            orgId: userOrgId,
            userId: user.id,
            operatorPaymentId: opPayment.id,
            operationId: opPayment.operation_id,
            operatorId: opPayment.operator_id,
            amount: itemAmount,
            currency: leg.currency,
            exchangeRate: leg.exchange_rate,
            accountId: leg.source_account_id,
            paymentDate: movementDate,
            ccPaymentGroupId: group.id,
            cashBoxId: leg.cash_box_id,
            notes: item.description || `Cancelación deuda operador (resumen TC)`,
          })
        } catch (settleErr: any) {
          console.error("Error settling operator debt in cc-payment:", settleErr)
          return rollbackAndFail(500, `Error al cancelar deuda: ${settleErr?.message || String(settleErr)}`)
        }
        continue
      }

      const classLabel = CLASSIFICATION_LABELS[item.classification] || item.classification
      const categoryName = item.category_id ? categoryMap.get(item.category_id) || "Gastos Variables" : "Gastos Variables"
      const concept = `Pago TC: ${item.description} (${classLabel})`
      const validCategoryId = item.category_id && categoryMap.has(item.category_id) ? item.category_id : null

      const movementData: Record<string, any> = {
        user_id: user.id,
        org_id: userOrgId,
        type: "EXPENSE",
        category: categoryName,
        category_id: validCategoryId,
        amount: itemAmount,
        currency: leg.currency,
        financial_account_id: leg.source_account_id,
        cash_box_id: leg.cash_box_id,
        movement_date: movementDate,
        notes: item.description,
        is_touristic: false,
        movement_category: "ADMINISTRATIVE",
        expense_classification: item.classification,
        cc_payment_group_id: group.id,
        // Atribución por agencia (Madero/Rosario). Opcional.
        agency_id: item.agency_id || null,
      }

      const { data: movement, error: movError } = await adminDb
        .from("cash_movements")
        .insert(movementData)
        .select()
        .single()

      if (movError) {
        console.error("Error creating cash_movement for cc-payment item:", movError)
        return rollbackAndFail(500, `Error al crear item: ${movError.message}`)
      }
      createdMovements.push(movement.id)

      const amountARS = calculateARSEquivalent(itemAmount, leg.currency, leg.exchange_rate)
      const amountARSRounded = roundMoney(amountARS)

      try {
        const { id: ledgerMovementId } = await createLedgerMovement(
          {
            operation_id: null,
            lead_id: null,
            type: "EXPENSE",
            concept,
            currency: leg.currency,
            amount_original: itemAmount,
            exchange_rate: leg.exchange_rate,
            amount_ars_equivalent: amountARSRounded,
            method: "CASH",
            account_id: leg.source_account_id,
            seller_id: null,
            operator_id: null,
            receipt_number: null,
            notes: `${classLabel}: ${item.description}`,
            created_by: user.id,
            movement_date: movementDate,
          },
          supabase
        )
        if (ledgerMovementId) {
          await adminDb.from("cash_movements").update({ ledger_movement_id: ledgerMovementId }).eq("id", movement.id)
        }
      } catch (ledgerError: any) {
        console.error("Error creating ledger movement for cc-payment:", ledgerError)
        // Continue - el cash_movement ya existe.
      }
    }

    for (const leg of legList) {
      await invalidateBalanceCache(leg.source_account_id)
    }

    return NextResponse.json({
      group_id: group.id,
      currencies: legList.map((l) => l.currency),
      items_count: items.length,
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

    // Cross-tenant fix (2026-05-18).
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    const userOrgId = (user as any).org_id as string

    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")

    // Fetch cc_payment_groups (scopeado por org)
    let query = (supabase.from("cc_payment_groups") as any)
      .select("*")
      .eq("org_id", userOrgId)
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

    const groupIds = groups.map((g: any) => g.id)

    // Patas por moneda (pagos multi-moneda). Los pagos viejos mono-moneda no
    // tienen patas: usan las columnas legacy del grupo.
    const { data: legs } = await (supabase as any)
      .from("cc_payment_legs")
      .select("id, group_id, currency, source_account_id, total_amount, exchange_rate")
      .in("group_id", groupIds)
      .eq("org_id", userOrgId)

    const legsByGroup = new Map<string, any[]>()
    for (const leg of legs || []) {
      const list = legsByGroup.get(leg.group_id) || []
      list.push(leg)
      legsByGroup.set(leg.group_id, list)
    }

    // Get financial account names (scopeado por org). Incluye cuentas de las patas.
    const accountIds = new Set<string>()
    for (const g of groups) {
      if (g.credit_card_account_id) accountIds.add(g.credit_card_account_id)
      if (g.source_account_id) accountIds.add(g.source_account_id)
    }
    for (const leg of legs || []) {
      if (leg.source_account_id) accountIds.add(leg.source_account_id)
    }

    const { data: accounts } = await (supabase.from("financial_accounts") as any)
      .select("id, name, currency, type")
      .in("id", Array.from(accountIds))
      .eq("org_id", userOrgId)

    const accountMap = new Map((accounts || []).map((a: any) => [a.id, a]))

    // Get items per group (scopeado por org, además de cc_payment_group_id)
    const { data: items } = await (supabase.from("cash_movements") as any)
      .select("id, amount, currency, notes, expense_classification, cc_payment_group_id, category, category_id, agency_id")
      .in("cc_payment_group_id", groupIds)
      .eq("org_id", userOrgId)

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
      source_account: g.source_account_id ? accountMap.get(g.source_account_id) || null : null,
      legs: (legsByGroup.get(g.id) || []).map((leg: any) => ({
        ...leg,
        source_account: accountMap.get(leg.source_account_id) || null,
      })),
      items: itemsByGroup.get(g.id) || [],
    }))

    return NextResponse.json({ groups: enriched })
  } catch (error: any) {
    console.error("Error in GET /api/expenses/cc-payment:", error)
    return NextResponse.json({ error: "Error al obtener pagos de tarjeta" }, { status: 500 })
  }
}
