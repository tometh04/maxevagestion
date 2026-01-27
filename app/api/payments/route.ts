import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import {
  createLedgerMovement,
  calculateARSEquivalent,
  getOrCreateDefaultAccount,
  validateSufficientBalance,
  getMainPassengerName,
} from "@/lib/accounting/ledger"
import {
  getExchangeRate,
  getLatestExchangeRate,
} from "@/lib/accounting/exchange-rates"
import { revalidateTag, CACHE_TAGS } from "@/lib/cache"

/**
 * POST /api/payments
 * Crear un pago y generar movimientos contables asociados:
 * - Registro en tabla payments
 * - Movimiento en ledger_movements (libro mayor)
 * - Movimiento en cash_movements (caja)
 */
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const body = await request.json()

    const {
      operation_id,
      payer_type,
      direction,
      method,
      amount,
      currency,
      financial_account_id,
      exchange_rate: providedExchangeRate, // Tipo de cambio del frontend
      date_paid,
      date_due,
      status,
      notes,
    } = body

    // operation_id ahora es opcional (para pagos manuales)
    // financial_account_id es requerido siempre
    if (!payer_type || !direction || !amount || !currency || !financial_account_id) {
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

    // Validar que la moneda de la cuenta coincide con la del pago
    if (financialAccount.currency !== currency) {
      return NextResponse.json({ error: `La cuenta financiera debe estar en ${currency}` }, { status: 400 })
    }

    // Validaciones de montos
    if (amount < 0) {
      return NextResponse.json({ error: "El monto no puede ser negativo" }, { status: 400 })
    }

    // Validaciones de fechas
    const today = new Date()
    today.setHours(0, 0, 0, 0) // Resetear a medianoche para comparación

    if (date_paid) {
      const paidDate = new Date(date_paid)
      paidDate.setHours(0, 0, 0, 0)
      
      // Validar que date_paid no sea futuro
      if (paidDate > today) {
        return NextResponse.json({ error: "La fecha de pago no puede ser futura" }, { status: 400 })
      }
    }

    // Validar que date_due sea después de date_paid (si ambos están)
    if (date_paid && date_due) {
      const paidDate = new Date(date_paid)
      paidDate.setHours(0, 0, 0, 0)
      
      const dueDate = new Date(date_due)
      dueDate.setHours(0, 0, 0, 0)

      if (dueDate < paidDate) {
        return NextResponse.json({ error: "La fecha de vencimiento debe ser posterior o igual a la fecha de pago" }, { status: 400 })
      }
    }

    // Calcular amount_usd para el pago
    // Si es USD: amount_usd = amount
    // Si es ARS: amount_usd = amount / exchange_rate
    let amountUsd: number | null = null
    if (currency === "USD") {
      amountUsd = parseFloat(amount)
    } else if (currency === "ARS" && providedExchangeRate) {
      amountUsd = parseFloat(amount) / parseFloat(providedExchangeRate)
    }

    // 1. Crear el pago en tabla payments
    // IMPORTANTE: Si status no se especifica, crear como PENDING para evitar crear movimientos contables duplicados
    // Los movimientos contables se crearán cuando se marque como PAID
    const paymentData = {
        operation_id,
        payer_type,
        direction,
      method: method || "Otro",
      amount,
        currency,
      exchange_rate: providedExchangeRate ? parseFloat(providedExchangeRate) : null,
      amount_usd: amountUsd,
      date_paid: date_paid || null,
      date_due: date_due || date_paid,
      status: status || "PENDING", // Cambiar default a PENDING para evitar duplicados
      reference: notes || null,
    }

    const { data: payment, error: paymentError } = await (supabase.from("payments") as any)
      .insert(paymentData)
      .select()
      .single()

    if (paymentError) {
      console.error("Error creating payment:", paymentError)
      return NextResponse.json({ error: `Error al crear pago: ${paymentError.message}` }, { status: 500 })
    }

    // Solo crear movimientos contables si el pago está PAID explícitamente
    // Si status no se especifica, el default es PENDING, así que no crear movimientos
    if (status === "PAID") {
      try {
        // 2. Obtener datos de la operación para seller_id y operator_id (si existe operation_id)
        let sellerId: string | null = null
        let operatorId: string | null = null
        let agencyId: string | undefined = undefined

        if (operation_id) {
          const { data: operation } = await (supabase.from("operations") as any)
            .select("seller_id, operator_id, agency_id")
            .eq("id", operation_id)
            .single()

          sellerId = operation?.seller_id || null
          operatorId = operation?.operator_id || null
          agencyId = operation?.agency_id
        }

        // 3. Calcular tasa de cambio
        // Si es USD: buscar tasa para convertir a ARS
        // Si es ARS: usar la tasa proporcionada por el frontend para calcular equivalente USD
        let exchangeRate: number | null = null
        
        if (currency === "USD") {
          // Para USD, buscar tasa de cambio
          const rateDate = date_paid ? new Date(date_paid) : new Date()
          exchangeRate = await getExchangeRate(supabase, rateDate)
          if (!exchangeRate) {
            exchangeRate = await getLatestExchangeRate(supabase)
          }
          if (!exchangeRate) {
            exchangeRate = 1000 // Fallback
          }
        } else if (currency === "ARS" && providedExchangeRate) {
          // Para ARS, usar la tasa proporcionada
          exchangeRate = parseFloat(providedExchangeRate)
        }

        // Calcular equivalente en ARS
        // Para ARS: amount_ars_equivalent = amount (es la misma moneda)
        // Para USD: amount_ars_equivalent = amount * exchangeRate
        const amountARS = currency === "ARS" 
          ? parseFloat(amount) 
          : calculateARSEquivalent(parseFloat(amount), "USD", exchangeRate)

        // 4. Usar la cuenta financiera proporcionada por el frontend
        const accountId = financial_account_id
        
        // Validar que la cuenta existe y está activa
        const { data: selectedAccount, error: accountCheckError } = await (supabase.from("financial_accounts") as any)
          .select("id, name, currency, is_active")
          .eq("id", accountId)
          .single()

        if (accountCheckError || !selectedAccount || !selectedAccount.is_active) {
          return NextResponse.json({ error: "La cuenta financiera seleccionada no existe o no está activa" }, { status: 400 })
        }

        // Validar que la moneda de la cuenta coincide
        if (selectedAccount.currency !== currency) {
          return NextResponse.json({ error: `La cuenta financiera debe estar en ${currency}` }, { status: 400 })
        }

        // Validar saldo suficiente para egresos (NUNCA permitir saldo negativo)
        if (direction === "EXPENSE" || payer_type === "OPERATOR") {
          const amountToCheck = parseFloat(amount)
          const balanceCheck = await validateSufficientBalance(
            accountId,
            amountToCheck,
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

        console.log(`💰 Creando movimiento contable en cuenta seleccionada:`, {
          accountId: accountId,
          accountName: selectedAccount.name,
          accountCurrency: selectedAccount.currency,
          direction: direction,
          amount: amount,
          currency: currency,
          type: direction === "INCOME" ? "INCOME" : (payer_type === "OPERATOR" ? "OPERATOR_PAYMENT" : "EXPENSE")
        })

        // 5. Mapear método de pago a método de ledger
        const methodMap: Record<string, "CASH" | "BANK" | "MP" | "USD" | "OTHER"> = {
          "Transferencia": "BANK",
          "Efectivo": "CASH",
          "Tarjeta Crédito": "OTHER",
          "Tarjeta Débito": "OTHER",
          "MercadoPago": "MP",
          "PayPal": "OTHER",
          "Otro": "OTHER",
        }
        const ledgerMethod = methodMap[method || "Otro"] || "OTHER"

        // 6. Determinar tipo de ledger movement
        const ledgerType = direction === "INCOME" 
          ? "INCOME" 
          : (payer_type === "OPERATOR" ? "OPERATOR_PAYMENT" : "EXPENSE")

        // 6.1. Obtener nombre del pasajero principal para el concepto
        const passengerName = operation_id ? await getMainPassengerName(operation_id, supabase) : null
        const operationCode = operation_id ? operation_id.slice(0, 8) : "N/A"
        
        // 7. Crear movimiento PRINCIPAL en libro mayor (ledger_movements) usando la cuenta seleccionada
        // Este es el ÚNICO movimiento que afecta el balance de la cuenta financiera seleccionada
        const { id: ledgerMovementId } = await createLedgerMovement(
          {
            operation_id,
            lead_id: null,
            type: ledgerType,
            concept: direction === "INCOME" 
              ? passengerName 
                ? `${passengerName} (${operationCode})`
                : `Pago de cliente recibido - Op. ${operationCode}`
              : passengerName
                ? `Pago a operador - ${passengerName} (${operationCode})`
                : `Pago a operador - Op. ${operationCode}`,
            currency: currency as "ARS" | "USD",
            amount_original: parseFloat(amount),
            exchange_rate: exchangeRate,
            amount_ars_equivalent: amountARS,
            method: ledgerMethod,
            account_id: accountId, // IMPORTANTE: Usar la cuenta financiera seleccionada por el usuario
            seller_id: sellerId,
            operator_id: payer_type === "OPERATOR" ? operatorId : null,
            receipt_number: null,
            notes: `Cuenta: ${selectedAccount.name} - ${notes || ""}`,
            created_by: user.id,
          },
          supabase
        )
        
        console.log(`✅ Movimiento contable PRINCIPAL creado:`, {
          ledgerMovementId: ledgerMovementId,
          accountId: accountId,
          accountName: selectedAccount.name,
          accountCurrency: selectedAccount.currency,
          type: ledgerType,
          direction: direction,
          amount: amount,
          currency: currency,
          effect: direction === "INCOME" ? "AUMENTA balance" : "DISMINUYE balance"
        })

        // 8. Actualizar payment con referencia al ledger_movement
        await (supabase.from("payments") as any)
          .update({ ledger_movement_id: ledgerMovementId })
          .eq("id", payment.id)

        // NOTA: Solo creamos UN movimiento contable usando la cuenta financiera seleccionada
        // El movimiento ya fue creado arriba (línea 203-224) usando accountId = financial_account_id
        // No creamos un segundo movimiento duplicado en otra cuenta
        console.log(`✅ Pago ${payment.id} creado con movimiento contable en cuenta ${accountId}`)

        // 10. Si es pago a operador, marcar operator_payment como PAID
        if (payer_type === "OPERATOR") {
          const { data: operatorPayment } = await (supabase.from("operator_payments") as any)
            .select("id")
            .eq("operation_id", operation_id)
            .eq("status", "PENDING")
            .limit(1)
            .maybeSingle()

          if (operatorPayment) {
            await (supabase.from("operator_payments") as any)
              .update({ 
                status: "PAID",
                ledger_movement_id: ledgerMovementId,
                updated_at: new Date().toISOString()
              })
              .eq("id", operatorPayment.id)
          }
        }

        console.log(`✅ Pago ${payment.id} creado con ledger ${ledgerMovementId}`)

      } catch (accountingError) {
        console.error("Error creating accounting movements:", accountingError)
        // El pago se creó, pero los movimientos contables fallaron
        // Retornamos el pago pero con una advertencia
        return NextResponse.json({ 
          payment,
          warning: "Pago creado pero hubo error en movimientos contables"
        })
      }
    }

    // Generar alertas a 30 días si el pago está asociado a una operación
    if (operation_id && status === "PENDING") {
      try {
        // Obtener datos de la operación para generar alertas
        const { data: operation } = await (supabase.from("operations") as any)
          .select("id, destination, seller_id")
          .eq("id", operation_id)
          .single()

        if (operation && operation.seller_id) {
          const { generatePaymentAlerts30Days } = await import("@/lib/alerts/generate")
          await generatePaymentAlerts30Days(supabase, operation_id, operation.seller_id, operation.destination || "Sin destino")
        }
      } catch (error) {
        console.error("Error generating payment alerts:", error)
        // No lanzamos error para no romper la creación del pago
      }
    }

    return NextResponse.json({ payment })
  } catch (error) {
    console.error("Error in POST /api/payments:", error)
    return NextResponse.json({ error: "Error al registrar pago" }, { status: 500 })
  }
}

/**
 * GET /api/payments
 * Obtener pagos, opcionalmente filtrados por operación
 * Con paginación: page (default: 1) y limit (default: 50, max: 200)
 */
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    
    const operationId = searchParams.get("operationId")
    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")
    const currency = searchParams.get("currency")
    const agencyId = searchParams.get("agencyId")
    const direction = searchParams.get("direction")
    
    // Paginación: usar page en vez de offset para mejor UX
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
    const requestedLimit = parseInt(searchParams.get("limit") || "50")
    const limit = Math.min(requestedLimit, 200) // Máximo 200
    const offset = (page - 1) * limit

    // Query base con relación a operations para obtener agency_id
    let query = supabase.from("payments").select(`
      *,
      operations:operation_id(
        id,
        agency_id,
        agencies:agency_id(
          id,
          name
        )
      )
    `, { count: "exact" })
    
    if (operationId) {
      query = query.eq("operation_id", operationId)
    }

    // Aplicar filtro de direction (INCOME o EXPENSE)
    if (direction && direction !== "ALL") {
      query = query.eq("direction", direction)
    }

    // Aplicar filtros de fecha (usar date_due como referencia principal)
    if (dateFrom) {
      query = query.gte("date_due", dateFrom)
    }
    if (dateTo) {
      query = query.lte("date_due", dateTo)
    }

    // Aplicar filtro de moneda
    if (currency && currency !== "ALL") {
      query = query.eq("currency", currency)
    }

    // Aplicar paginación y ordenamiento
    const { data: payments, error, count } = await query
      .order("date_due", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error("Error fetching payments:", error)
      return NextResponse.json({ error: "Error al obtener pagos" }, { status: 500 })
    }

    // Filtrar por agencia si está especificada (porque no podemos filtrar fácilmente por operations.agency_id en Supabase)
    let filteredPayments = payments || []
    if (agencyId && agencyId !== "ALL") {
      filteredPayments = filteredPayments.filter((p: any) => 
        p.operations?.agency_id === agencyId
      )
    }

    const totalPages = count ? Math.ceil(count / limit) : 0

    return NextResponse.json({ 
      payments: filteredPayments,
      pagination: {
        total: count || 0,
        page,
        limit,
        totalPages,
        hasMore: page < totalPages
      }
    })
  } catch (error) {
    console.error("Error in GET /api/payments:", error)
    return NextResponse.json({ error: "Error al obtener pagos" }, { status: 500 })
  }
}

