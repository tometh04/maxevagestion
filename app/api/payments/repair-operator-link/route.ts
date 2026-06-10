import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import {
  applyOperatorPaymentSettlement,
  findMatchingOperatorPayment,
} from "@/lib/accounting/operator-payment-settlement"

const EPSILON = 0.01

/**
 * POST /api/payments/repair-operator-link
 *
 * Repara dos variantes de desincronización entre `payments` y `operator_payments`:
 *
 * Caso A (pre-2026-05-21): payments con payer_type=OPERATOR, status=PAID pero
 *   operator_payment_id IS NULL → nunca llamó applyOperatorPaymentSettlement.
 *   Fix: vincular al operator_payment correcto y aplicar el settlement.
 *
 * Caso B: payments que tienen operator_payment_id seteado pero el settlement
 *   nunca se aplicó (applyOperatorPaymentSettlement falló silenciosamente).
 *   operator_payments.paid_amount queda en 0 aunque el pago existe como PAID.
 *   Fix: calcular delta (suma real - paid_amount actual) y re-aplicar settlement.
 *
 * Body: { operationId: string }  → repara todos los pagos de esa operación
 *       { paymentId: string }    → repara un pago específico
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
    const orgId = (user as any).org_id

    const repaired: Array<{
      paymentId?: string
      operatorPaymentId: string
      delta: number
      currency: string
      case: "A" | "B"
    }> = []
    const errors: Array<{ ref: string; error: string }> = []

    // ── Caso A: pagos sin operator_payment_id ──────────────────────────────
    let unlinkedQuery = (supabase.from("payments") as any)
      .select("id, operation_id, operator_id, amount, currency, ledger_movement_id")
      .eq("payer_type", "OPERATOR")
      .eq("direction", "EXPENSE")
      .eq("status", "PAID")
      .eq("org_id", orgId)
      .is("operator_payment_id", null)

    if (paymentId) {
      unlinkedQuery = unlinkedQuery.eq("id", paymentId)
    } else if (operationId) {
      unlinkedQuery = unlinkedQuery.eq("operation_id", operationId)
    }

    const { data: unlinkedPayments, error: fetchErrorA } = await unlinkedQuery
    if (fetchErrorA) {
      return NextResponse.json({ error: fetchErrorA.message }, { status: 500 })
    }

    for (const payment of unlinkedPayments || []) {
      try {
        const matched = await findMatchingOperatorPayment(supabase, {
          operationId: payment.operation_id,
          operatorId: payment.operator_id,
        })

        if (!matched) {
          errors.push({
            ref: payment.id,
            error: `No se encontró operator_payment pendiente para operator_id=${payment.operator_id}`,
          })
          continue
        }

        const { error: linkError } = await (supabase.from("payments") as any)
          .update({ operator_payment_id: matched.id })
          .eq("id", payment.id)
          .eq("org_id", orgId)

        if (linkError) {
          errors.push({ ref: payment.id, error: linkError.message })
          continue
        }

        await applyOperatorPaymentSettlement(supabase, matched.id, parseFloat(payment.amount), payment.ledger_movement_id)

        repaired.push({
          paymentId: payment.id,
          operatorPaymentId: matched.id,
          delta: parseFloat(payment.amount),
          currency: payment.currency,
          case: "A",
        })
      } catch (err: any) {
        errors.push({ ref: payment.id, error: err.message ?? "Error desconocido" })
      }
    }

    // ── Caso B: operator_payments con paid_amount inconsistente ───────────
    // Buscar operator_payments de la operación donde la suma real de payments
    // PAID supera lo registrado en paid_amount (delta > 0).
    // Se salta si llegamos por paymentId (no tenemos operationId para scope).
    if (operationId && !paymentId) {
      const { data: opPayments, error: fetchErrorB } = await (supabase.from("operator_payments") as any)
        .select("id, operator_id, amount, paid_amount, currency")
        .eq("operation_id", operationId)
        .eq("org_id", orgId)

      if (fetchErrorB) {
        errors.push({ ref: "operator_payments_fetch", error: fetchErrorB.message })
      } else {
        for (const op of opPayments || []) {
          try {
            // Sumar todos los payments PAID vinculados a este operator_payment
            const { data: linkedPayments, error: lpErr } = await (supabase.from("payments") as any)
              .select("id, amount, ledger_movement_id, date_paid, created_at")
              .eq("operator_payment_id", op.id)
              .eq("status", "PAID")
              .eq("org_id", orgId)

            if (lpErr || !linkedPayments) continue

            const actualPaid = linkedPayments.reduce((s: number, p: any) => s + parseFloat(p.amount || 0), 0)
            const recordedPaid = parseFloat(op.paid_amount || 0)
            const delta = actualPaid - recordedPaid

            if (delta <= EPSILON) continue // ya está bien registrado

            // Obtener el ledger_movement_id del pago más reciente para el settlement
            const sorted = [...linkedPayments].sort((a: any, b: any) => {
              const da = new Date(a.date_paid || a.created_at).getTime()
              const db = new Date(b.date_paid || b.created_at).getTime()
              return db - da
            })
            const latestLedger = sorted[0]?.ledger_movement_id ?? null

            await applyOperatorPaymentSettlement(supabase, op.id, delta, latestLedger)

            repaired.push({
              operatorPaymentId: op.id,
              delta,
              currency: op.currency,
              case: "B",
            })
          } catch (err: any) {
            errors.push({ ref: op.id, error: err.message ?? "Error desconocido" })
          }
        }
      }
    }

    return NextResponse.json({
      repaired,
      errors,
      fixed: repaired.length,
      failed: errors.length,
    })
  } catch (err: any) {
    console.error("[payments/repair-operator-link] Unexpected error:", err)
    return NextResponse.json({ error: err.message ?? "Error inesperado" }, { status: 500 })
  }
}
