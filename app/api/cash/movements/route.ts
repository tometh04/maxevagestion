import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import {
  createLedgerMovement,
  calculateARSEquivalent,
  validateSufficientBalance,
  invalidateBalanceCache,
} from "@/lib/accounting/ledger"
import { getExchangeRate, getLatestExchangeRate, getExchangeRateWithFallback } from "@/lib/accounting/exchange-rates"
import { roundMoney } from "@/lib/currency"
import { startOfDayAR, endOfDayAR } from "@/lib/utils/date-range"

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const body = await request.json()

    const {
      operation_id,
      cash_box_id,
      type,
      category,
      category_id,
      amount,
      currency,
      financial_account_id,
      movement_date,
      notes,
      is_touristic,
      movement_category,
      affects_balance,
    } = body

    // Validate required fields
    if (!type || !category || amount === undefined || !currency || !movement_date || !financial_account_id) {
      return NextResponse.json({ error: "Faltan campos requeridos (financial_account_id es obligatorio)" }, { status: 400 })
    }

    // Validar que la cuenta financiera existe
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

    const amountNum = roundMoney(Number(amount))

    // Get default cash box if not provided
    let finalCashBoxId = cash_box_id
    if (!finalCashBoxId) {
      const { data: defaultCashBox } = await supabase
        .from("cash_boxes")
        .select("id")
        .eq("currency", currency)
        .eq("is_default", true)
        .eq("is_active", true)
        .maybeSingle()
      finalCashBoxId = (defaultCashBox as any)?.id || null
    }

    const movementData: Record<string, any> = {
      operation_id: operation_id || null,
      cash_box_id: finalCashBoxId,
      financial_account_id: financial_account_id || null, // Vincular con cuenta financiera
      user_id: user.id,
      type,
      category,
      category_id: category_id || null,
      amount: amountNum,
      currency,
      movement_date,
      notes: notes || null,
      is_touristic: is_touristic !== false, // Default to true if not specified
      movement_category: is_touristic === false ? movement_category || null : null,
    }

    // Crear cash_movement (mantener compatibilidad)
    const { data: movement, error } = await (supabase.from("cash_movements") as any)
      .insert(movementData)
      .select()
      .single()

    if (error) {
      console.error("Error creating cash movement:", error)
      return NextResponse.json({ error: "Error al crear movimiento" }, { status: 500 })
    }

    // Obtener información de la operación si existe para completar seller_id y operator_id
    let sellerId: string | null = null
    let operatorId: string | null = null

    if (operation_id) {
      try {
        const { data: operation } = await (supabase.from("operations") as any)
          .select("seller_id, operator_id")
          .eq("id", operation_id)
          .maybeSingle()

        if (operation) {
          sellerId = (operation as any).seller_id || null
          operatorId = (operation as any).operator_id || null
        }
      } catch (error) {
        console.error("Error fetching operation for cash movement:", error)
        // Continuar sin seller_id/operator_id si hay error
      }
    }

    // ============================================
    // FASE 1: CREAR LEDGER MOVEMENT
    // ============================================
    // Usar la cuenta financiera proporcionada por el frontend
    const accountId = financial_account_id

    // Calcular ARS equivalent
    let exchangeRate: number | null = null
    if (currency === "USD") {
      const rateDate = movement_date ? new Date(movement_date) : new Date()
      const rateResult = await getExchangeRateWithFallback(supabase, rateDate, "cash-movements")
      exchangeRate = rateResult.rate
    }

    const amountARS = calculateARSEquivalent(
      amountNum,
      currency as "ARS" | "USD",
      exchangeRate
    )

    // Validar saldo suficiente para egresos (NUNCA permitir saldo negativo)
    if (type === "EXPENSE") {
      const balanceCheck = await validateSufficientBalance(
        accountId,
        amountNum,
        currency as "ARS" | "USD",
        supabase
      )

      if (!balanceCheck.valid) {
        return NextResponse.json(
          { error: balanceCheck.error || "Saldo insuficiente en cuenta para realizar el pago" },
          { status: 400 }
        )
      }
    }

    // Mapear type de cash_movement a ledger type
    const ledgerType = type === "INCOME" ? "INCOME" : "EXPENSE"

    // Mapear method según category (simplificado por ahora)
    const methodMap: Record<string, "CASH" | "BANK" | "MP" | "USD" | "OTHER"> = {
      SALE: "CASH",
      OPERATOR_PAYMENT: "BANK",
      COMMISSION: "CASH",
    }
    const method = methodMap[category] || "CASH"
    const amountARSRounded = roundMoney(amountARS)

    const { id: ledgerMovementId } = await createLedgerMovement(
      {
        operation_id: operation_id || null,
        lead_id: null,
        type: ledgerType,
        concept: category,
        currency: currency as "ARS" | "USD",
        amount_original: amountNum,
        exchange_rate: currency === "USD" ? exchangeRate : null,
        amount_ars_equivalent: amountARSRounded,
        method,
        account_id: accountId,
        seller_id: sellerId,
        operator_id: operatorId,
        receipt_number: null,
        notes: notes || null,
        created_by: user.id,
        affects_balance: affects_balance !== false,
        // Pasar la fecha efectiva del movimiento para que el filtro de Caja funcione
        // con fechas retroactivas (ej. egreso cargado hoy pero con fecha 13/02)
        movement_date: movement_date || new Date().toISOString(),
      },
      supabase
    )

    if (ledgerMovementId) {
      await (supabase.from("cash_movements") as any)
        .update({ ledger_movement_id: ledgerMovementId })
        .eq("id", movement.id)
    }

    return NextResponse.json({ movement: { ...movement, ledger_movement_id: ledgerMovementId ?? null } })
  } catch (error: any) {
    console.error("Error in POST /api/cash/movements:", error)
    return NextResponse.json(
      { error: error.message || "Error al crear movimiento" },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const dateFrom = searchParams.get("dateFrom") ?? undefined
    const dateTo = searchParams.get("dateTo") ?? undefined
    const dateType = (searchParams.get("dateType") ?? "MOVIMIENTO").toUpperCase()
    const typeParam = searchParams.get("type") ?? "ALL"
    const currencyParam = searchParams.get("currency") ?? "ALL"
    const agencyId = searchParams.get("agencyId")
    const financialAccountId = searchParams.get("financialAccountId")
    const customerQuery = (searchParams.get("customerQuery") ?? "").trim()

    // Paginación
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
    const requestedLimit = parseInt(searchParams.get("limit") ?? "50")
    const limit = Math.min(requestedLimit, 200)
    const offset = (page - 1) * limit

    // Si hay búsqueda por cliente, pre-resolvemos las operation_ids que matchean.
    // Flujo: customers (first/last name ilike) → operation_customers → operation_ids.
    // Después filtramos cash_movements por esos operation_ids (incluyendo
    // movimientos sin operación si la query queda vacía).
    let restrictToOperationIds: string[] | null = null
    if (customerQuery) {
      const words = customerQuery.split(/\s+/).filter(Boolean)
      let custQ = (supabase.from("customers") as any).select("id")
      for (const word of words) {
        custQ = custQ.or(
          `first_name.ilike.%${word}%,last_name.ilike.%${word}%,email.ilike.%${word}%,phone.ilike.%${word}%`
        )
      }
      const { data: matchingCustomers } = await custQ.limit(500)
      const customerIds = (matchingCustomers || []).map((c: any) => c.id)
      if (customerIds.length === 0) {
        // Sin clientes matching → resultado vacío
        return NextResponse.json({
          movements: [],
          pagination: { total: 0, page, limit, totalPages: 0, hasMore: false },
        })
      }
      const { data: opCustomerRows } = await (supabase.from("operation_customers") as any)
        .select("operation_id")
        .in("customer_id", customerIds)
      restrictToOperationIds = Array.from(
        new Set(((opCustomerRows as any[]) || []).map((r) => r.operation_id).filter(Boolean))
      ) as string[]
      if (restrictToOperationIds.length === 0) {
        return NextResponse.json({
          movements: [],
          pagination: { total: 0, page, limit, totalPages: 0, hasMore: false },
        })
      }
    }

    // Consultar cash_movements directamente — garantiza:
    // 1. Todos los movimientos (con Y sin operación asociada)
    // 2. Filtro por movement_date nativo (columna que siempre existió en cash_movements),
    //    evitando el bug de ledger_movements.movement_date que en prod puede ser NULL
    let query = (supabase.from("cash_movements") as any)
      .select(
        `
        id, type, category, amount, currency, movement_date, notes, financial_account_id,
        ledger_movements:ledger_movement_id (affects_balance),
        users:user_id (id, name),
        operations:operation_id (
          id,
          destination,
          file_code,
          agency_id
        )
      `,
        { count: "exact" }
      )
      .order("movement_date", { ascending: false })
      .range(offset, offset + limit - 1)

    // Filtros
    if (financialAccountId && financialAccountId !== "ALL") {
      // Incluir movimientos de la cuenta específica O movimientos sin cuenta asignada
      // que coincidan con la moneda de la cuenta (movimientos viejos con financial_account_id=NULL).
      // Esto evita que movimientos históricos queden invisibles en la Caja.
      const accountCurrency = searchParams.get("accountCurrency")
      if (accountCurrency) {
        query = query.or(
          `financial_account_id.eq.${financialAccountId},and(financial_account_id.is.null,currency.eq.${accountCurrency})`
        )
      } else {
        query = query.eq("financial_account_id", financialAccountId)
      }
    }
    // Mapeo dateType → comportamiento de filtro:
    // - MOVIMIENTO (default): cash_movements.movement_date
    // - OPERACION: pre-resolver operation_ids cuya operations.operation_date cae en [from,to]
    //   y restringir cash_movements.operation_id IN (...). Movimientos sin operation_id quedan fuera.
    if (dateType === "OPERACION" && (dateFrom || dateTo)) {
      let opQuery = (supabase.from("operations") as any).select("id")
      if (dateFrom) opQuery = opQuery.gte("operation_date", dateFrom)
      if (dateTo) opQuery = opQuery.lte("operation_date", dateTo)
      const { data: matchingOps } = await opQuery.limit(5000)
      const opIds = (matchingOps || []).map((o: any) => o.id)
      if (opIds.length === 0) {
        return NextResponse.json({
          movements: [],
          pagination: { total: 0, page, limit, totalPages: 0, hasMore: false },
        })
      }
      // Si ya hay restricción por cliente, intersectar
      if (restrictToOperationIds && restrictToOperationIds.length > 0) {
        const set = new Set(opIds)
        restrictToOperationIds = restrictToOperationIds.filter((id) => set.has(id))
        if (restrictToOperationIds.length === 0) {
          return NextResponse.json({
            movements: [],
            pagination: { total: 0, page, limit, totalPages: 0, hasMore: false },
          })
        }
      } else {
        restrictToOperationIds = opIds
      }
    } else {
      // Default MOVIMIENTO: filtrar por movement_date con timezone AR
      if (dateFrom) {
        query = query.gte("movement_date", startOfDayAR(dateFrom))
      }
      if (dateTo) {
        // Incluir el día completo hasta las 23:59:59 en hora AR (fix bug
        // "egresos no aparecen al filtrar fechas": antes se usaba UTC y se
        // perdían movimientos cargados después de las 21h hora local)
        query = query.lte("movement_date", endOfDayAR(dateTo))
      }
    }
    if (typeParam && typeParam !== "ALL") {
      query = query.eq("type", typeParam)
    }
    if (currencyParam && currencyParam !== "ALL") {
      query = query.eq("currency", currencyParam)
    }
    // Filtro por cliente (restrictToOperationIds ya fue pre-calculado arriba)
    if (restrictToOperationIds && restrictToOperationIds.length > 0) {
      query = query.in("operation_id", restrictToOperationIds)
    }
    // SELLER solo ve sus propios movimientos
    if (user.role === "SELLER") {
      query = query.eq("user_id", user.id)
    }

    const { data: rawMovements, error: movError, count } = await query

    if (movError) {
      console.error("Error fetching cash movements:", movError)
      return NextResponse.json({ error: "Error al obtener movimientos" }, { status: 500 })
    }

    let movements = (rawMovements || []).map((m: any) => {
      const linkedLedger = Array.isArray(m.ledger_movements) ? m.ledger_movements[0] : m.ledger_movements

      return {
        id: m.id,
        type: m.type as "INCOME" | "EXPENSE",
        category: m.category,
        amount: m.amount,
        currency: m.currency,
        movement_date: m.movement_date,
        notes: m.notes ?? null,
        affects_balance: linkedLedger?.affects_balance ?? true,
        operations: m.operations
          ? {
              id: m.operations.id,
              destination: m.operations.destination ?? null,
              file_code: m.operations.file_code ?? null,
              agency_id: m.operations.agency_id ?? null,
              agencies: null,
            }
          : null,
        users: m.users ? { name: m.users.name } : null,
      }
    })

    // Filtro de agencia (solo si viene el parámetro)
    if (agencyId && agencyId !== "ALL") {
      movements = movements.filter((m: any) => m.operations?.agency_id === agencyId)
    }

    const total = count ?? movements.length
    const totalPages = total > 0 ? Math.ceil(total / limit) : 0

    return NextResponse.json({
      movements,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasMore: offset + limit < total,
      },
    })
  } catch (error: any) {
    console.error("Error in GET /api/cash/movements:", error)
    return NextResponse.json({ error: "Error al obtener movimientos" }, { status: 500 })
  }
}

