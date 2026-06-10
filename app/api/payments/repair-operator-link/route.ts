import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import {
  applyOperatorPaymentSettlement,
  findMatchingOperatorPayment,
} from "@/lib/accounting/operator-payment-settlement"

/**
 * POST /api/payments/repair-operator-link
 *
 * Repara pagos a operadores (payer_type=OPERATOR, status=PAID) que no tienen
 * operator_payment_id vinculado. Estos quedaron sin vincular en pagos anteriores
 * al fix 2026-05-21, por lo que operator_payments.paid_amount nunca se actualizó
 * y la deuda sigue figurando como pendiente en la UI.
 *
 * Body: { operationId: string }  → repara todos los pagos sin vincular de esa operación
 *       { paymentId: string }    → repara un pago específico
 *
 * Returns: lista de reparaciones realizadas con { paymentId, operatorPaymentId, amount }
 */
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (!["ADMIN", "SUPER_ADMIN"].includes(user.role as string)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const { operationId, paymentId } = body as { operationId?: string; paymentId?: string }

    if (!operationId && !paymentId) {
      return NextResponse.json({ error: "Debe proveer operationId o paymentId" }, { status: 400 })
    }

    const supabase = await createServerClient()

    // Construir query para encontrar los pagos huérfanos (sin operator_payment_id)
    let query = (supabase.from("payments") as any)
      .select("id, operation_id, operator_id, amount, currency, ledger_movement_id, date_paid")
      .eq("payer_type", "OPERATOR")
      .eq("direction", "EXPENSE")
      .eq("status", "PAID")
      .eq("org_id", (user as any).org_id)
      .is("operator_payment_id", null)

    if (paymentId) {
      query = query.eq("id", paymentId)
    } else if (operationId) {
      query = query.eq("operation_id", operationId)
    }

    const { data: unlinkedPayments, error: fetchError } = await query

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!unlinkedPayments || unlinkedPayments.length === 0) {
      return NextResponse.json({
        repaired: [],
        message: "No se encontraron pagos sin vincular",
      })
    }

    const repaired: Array<{
      paymentId: string
      operatorPaymentId: string
      amount: number
      currency: string
      alreadyPaid: boolean
    }> = []
    const errors: Array<{ paymentId: string; error: string }> = []

    for (const payment of unlinkedPayments) {
      try {
        const matchedOperatorPayment = await findMatchingOperatorPayment(supabase, {
          operationId: payment.operation_id,
          operatorId: payment.operator_id,
        })

        if (!matchedOperatorPayment) {
          errors.push({
            paymentId: payment.id,
            error: `No se encontró operator_payment pendiente para operator_id=${payment.operator_id}`,
          })
          continue
        }

        // Vincular el payment al operator_payment
        const { error: linkError } = await (supabase.from("payments") as any)
          .update({ operator_payment_id: matchedOperatorPayment.id })
          .eq("id", payment.id)
          .eq("org_id", (user as any).org_id)

        if (linkError) {
          errors.push({ paymentId: payment.id, error: linkError.message })
          continue
        }

        // Aplicar el settlement (actualiza paid_amount y status en operator_payments)
        await applyOperatorPaymentSettlement(
          supabase,
          matchedOperatorPayment.id,
          parseFloat(payment.amount),
          payment.ledger_movement_id
        )

        repaired.push({
          paymentId: payment.id,
          operatorPaymentId: matchedOperatorPayment.id,
          amount: parseFloat(payment.amount),
          currency: payment.currency,
          alreadyPaid: false,
        })
      } catch (err: any) {
        errors.push({ paymentId: payment.id, error: err.message ?? "Error desconocido" })
      }
    }

    return NextResponse.json({
      repaired,
      errors,
      total: unlinkedPayments.length,
      fixed: repaired.length,
      failed: errors.length,
    })
  } catch (err: any) {
    console.error("[payments/repair-operator-link] Unexpected error:", err)
    return NextResponse.json({ error: err.message ?? "Error inesperado" }, { status: 500 })
  }
}