/**
 * DELETE /api/payments
 * Eliminar un pago y todos sus movimientos contables asociados
 */
export async function DELETE(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    
    const paymentId = searchParams.get("paymentId")

    if (!paymentId) {
      return NextResponse.json({ error: "paymentId es requerido" }, { status: 400 })
    }

    // 1. Obtener el pago con su ledger_movement_id
    const { data: payment, error: fetchError } = await (supabase.from("payments") as any)
      .select("*, operation_id")
      .eq("id", paymentId)
      .single()

    if (fetchError || !payment) {
      return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 })
    }

    // 2. Eliminar movimiento de caja relacionado
    const { error: cashError } = await (supabase.from("cash_movements") as any)
      .delete()
      .eq("payment_id", paymentId)

    if (cashError) {
      console.warn("Warning: Could not delete cash movement:", cashError)
    }

    // 3. Si hay ledger_movement_id, eliminar el movimiento del libro mayor
    if (payment.ledger_movement_id) {
      // Primero, desmarcar operator_payment si existe
      await (supabase.from("operator_payments") as any)
        .update({ 
          status: "PENDING",
          ledger_movement_id: null,
          updated_at: new Date().toISOString()
        })
        .eq("ledger_movement_id", payment.ledger_movement_id)

      // Eliminar el ledger movement
      const { error: ledgerError } = await (supabase.from("ledger_movements") as any)
        .delete()
        .eq("id", payment.ledger_movement_id)

      if (ledgerError) {
        console.warn("Warning: Could not delete ledger movement:", ledgerError)
      }
    }

    // 4. Eliminar el pago
    const { error: deleteError } = await (supabase.from("payments") as any)
      .delete()
      .eq("id", paymentId)

    if (deleteError) {
      console.error("Error deleting payment:", deleteError)
      return NextResponse.json({ error: "Error al eliminar pago" }, { status: 500 })
    }

    console.log(`✅ Pago ${paymentId} eliminado junto con sus movimientos contables`)
    console.log(`  ✓ Cash movement eliminado`)
    console.log(`  ✓ Ledger movement eliminado (si existía)`)
    console.log(`  ✓ Operator payment revertido a PENDING (si estaba marcado como pagado)`)

    // Invalidar caché del dashboard (los KPIs cambian al eliminar un pago)
    revalidateTag(CACHE_TAGS.DASHBOARD)

    return NextResponse.json({ success: true, message: "Pago eliminado correctamente. Los movimientos contables fueron revertidos." })
  } catch (error) {
    console.error("Error in DELETE /api/payments:", error)
    return NextResponse.json({ error: "Error al eliminar pago" }, { status: 500 })
  }
}