/**
 * DELETE /api/cash/movements
 * Eliminar un movimiento de caja y su ledger_movement asociado
 */
export async function DELETE(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const movementId = searchParams.get("movementId")

    if (!movementId) {
      return NextResponse.json({ error: "movementId es requerido" }, { status: 400 })
    }

    // Solo ADMIN y SUPER_ADMIN pueden eliminar movimientos
    const userRole = user.role as string
    if (!["ADMIN", "SUPER_ADMIN", "CONTABLE"].includes(userRole)) {
      return NextResponse.json({ error: "No tiene permiso para eliminar movimientos" }, { status: 403 })
    }

    const { data: movement, error: fetchError } = await (supabase.from("cash_movements") as any)
      .select("id, operation_id, amount, currency, type, category, movement_date, ledger_movement_id")
      .eq("id", movementId)
      .single()

    if (fetchError || !movement) {
      return NextResponse.json({ error: "Movimiento no encontrado" }, { status: 404 })
    }

    let accountIdToInvalidate: string | null = null

    if (movement.ledger_movement_id) {
      const { data: lm } = await (supabase.from("ledger_movements") as any)
        .select("id, account_id")
        .eq("id", movement.ledger_movement_id)
        .single()
      if (lm) {
        accountIdToInvalidate = lm.account_id
        const { error: delLm } = await (supabase.from("ledger_movements") as any)
          .delete()
          .eq("id", movement.ledger_movement_id)
        // ledger movement deleted with the cash movement
      }
    } else {
      const ledgerType = movement.type === "INCOME" ? "INCOME" : "EXPENSE"
      let q = (supabase.from("ledger_movements") as any)
        .select("id, account_id")
        .eq("type", ledgerType)
        .eq("amount_original", movement.amount)
        .eq("currency", movement.currency)
      if (movement.operation_id != null) {
        q = q.eq("operation_id", movement.operation_id)
      } else {
        q = q.is("operation_id", null)
      }
      const { data: ledgerRows } = await q.limit(2)
      if (ledgerRows && ledgerRows.length > 0) {
        const toDelete = ledgerRows[0]
        accountIdToInvalidate = toDelete.account_id
        await (supabase.from("ledger_movements") as any).delete().eq("id", toDelete.id)
      }
    }

    const { error: deleteError } = await (supabase.from("cash_movements") as any)
      .delete()
      .eq("id", movementId)

    if (deleteError) {
      console.error("Error deleting cash movement:", deleteError)
      return NextResponse.json({ error: "Error al eliminar movimiento" }, { status: 500 })
    }

    if (accountIdToInvalidate) invalidateBalanceCache(accountIdToInvalidate)

    return NextResponse.json({
      success: true,
      message: "Movimiento eliminado correctamente"
    })
  } catch (error) {
    console.error("Error in DELETE /api/cash/movements:", error)
    return NextResponse.json({ error: "Error al eliminar movimiento" }, { status: 500 })
  }
}
