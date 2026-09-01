import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import { createLedgerMovement, calculateARSEquivalent } from "@/lib/accounting/ledger"
import { applyOperatorPaymentSettlement } from "@/lib/accounting/operator-payment-settlement"
import { createPaymentCounterpartMovement } from "@/lib/accounting/payment-counterparts"
import { roundMoney } from "@/lib/currency"

type AppSupabaseClient = SupabaseClient<Database>

export interface SettleOperatorDebtForStatementParams {
  /** Server client (RLS, org-scoped). Usado para payments/ledger/operator_payments/counterpart. */
  supabase: AppSupabaseClient
  /** Admin client. Usado para el cash_movement (triggers requieren bypass RLS). */
  adminDb: any
  orgId: string
  userId: string
  /** Deuda a cancelar (operator_payment). Debe ser un id puntual, no ambiguo. */
  operatorPaymentId: string
  operationId: string
  operatorId: string
  /** Monto a imputar, en la moneda del resumen (== moneda de la deuda). */
  amount: number
  currency: "ARS" | "USD"
  exchangeRate: number | null
  /** Cuenta origen desde donde sale la plata del resumen. */
  accountId: string
  /** ISO date del pago del resumen. */
  paymentDate: string
  /** Grupo del resumen, para que la deuda saldada figure bajo el pago de tarjeta. */
  ccPaymentGroupId: string
  cashBoxId: string | null
  notes?: string | null
}

/**
 * Liquida UNA deuda de operador como parte del pago de un resumen de tarjeta.
 *
 * Replica el camino canónico de POST /api/payments para un pago a operador
 * (payer_type OPERATOR / direction EXPENSE), reutilizando los mismos primitivos
 * contables — NO reimplementa la lógica de imputación:
 *   1. payments (source CC_STATEMENT, status PAID)
 *   2. ledger_movement OPERATOR_PAYMENT desde la cuenta origen
 *   3. link ledger ↔ payment
 *   4. cash_movement (category OPERATOR_PAYMENT) taggeado al cc_payment_group_id
 *   5. applyOperatorPaymentSettlement → baja la deuda (paid_amount/status)
 *   6. createPaymentCounterpartMovement → contrapartida CxP
 *
 * Si un paso crítico (ledger/cash) falla, revierte lo creado y lanza, para que
 * el caller aborte el ítem sin dejar contabilidad a medias.
 */
