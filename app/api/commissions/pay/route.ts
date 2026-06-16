/**
 * API Route: Pagar comisión
 * 
 * Crea un ledger_movement de tipo COMMISSION y marca la comisión como PAID
 */

import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import {
  createLedgerMovement,
  getOrCreateDefaultAccount,
  calculateARSEquivalent,
  validateSufficientBalance,
} from "@/lib/accounting/ledger"
import { getExchangeRate, getLatestExchangeRate, getExchangeRateWithFallback } from "@/lib/accounting/exchange-rates"

async function fetchBcraRate(): Promise<number | null> {
  try {
    const res = await fetch('https://dolarapi.com/v1/dolares/oficial', {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const rate = data.venta || data.compra
    return rate && rate > 1 ? Number(rate) : null
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()

    // Cross-tenant fix (2026-05-18): no confiar en RLS; scopear explícito.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const supabase = await createServerClient()
    const body = await request.json()

    const { commissionId, amount, currency, datePaid, method, notes, financial_account_id, exchange_rate } = body

    if (!commissionId || !amount || !datePaid || !financial_account_id) {
      return NextResponse.json(
        { error: "Faltan campos requeridos: commissionId, amount, datePaid, financial_account_id" },
        { status: 400 }
      )
    }

    // Obtener la comisión (scopeado por org)
    const { data: commission, error: commissionError } = await (supabase.from("commission_records") as any)
      .select(
        `
        *,
        operations:operation_id(id, agency_id, seller_id, seller_secondary_id)
      `
      )
      .eq("id", commissionId)
      .eq("org_id", (user as any).org_id)
      .single()

    if (commissionError || !commission) {
      return NextResponse.json({ error: "Comisión no encontrada" }, { status: 404 })
    }

    // Verificar permisos
    if (user.role === "SELLER" && commission.seller_id !== user.id) {
      return NextResponse.json(
        { error: "No tienes permiso para pagar esta comisión" },
        { status: 403 }
      )
    }

    // Verificar que la comisión no esté completamente pagada
    if (commission.status === "PAID") {
      return NextResponse.json(
        { error: "La comisión ya está completamente pagada" },
        { status: 400 }
      )
    }

    const operation = commission.operations

    // Validar que la cuenta financiera existe (scopeada por org)
    const { data: financialAccount, error: accountError } = await (supabase.from("financial_accounts") as any)
      .select("id, name, currency, is_active")
      .eq("id", financial_account_id)
      .eq("org_id", (user as any).org_id)
      .eq("is_active", true)
      .single()

    if (accountError || !financialAccount) {
      return NextResponse.json({ error: "Cuenta financiera no encontrada o inactiva" }, { status: 404 })
    }

    const accountId = financial_account_id
    const accountCur = financialAccount.currency as "ARS" | "USD"
    const commissionCur = currency as "ARS" | "USD"
    const applyAmount = parseFloat(amount) // en moneda de la comisión (reduce el saldo pendiente)

    // Determinar el movimiento de caja en la MONEDA DE LA CUENTA.
    // Permite pagar una comisión en USD desde una cuenta en ARS (o viceversa)
    // ingresando tipo de cambio, igual que en cobros/pagos de servicios.
    let exchangeRate: number | null = exchange_rate ? parseFloat(exchange_rate.toString()) : null
    let cashAmount: number // monto que sale de la cuenta, en accountCur
    let amountARS: number // equivalente en ARS para el ledger

    if (accountCur === commissionCur) {
      cashAmount = applyAmount
      if (commissionCur === "USD") {
        // Cuenta USD: TC solo para el equivalente ARS del ledger.
        if (!exchangeRate) {
          const rateDate = datePaid ? new Date(datePaid) : new Date()
          const rateResult = await getExchangeRateWithFallback(supabase, rateDate, "commissions-pay")
          exchangeRate = rateResult.rate
        }
        amountARS = calculateARSEquivalent(cashAmount, "USD", exchangeRate)
      } else {
        amountARS = cashAmount // ARS == ARS
      }
    } else {
      // Pago cross-moneda → TC obligatorio.
      if (!exchangeRate || exchangeRate <= 0) {
        return NextResponse.json(
          { error: "Debe ingresar el tipo de cambio para pagar en una moneda distinta a la de la comisión" },
          { status: 400 }
        )
      }
      if (commissionCur === "USD" && accountCur === "ARS") {
        cashAmount = Math.round(applyAmount * exchangeRate * 100) / 100
        amountARS = cashAmount
      } else if (commissionCur === "ARS" && accountCur === "USD") {
        cashAmount = Math.round((applyAmount / exchangeRate) * 100) / 100
        amountARS = applyAmount
      } else {
        return NextResponse.json({ error: "Combinación de monedas no soportada" }, { status: 400 })
      }
    }

    // Validar saldo suficiente en la cuenta (en su propia moneda) — NUNCA saldo negativo.
    const balanceCheck = await validateSufficientBalance(
      accountId,
      cashAmount,
      accountCur,
      supabase
    )

    if (!balanceCheck.valid) {
      return NextResponse.json(
        { error: balanceCheck.error || "Saldo insuficiente en cuenta para realizar el pago" },
        { status: 400 }
      )
    }

    // Calcular amount_paid acumulado (en moneda de la comisión)
    const payAmount = applyAmount
    const previouslyPaid = parseFloat(commission.amount_paid || "0")
    const totalPaid = previouslyPaid + payAmount
    const commissionTotal = parseFloat(commission.amount)
    const isFullyPaid = totalPaid >= commissionTotal

    // Validar que no se pague más de lo que se debe
    const remaining = commissionTotal - previouslyPaid
    if (payAmount > remaining + 0.01) { // 0.01 tolerance for rounding
      return NextResponse.json(
        { error: `El monto a pagar (${payAmount}) excede el restante (${remaining.toFixed(2)})` },
        { status: 400 }
      )
    }

    // Crear ledger_movement COMMISSION
    const { id: ledgerMovementId } = await createLedgerMovement(
      {
        operation_id: operation?.id || null,
        lead_id: null,
        type: "COMMISSION",
        concept: `Pago de comisión${isFullyPaid ? "" : " (parcial)"} - ${commission.operations?.id ? `Operación ${commission.operations.id.slice(0, 8)}` : "Comisión"}`,
        currency: accountCur,
        amount_original: cashAmount,
        exchange_rate: exchangeRate,
        amount_ars_equivalent: amountARS,
        method: (method || "CASH") as "CASH" | "BANK" | "MP" | "USD" | "OTHER",
        account_id: accountId,
        seller_id: commission.seller_id,
        operator_id: null,
        receipt_number: null,
        notes: notes || null,
        created_by: user.id,
      },
      supabase
    )

    // Actualizar commission_record con amount_paid y status
    const updateData: Record<string, any> = {
      amount_paid: totalPaid,
      updated_at: new Date().toISOString(),
    }
    if (isFullyPaid) {
      updateData.status = "PAID"
      updateData.date_paid = datePaid
    }

    await (supabase.from("commission_records") as any)
      .update(updateData)
      .eq("id", commissionId)
      .eq("org_id", (user as any).org_id)

    // Registrar en audit trail
    try {
      await (supabase.rpc as any)('log_audit_action', {
        p_user_id: user.id,
        p_action: 'COMMISSION_PAID',
        p_entity_type: 'commission',
        p_entity_id: commissionId,
        p_details: { amount: payAmount, seller_id: commission.seller_id }
      })
    } catch (auditError) {
      console.warn('Error logging audit action:', auditError)
    }

    return NextResponse.json({
      success: true,
      ledgerMovementId,
      isFullyPaid,
      amountPaid: totalPaid,
      remaining: Math.max(0, commissionTotal - totalPaid),
      message: isFullyPaid ? "Comisión pagada completamente" : `Pago parcial registrado. Restante: ${(commissionTotal - totalPaid).toFixed(2)}`,
    })
  } catch (error: any) {
    console.error("Error in POST /api/commissions/pay:", error)
    return NextResponse.json(
      { error: error.message || "Error al pagar comisión" },
      { status: 500 }
    )
  }
}

