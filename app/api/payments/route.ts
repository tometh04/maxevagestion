import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import {
  createLedgerMovement,
  calculateARSEquivalent,
  getOrCreateDefaultAccount,
} from "@/lib/accounting/ledger"
import {
  getExchangeRate,
  getLatestExchangeRate,
} from "@/lib/accounting/exchange-rates"

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
      date_paid,
      date_due,
      status,
      notes,
    } = body

    if (!operation_id || !payer_type || !direction || !amount || !currency) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    // 1. Crear el pago en tabla payments
    const paymentData = {
      operation_id,
      payer_type,
      direction,
      method: method || "Otro",
      amount,
      currency,
      date_paid: date_paid || null,
      date_due: date_due || date_paid,
      status: status || "PAID",
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

    // Solo crear movimientos contables si el pago está PAID
    if (status === "PAID" || !status) {
      try {
        // 2. Obtener datos de la operación para seller_id y operator_id
        const { data: operation } = await (supabase.from("operations") as any)
          .select("seller_id, operator_id, agency_id")
          .eq("id", operation_id)
          .single()

        const sellerId = operation?.seller_id || null
        const operatorId = operation?.operator_id || null
        const agencyId = operation?.agency_id

        // 3. Calcular tasa de cambio si es USD
        let exchangeRate: number | null = null
        if (currency === "USD") {
          const rateDate = date_paid ? new Date(date_paid) : new Date()
          exchangeRate = await getExchangeRate(supabase, rateDate)
          if (!exchangeRate) {
            exchangeRate = await getLatestExchangeRate(supabase)
          }
          if (!exchangeRate) {
            exchangeRate = 1000 // Fallback
          }
        }

        const amountARS = calculateARSEquivalent(
          parseFloat(amount),
          currency as "ARS" | "USD",
          exchangeRate
        )

        // 4. Determinar tipo de cuenta y obtenerla
        const accountType = currency === "USD" ? "USD" : "CASH"
        const accountId = await getOrCreateDefaultAccount(
          accountType,
          currency as "ARS" | "USD",
          user.id,
          supabase
        )

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

        // 7. Crear movimiento en libro mayor (ledger_movements)
        const { id: ledgerMovementId } = await createLedgerMovement(
          {
            operation_id,
            lead_id: null,
            type: ledgerType,
            concept: direction === "INCOME" 
              ? `Pago de cliente - Operación ${operation_id.slice(0, 8)}`
              : `Pago a operador - Operación ${operation_id.slice(0, 8)}`,
            currency: currency as "ARS" | "USD",
            amount_original: parseFloat(amount),
            exchange_rate: exchangeRate,
            amount_ars_equivalent: amountARS,
            method: ledgerMethod,
            account_id: accountId,
            seller_id: sellerId,
            operator_id: payer_type === "OPERATOR" ? operatorId : null,
            receipt_number: null,
            notes: notes || null,
            created_by: user.id,
          },
          supabase
        )

        // 8. Actualizar payment con referencia al ledger_movement
        await (supabase.from("payments") as any)
          .update({ ledger_movement_id: ledgerMovementId })
          .eq("id", payment.id)

        // 9. Crear movimiento de caja (cash_movements)
        // Obtener caja por defecto
        const { data: defaultCashBox } = await supabase
          .from("cash_boxes")
          .select("id")
          .eq("agency_id", agencyId || "")
          .eq("currency", currency)
          .eq("is_default", true)
          .eq("is_active", true)
          .maybeSingle()

        const cashMovementData = {
          operation_id,
          cash_box_id: (defaultCashBox as any)?.id || null,
          user_id: user.id,
          type: direction === "INCOME" ? "INCOME" : "EXPENSE",
          category: direction === "INCOME" ? "SALE" : "OPERATOR_PAYMENT",
          amount: parseFloat(amount),
          currency,
          movement_date: date_paid || new Date().toISOString(),
          notes: notes || null,
          is_touristic: true,
          payment_id: payment.id, // Referencia al pago
        }

        const { data: cashMovement, error: cashError } = await (supabase.from("cash_movements") as any)
          .insert(cashMovementData)
          .select("id")
          .single()

        if (cashError) {
          console.warn("Warning: Could not create cash movement:", cashError)
          // No fallamos, el pago ya se creó
        }

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

    return NextResponse.json({ payment })
  } catch (error) {
    console.error("Error in POST /api/payments:", error)
    return NextResponse.json({ error: "Error al registrar pago" }, { status: 500 })
  }
}

/**
 * GET /api/payments
 * Obtener pagos, opcionalmente filtrados por operación
 */
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    
    const operationId = searchParams.get("operationId")

    let query = supabase.from("payments").select("*")
    
    if (operationId) {
      query = query.eq("operation_id", operationId)
    }

    const { data: payments, error } = await query.order("date_paid", { ascending: false })

    if (error) {
      console.error("Error fetching payments:", error)
      return NextResponse.json({ error: "Error al obtener pagos" }, { status: 500 })
    }

    return NextResponse.json({ payments })
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

    return NextResponse.json({ success: true, message: "Pago eliminado correctamente" })
  } catch (error) {
    console.error("Error in DELETE /api/payments:", error)
    return NextResponse.json({ error: "Error al eliminar pago" }, { status: 500 })
  }
}
