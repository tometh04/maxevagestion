import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import {
  createLedgerMovement,
  calculateARSEquivalent,
  validateSufficientBalance,
  invalidateBalanceCache,
} from "@/lib/accounting/ledger"
import { getExchangeRate, getLatestExchangeRate } from "@/lib/accounting/exchange-rates"
import { roundMoney } from "@/lib/currency"

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
      amount,
      currency,
      financial_account_id,
      movement_date,
      notes,
      is_touristic,
      movement_category,
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
      user_id: user.id,
      type,
      category,
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
      exchangeRate = await getExchangeRate(supabase, rateDate)
      
      // Si no hay tasa para esa fecha, usar la más reciente disponible
      if (!exchangeRate) {
        exchangeRate = await getLatestExchangeRate(supabase)
      }
      
      // Fallback: si aún no hay tasa, usar 1450 como último recurso
      if (!exchangeRate) {
        console.warn(`No exchange rate found for ${rateDate.toISOString()}, using fallback 1450`)
        exchangeRate = 1450
      }
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

    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")
    const type = searchParams.get("type")
    const currency = searchParams.get("currency")
    const agencyId = searchParams.get("agencyId")
    
    // Paginación: usar page en vez de offset
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
    const requestedLimit = parseInt(searchParams.get("limit") || "50")
    const limit = Math.min(requestedLimit, 200) // Máximo 200
    const offset = (page - 1) * limit

    // Query base con count
    let query = supabase
      .from("cash_movements")
      .select(
        `
        *,
        users:user_id (
          id,
          name
        ),
        operations:operation_id (
          id,
          destination,
          agency_id,
          agencies:agency_id (
            id,
            name
          )
        )
      `,
      { count: "exact" }
      )

    if (user.role === "SELLER") {
      query = query.eq("user_id", user.id)
    }

    if (type && type !== "ALL") {
      query = query.eq("type", type)
    }

    if (currency && currency !== "ALL") {
      query = query.eq("currency", currency)
    }

    // Para agencyId, necesitamos filtrar a través de operations
    // Esto requiere una query más compleja, pero por ahora lo dejamos así
    // y filtramos en el cliente si es necesario
    if (dateFrom) {
      query = query.gte("movement_date", dateFrom)
    }

    if (dateTo) {
      query = query.lte("movement_date", dateTo)
    }

    // Aplicar paginación y ordenamiento
    const { data: movements, error, count } = await query
      .order("movement_date", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error("Error fetching movements:", error)
      return NextResponse.json({ error: "Error al obtener movimientos" }, { status: 500 })
    }

    // Filtrar por agencyId en el resultado si es necesario (porque no podemos filtrar fácilmente por operations.agency_id)
    let filteredMovements = movements || []
    if (agencyId && agencyId !== "ALL") {
      filteredMovements = filteredMovements.filter((m: any) => 
        m.operations?.agency_id === agencyId
      )
      // Nota: El count no será preciso si filtramos después, pero es una limitación de Supabase
    }

    const totalPages = count ? Math.ceil(count / limit) : 0

    return NextResponse.json({ 
      movements: filteredMovements,
      pagination: {
        total: count || 0,
        page,
        limit,
        totalPages,
        hasMore: page < totalPages
      }
    })
  } catch (error) {
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
        if (!delLm) console.log(`✅ Ledger movement ${movement.ledger_movement_id} eliminado`)
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
        console.log(`✅ Ledger movement ${toDelete.id} (fallback match) eliminado`)
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
    console.log(`✅ Cash movement ${movementId} eliminado`)

    return NextResponse.json({ 
      success: true, 
      message: "Movimiento eliminado correctamente" 
    })
  } catch (error) {
    console.error("Error in DELETE /api/cash/movements:", error)
    return NextResponse.json({ error: "Error al eliminar movimiento" }, { status: 500 })
  }
}