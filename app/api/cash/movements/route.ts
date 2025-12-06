import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import {
  createLedgerMovement,
  calculateARSEquivalent,
  getOrCreateDefaultAccount,
} from "@/lib/accounting/ledger"
import { getExchangeRate, getLatestExchangeRate } from "@/lib/accounting/exchange-rates"

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
      movement_date,
      notes,
      is_touristic,
      movement_category,
    } = body

    // Validate required fields
    if (!type || !category || amount === undefined || !currency || !movement_date) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

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
      amount: Number(amount),
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
    // Determinar tipo de cuenta financiera
    const accountType = currency === "USD" ? "USD" : "CASH"
    const accountId = await getOrCreateDefaultAccount(
      accountType,
      currency as "ARS" | "USD",
      user.id,
      supabase
    )

    // Calcular ARS equivalent
    let exchangeRate: number | null = null
    if (currency === "USD") {
      const rateDate = movement_date ? new Date(movement_date) : new Date()
      exchangeRate = await getExchangeRate(supabase, rateDate)
      
      // Si no hay tasa para esa fecha, usar la más reciente disponible
      if (!exchangeRate) {
        exchangeRate = await getLatestExchangeRate(supabase)
      }
      
      // Fallback: si aún no hay tasa, usar 1000 como último recurso
      if (!exchangeRate) {
        console.warn(`No exchange rate found for ${rateDate.toISOString()}, using fallback 1000`)
        exchangeRate = 1000
      }
    }
    
    const amountARS = calculateARSEquivalent(
      Number(amount),
      currency as "ARS" | "USD",
      exchangeRate
    )

    // Mapear type de cash_movement a ledger type
    const ledgerType = type === "INCOME" ? "INCOME" : "EXPENSE"

    // Mapear method según category (simplificado por ahora)
    const methodMap: Record<string, "CASH" | "BANK" | "MP" | "USD" | "OTHER"> = {
      SALE: "CASH",
      OPERATOR_PAYMENT: "BANK",
      COMMISSION: "CASH",
    }
    const method = methodMap[category] || "CASH"

    // Crear ledger movement
    await createLedgerMovement(
      {
        operation_id: operation_id || null,
        lead_id: null,
        type: ledgerType,
        concept: category,
        currency: currency as "ARS" | "USD",
        amount_original: Number(amount),
        exchange_rate: currency === "USD" ? exchangeRate : null,
        amount_ars_equivalent: amountARS,
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

    return NextResponse.json({ movement })
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

    // Obtener el movimiento para verificar que existe
    const { data: movement, error: fetchError } = await (supabase.from("cash_movements") as any)
      .select("id, operation_id, amount, currency, type, category, movement_date")
      .eq("id", movementId)
      .single()

    if (fetchError || !movement) {
      return NextResponse.json({ error: "Movimiento no encontrado" }, { status: 404 })
    }

    // Buscar y eliminar el ledger_movement asociado
    // (buscamos por operation_id, amount, type y fecha similar)
    try {
      const ledgerType = movement.type === "INCOME" ? "INCOME" : "EXPENSE"
      
      // Buscar ledger_movement que coincida
      const { data: ledgerMovements } = await (supabase.from("ledger_movements") as any)
        .select("id")
        .eq("operation_id", movement.operation_id)
        .eq("type", ledgerType)
        .eq("amount_original", movement.amount)
        .eq("currency", movement.currency)
      
      if (ledgerMovements && ledgerMovements.length > 0) {
        // Eliminar el primer movimiento que coincida
        await (supabase.from("ledger_movements") as any)
          .delete()
          .eq("id", ledgerMovements[0].id)
        console.log(`✅ Ledger movement ${ledgerMovements[0].id} eliminado`)
      }
    } catch (ledgerError) {
      console.warn("Warning: Could not find/delete associated ledger movement:", ledgerError)
      // Continuamos con la eliminación del cash_movement
    }

    // Eliminar el cash_movement
    const { error: deleteError } = await (supabase.from("cash_movements") as any)
      .delete()
      .eq("id", movementId)

    if (deleteError) {
      console.error("Error deleting cash movement:", deleteError)
      return NextResponse.json({ error: "Error al eliminar movimiento" }, { status: 500 })
    }

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