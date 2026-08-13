import { NextResponse } from "next/server"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"
import { invalidateBalanceCache } from "@/lib/accounting/ledger"
import { revertOperatorPaymentSettlement } from "@/lib/accounting/operator-payment-settlement"
import { removePaymentCounterpartMovement } from "@/lib/accounting/payment-counterparts"

/**
 * DELETE /api/expenses/cc-payment/[id]
 * Delete a CC payment group and all its associated movements
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()

    if (!canPerformAction(user, "accounting", "write") && !canPerformAction(user, "cash", "write")) {
      return NextResponse.json({ error: "No tiene permiso para eliminar pagos de tarjeta" }, { status: 403 })
    }

    // Cross-tenant fix (2026-05-18): exigir org_id explícito, no confiar en RLS.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }
    const userOrgId = (user as any).org_id as string

    const { id } = await params
    const supabase = await createServerClient()
    // adminDb justificado: la cascade delete tiene que pasar por
    // expense_receipts/ledger_movements/cash_movements que pueden estar
    // protegidos por triggers/RLS estrictos. Validamos org_id en cada delete.
    const adminDb = createAdminClient() as any

    const { data: group, error: fetchError } = await (supabase.from("cc_payment_groups") as any)
      .select("id, source_account_id, org_id")
      .eq("id", id)
      .eq("org_id", userOrgId)
      .single()

    if (fetchError || !group) {
      return NextResponse.json({ error: "Pago de tarjeta no encontrado" }, { status: 404 })
    }

    // Get all cash_movements in this group (filtro explícito org)
    const { data: movements } = await (supabase.from("cash_movements") as any)
      .select("id, ledger_movement_id, financial_account_id, payment_id")
      .eq("cc_payment_group_id", id)
      .eq("org_id", userOrgId)

    // Revertir liquidaciones de deuda de operador hechas desde este resumen.
    // Los items "cancela deuda" crearon un `payments` (con su ledger OPERATOR_PAYMENT,
    // el settlement de la deuda y la contrapartida CxP); su cash_movement lleva
    // payment_id. Sin revertir esto, borrar el resumen dejaría la deuda en PAID y
    // el ledger/payment/contrapartida huérfanos (bug detectado en verificación).
    // Los items de gasto NO tienen payment_id → no entran acá.
    const settlementPaymentIds = Array.from(
      new Set((movements || []).map((m: any) => m.payment_id).filter(Boolean))
    ) as string[]

    for (const paymentId of settlementPaymentIds) {
      const { data: payment } = await (supabase.from("payments") as any)
        .select("id, operation_id, operator_id, operator_payment_id, payer_type, direction, currency, amount, reference, date_paid, ledger_movement_id")
        .eq("id", paymentId)
        .maybeSingle()
      if (!payment) continue

      // 1. Revertir la imputación a la deuda (paid_amount/status vuelven).
      if (payment.payer_type === "OPERATOR" && payment.operator_payment_id) {
        try {
          await revertOperatorPaymentSettlement(supabase, {
            operatorPaymentId: payment.operator_payment_id,
            paymentAmount: parseFloat(payment.amount),
            currentPaymentId: payment.id,
            removedLedgerMovementId: payment.ledger_movement_id,
          })
        } catch (e) {
          console.error("Error revirtiendo settlement en cc-payment DELETE:", e)
        }
      }

      // 2. Quitar la contrapartida CxP (best-effort, igual que el DELETE de pagos).
      try {
        await removePaymentCounterpartMovement({
          supabase,
          paymentId: payment.id,
          operationId: payment.operation_id,
          direction: payment.direction,
          payerType: payment.payer_type,
          currency: payment.currency,
          amount: parseFloat(payment.amount),
          reference: payment.reference || null,
          datePaid: payment.date_paid || null,
          excludeLedgerMovementId: payment.ledger_movement_id || null,
        })
      } catch (e) {
        console.warn("No se pudo quitar la contrapartida CxP:", e)
      }

      // 3. Borrar el ledger del settlement (el que impactó la cuenta origen).
      if (payment.ledger_movement_id) {
        let del = adminDb.from("ledger_movements").delete().eq("id", payment.ledger_movement_id)
        if (group.org_id) del = del.eq("org_id", group.org_id)
        await del
      }

      // 4. Borrar el payment (cash_movements.payment_id es ON DELETE SET NULL).
      await adminDb.from("payments").delete().eq("id", payment.id)
    }

    if (movements && movements.length > 0) {
      const movementIds = movements.map((m: any) => m.id)

      // Todos los deletes acotados por org_id validado (defensa-en-profundidad)
      let receiptsDelete = adminDb.from("expense_receipts").delete().in("cash_movement_id", movementIds)
      await receiptsDelete

      const ledgerIds = movements.map((m: any) => m.ledger_movement_id).filter(Boolean)
      if (ledgerIds.length > 0) {
        let lmDelete = adminDb.from("ledger_movements").delete().in("id", ledgerIds)
        if (group.org_id) lmDelete = lmDelete.eq("org_id", group.org_id)
        await lmDelete
      }

      let cmDelete = adminDb.from("cash_movements").delete().in("id", movementIds)
      if (group.org_id) cmDelete = cmDelete.eq("org_id", group.org_id)
      await cmDelete
    }

    // Delete the group itself (acotado por org_id validado)
    let groupDelete = adminDb.from("cc_payment_groups").delete().eq("id", id)
    if (group.org_id) groupDelete = groupDelete.eq("org_id", group.org_id)
    const { error: deleteError } = await groupDelete

    if (deleteError) {
      console.error("Error deleting cc_payment_group:", deleteError)
      return NextResponse.json({ error: "Error al eliminar pago de tarjeta" }, { status: 500 })
    }

    // Invalidate balance cache de todas las cuentas afectadas (incluye las de
    // cada pata en pagos multi-moneda, tomadas de los cash_movements del grupo).
    const affectedAccounts = new Set<string>()
    if (group.source_account_id) affectedAccounts.add(group.source_account_id)
    for (const m of movements || []) {
      if (m.financial_account_id) affectedAccounts.add(m.financial_account_id)
    }
    for (const accId of Array.from(affectedAccounts)) {
      await invalidateBalanceCache(accId)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error in DELETE /api/expenses/cc-payment/[id]:", error)
    return NextResponse.json({ error: error.message || "Error al eliminar" }, { status: 500 })
  }
}
