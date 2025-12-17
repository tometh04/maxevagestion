import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"

/**
 * POST /api/cash/sync-movements
 * Sincroniza pagos pagados que no tienen movimientos de caja asociados
 */
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Solo admins pueden ejecutar esta acción
    if (!canPerformAction(user.role as any, "cash", "write")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    // 1. Obtener todos los pagos pagados
    const { data: paidPayments, error: paymentsError } = await supabase
      .from("payments")
      .select(`
        id,
        operation_id,
        amount,
        currency,
        direction,
        payer_type,
        method,
        date_paid,
        reference,
        status,
        operations:operation_id(
          id,
          agency_id,
          seller_id,
          operator_id
        )
      `)
      .eq("status", "PAID")
      .not("date_paid", "is", null)

    if (paymentsError) {
      console.error("Error obteniendo pagos:", paymentsError)
      return NextResponse.json({ error: "Error obteniendo pagos" }, { status: 500 })
    }

    if (!paidPayments || paidPayments.length === 0) {
      return NextResponse.json({ 
        message: "No hay pagos pagados para sincronizar",
        created: 0,
        errors: 0
      })
    }

    // 2. Obtener todos los cash_movements existentes con payment_id
    const { data: existingMovements, error: movementsError } = await supabase
      .from("cash_movements")
      .select("payment_id")
      .not("payment_id", "is", null)

    if (movementsError) {
      console.error("Error obteniendo movimientos:", movementsError)
      return NextResponse.json({ error: "Error obteniendo movimientos" }, { status: 500 })
    }

    const existingPaymentIds = new Set(
      (existingMovements || []).map((m: any) => m.payment_id)
    )

    // 3. Filtrar pagos que no tienen movimiento
    const paymentsToSync = paidPayments.filter(
      (p: any) => !existingPaymentIds.has(p.id)
    )

    if (paymentsToSync.length === 0) {
      return NextResponse.json({ 
        message: "Todos los pagos ya tienen movimientos de caja asociados",
        created: 0,
        errors: 0
      })
    }

    // 4. Para cada pago, crear el movimiento de caja
    let successCount = 0
    let errorCount = 0
    const errors: string[] = []

    for (const payment of paymentsToSync) {
      try {
        const paymentData = payment as any
        const operation = paymentData.operations || null

        // Obtener agency_id
        let agencyId = operation?.agency_id
        if (!agencyId) {
          const { data: userAgencies } = await supabase
            .from("user_agencies")
            .select("agency_id")
            .eq("user_id", user.id)
            .limit(1)

          agencyId = (userAgencies as any)?.[0]?.agency_id
        }

        // Obtener cash_box_id por defecto
        let cashBoxId = null
        if (agencyId) {
          const { data: defaultCashBox } = await supabase
            .from("cash_boxes")
            .select("id")
            .eq("agency_id", agencyId)
            .eq("currency", paymentData.currency)
            .eq("is_default", true)
            .eq("is_active", true)
            .maybeSingle()

          cashBoxId = (defaultCashBox as any)?.id || null
        }

        // Si no hay cash_box, intentar obtener uno sin agency_id
        if (!cashBoxId) {
          const { data: defaultCashBox } = await supabase
            .from("cash_boxes")
            .select("id")
            .eq("currency", paymentData.currency)
            .eq("is_default", true)
            .eq("is_active", true)
            .maybeSingle()

          cashBoxId = (defaultCashBox as any)?.id || null
        }

        // Obtener user_id
        let userId = user.id
        if (operation?.seller_id) {
          userId = operation.seller_id
        }

        // Crear el movimiento de caja
        const movementData = {
          operation_id: paymentData.operation_id,
          payment_id: paymentData.id,
          cash_box_id: cashBoxId,
          user_id: userId,
          type: paymentData.direction === "INCOME" ? "INCOME" : "EXPENSE",
          category: paymentData.direction === "INCOME" ? "SALE" : "OPERATOR_PAYMENT",
          amount: parseFloat(paymentData.amount),
          currency: paymentData.currency,
          movement_date: paymentData.date_paid,
          notes: paymentData.reference || `Pago ${paymentData.id}`,
          is_touristic: true,
        }

        const { error: insertError } = await supabase
          .from("cash_movements")
          .insert(movementData)

        if (insertError) {
          console.error(`Error creando movimiento para pago ${paymentData.id}:`, insertError)
          errorCount++
          errors.push(`Pago ${paymentData.id}: ${insertError.message}`)
        } else {
          successCount++
        }
      } catch (error: any) {
        const paymentData = payment as any
        console.error(`Error procesando pago ${paymentData.id}:`, error)
        errorCount++
        errors.push(`Pago ${paymentData.id}: ${error.message}`)
      }
    }

    return NextResponse.json({
      message: `Sincronización completada. ${successCount} movimientos creados.`,
      created: successCount,
      errors: errorCount,
      errorDetails: errors.length > 0 ? errors.slice(0, 10) : [], // Solo primeros 10 errores
      total: paymentsToSync.length
    })
  } catch (error: any) {
    console.error("Error en sincronización:", error)
    return NextResponse.json(
      { error: error.message || "Error en sincronización" },
      { status: 500 }
    )
  }
}