export async function settleOperatorDebtForStatement(
  params: SettleOperatorDebtForStatementParams
): Promise<{ paymentId: string; ledgerMovementId: string }> {
  const {
    supabase,
    adminDb,
    orgId,
    userId,
    operatorPaymentId,
    operationId,
    operatorId,
    amount,
    currency,
    exchangeRate,
    accountId,
    paymentDate,
    ccPaymentGroupId,
    cashBoxId,
    notes,
  } = params

  const amountNum = roundMoney(Number(amount))
  const amountARS = roundMoney(calculateARSEquivalent(amountNum, currency, exchangeRate))
  const amountUsd =
    currency === "USD"
      ? amountNum
      : exchangeRate && exchangeRate > 0
        ? roundMoney(amountNum / exchangeRate)
        : null
  const datePaidOnly = paymentDate.split("T")[0]

  // 1. payments row (status PAID; ledger se linkea abajo).
  const { data: payment, error: paymentError } = await (supabase.from("payments") as any)
    .insert({
      operation_id: operationId,
      operator_id: operatorId,
      operator_payment_id: operatorPaymentId,
      org_id: orgId,
      // El CHECK payments_source_check sólo admite MANUAL/OPERATOR_BULK/
      // LEGACY_SETTLEMENT. Usamos MANUAL (neutro); la trazabilidad del resumen
      // la da el cash_movement.cc_payment_group_id + method "Tarjeta de Crédito".
      source: "MANUAL",
      payer_type: "OPERATOR",
      direction: "EXPENSE",
      method: "Tarjeta de Crédito",
      amount: amountNum,
      currency,
      exchange_rate: exchangeRate,
      amount_usd: amountUsd,
      date_paid: datePaidOnly,
      date_due: datePaidOnly,
      status: "PAID",
      reference: notes || null,
      created_by_user_id: userId,
    })
    .select("id")
    .single()

  if (paymentError || !payment?.id) {
    throw new Error(`No se pudo registrar el pago de la deuda: ${paymentError?.message || "sin id"}`)
  }

  // 2. ledger_movement OPERATOR_PAYMENT desde la cuenta origen.
  let ledgerMovementId: string
  try {
    const res = await createLedgerMovement(
      {
        operation_id: operationId,
        lead_id: null,
        type: "OPERATOR_PAYMENT",
        concept: `Pago a operador (resumen TC) - Op. ${operationId.slice(0, 8)}`,
        currency,
        amount_original: amountNum,
        exchange_rate: exchangeRate,
        amount_ars_equivalent: amountARS,
        method: "MP",
        account_id: accountId,
        seller_id: null,
        operator_id: operatorId,
        receipt_number: null,
        notes: notes || null,
        created_by: userId,
        org_id: orgId,
        movement_date: paymentDate,
      },
      supabase
    )
    ledgerMovementId = res.id

    // VIB-142: asiento del pago (Debe Cuentas por Pagar / Haber cuenta
    // financiera). No bloquea la liquidación.
    try {
      const { createMovementJournalEntry, COUNTERPART_CODES } = await import(
        "./movement-journal"
      )
      await createMovementJournalEntry(
        {
          movementId: ledgerMovementId,
          counterpartCode: COUNTERPART_CODES.OPERATOR_PAYMENT,
          direction: "OUT",
          orgId,
        },
        supabase
      )
    } catch (journalError) {
      console.error("Error asentando el pago de deuda de operador:", journalError)
    }
  } catch (err: any) {
    // Rollback del payment: aún no impactó saldo ni deuda.
    await (supabase.from("payments") as any).delete().eq("id", payment.id).eq("org_id", orgId)
    throw new Error(`No se pudo crear el asiento del pago: ${err?.message || String(err)}`)
  }

  // 3. link ledger ↔ payment.
  const { error: linkError } = await (supabase.from("payments") as any)
    .update({ ledger_movement_id: ledgerMovementId })
    .eq("id", payment.id)
  if (linkError) {
    await (supabase.from("ledger_movements") as any).delete().eq("id", ledgerMovementId).eq("org_id", orgId)
    await (supabase.from("payments") as any).delete().eq("id", payment.id).eq("org_id", orgId)
    throw new Error(`No se pudo vincular el pago al libro mayor: ${linkError.message}`)
  }

  // 4. cash_movement (aparece en caja) taggeado al resumen.
  const { error: cashError } = await adminDb.from("cash_movements").insert({
    operation_id: operationId,
    payment_id: payment.id,
    org_id: orgId,
    cash_box_id: cashBoxId,
    financial_account_id: accountId,
    user_id: userId,
    type: "EXPENSE",
    category: "OPERATOR_PAYMENT",
    amount: amountNum,
    currency,
    movement_date: datePaidOnly,
    notes: notes || null,
    is_touristic: true,
    cc_payment_group_id: ccPaymentGroupId,
  })
  if (cashError) {
    await (supabase.from("ledger_movements") as any).delete().eq("id", ledgerMovementId).eq("org_id", orgId)
    await (supabase.from("payments") as any).delete().eq("id", payment.id).eq("org_id", orgId)
    throw new Error(`No se pudo crear el movimiento de caja: ${cashError.message}`)
  }

  // 5. Bajar la deuda del operador (paid_amount/status, clampeado).
  await applyOperatorPaymentSettlement(supabase, operatorPaymentId, amountNum, ledgerMovementId)

  // 6. Contrapartida CxP (best-effort, como en /api/payments).
  await createPaymentCounterpartMovement({
    supabase,
    paymentId: payment.id,
    operationId,
    direction: "EXPENSE",
    payerType: "OPERATOR",
    currency,
    amount: amountNum,
    method: "Tarjeta de Crédito",
    reference: notes || null,
    datePaid: datePaidOnly,
    exchangeRate,
    selectedFinancialAccountId: accountId,
    sellerId: null,
    operatorId,
    userId,
  })

  return { paymentId: payment.id, ledgerMovementId }
}
