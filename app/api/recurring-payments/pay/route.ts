import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import {
  createLedgerMovement,
  calculateARSEquivalent,
  getOrCreateDefaultAccount,
  validateSufficientBalance,
} from "@/lib/accounting/ledger"
import { getExchangeRate } from "@/lib/accounting/exchange-rates"
import { calculateNextDueDate } from "@/lib/accounting/recurring-payments"

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Verificar permisos
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "No tiene permiso para procesar pagos" }, { status: 403 })
    }

    const body = await request.json()
    const {
      recurring_payment_id,
      financial_account_id,
      payment_date,
      reference,
      exchange_rate,
    } = body

    if (!recurring_payment_id || !financial_account_id || !payment_date) {
      return NextResponse.json(
        { error: "Faltan campos requeridos: recurring_payment_id, financial_account_id, payment_date" },
        { status: 400 }
      )
    }

    // 1. Obtener el gasto recurrente
    const { data: recurringPayment, error: recurringError } = await (supabase
      .from("recurring_payments") as any)
      .select("*")
      .eq("id", recurring_payment_id)
      .single()

    if (recurringError || !recurringPayment) {
      return NextResponse.json(
        { error: "Gasto recurrente no encontrado" },
        { status: 404 }
      )
    }

    // 2. Obtener la cuenta financiera seleccionada
    const { data: financialAccount, error: accountError } = await (supabase
      .from("financial_accounts") as any)
      .select("*")
      .eq("id", financial_account_id)
      .eq("is_active", true)
      .single()

    if (accountError || !financialAccount) {
      return NextResponse.json(
        { error: "Cuenta financiera no encontrada o inactiva" },
        { status: 404 }
      )
    }

    // 3. Determinar monedas y tipo de cambio
    const expenseCurrency = recurringPayment.currency as "ARS" | "USD"
    const paymentCurrency = financialAccount.currency as "ARS" | "USD"
    const needsConversion = expenseCurrency !== paymentCurrency

    if (needsConversion && !exchange_rate) {
      return NextResponse.json(
        { error: "Tipo de cambio requerido para convertir monedas" },
        { status: 400 }
      )
    }

    // 4. Calcular montos
    const expenseAmount = parseFloat(recurringPayment.amount)
    let paymentAmount = expenseAmount
    let finalExchangeRate = exchange_rate || null

    if (needsConversion) {
      if (expenseCurrency === "ARS" && paymentCurrency === "USD") {
        // Pagar en USD un gasto en ARS: dividir por TC
        paymentAmount = expenseAmount / (exchange_rate || 1)
      } else if (expenseCurrency === "USD" && paymentCurrency === "ARS") {
        // Pagar en ARS un gasto en USD: multiplicar por TC
        paymentAmount = expenseAmount * (exchange_rate || 1)
      }
      finalExchangeRate = exchange_rate
    } else {
      // Si no hay conversión, obtener TC para cálculo de ARS equivalente
      if (expenseCurrency === "USD") {
        finalExchangeRate = await getExchangeRate(supabase, new Date(payment_date))
      }
    }

    const amountARS = calculateARSEquivalent(
      paymentAmount,
      paymentCurrency,
      finalExchangeRate
    )

    // 5. Determinar método de pago según tipo de cuenta
    let ledgerMethod: "CASH" | "BANK" | "MP" | "USD" | "OTHER" = "OTHER"
    if (financialAccount.type.includes("CASH")) {
      ledgerMethod = "CASH"
    } else if (financialAccount.type.includes("CHECKING") || financialAccount.type.includes("SAVINGS")) {
      ledgerMethod = "BANK"
    } else if (financialAccount.type.includes("MP")) {
      ledgerMethod = "MP"
    }

    // 6. Validar saldo suficiente (NUNCA permitir saldo negativo)
    const balanceCheck = await validateSufficientBalance(
      financial_account_id,
      paymentAmount,
      paymentCurrency,
      supabase
    )
    
    if (!balanceCheck.valid) {
      return NextResponse.json(
        { error: balanceCheck.error || "Saldo insuficiente en cuenta para realizar el pago" },
        { status: 400 }
      )
    }

    // 7. Crear movimiento en ledger (EXPENSE) en la cuenta seleccionada
    // Este movimiento impacta directamente en el balance de la cuenta financiera
    const { id: ledgerMovementId } = await createLedgerMovement(
      {
        operation_id: null, // Los gastos recurrentes no están vinculados a operaciones
        lead_id: null,
        type: "EXPENSE",
        concept: `Gasto recurrente: ${recurringPayment.description}`,
        currency: paymentCurrency,
        amount_original: paymentAmount,
        exchange_rate: finalExchangeRate,
        amount_ars_equivalent: amountARS,
        method: ledgerMethod,
        account_id: financial_account_id,
        seller_id: null,
        operator_id: recurringPayment.operator_id || null,
        receipt_number: reference || null,
        notes: reference || null,
        created_by: user.id,
      },
      supabase
    )

    // 8. Actualizar el gasto recurrente
    // Calcular próxima fecha de vencimiento
    const nextDueDate = calculateNextDueDate(
      recurringPayment.next_due_date || recurringPayment.start_date,
      recurringPayment.frequency
    )

    const { error: updateError } = await (supabase.from("recurring_payments") as any)
      .update({
        next_due_date: nextDueDate,
        last_generated_date: payment_date,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recurring_payment_id)

    if (updateError) {
      console.error("Error updating recurring payment:", updateError)
      // No fallar si hay error al actualizar, el pago ya se procesó
    }

    return NextResponse.json({
      success: true,
      message: "Pago procesado exitosamente",
      ledger_movement_id: ledgerMovementId,
      next_due_date: nextDueDate,
    })
  } catch (error: any) {
    console.error("Error in POST /api/recurring-payments/pay:", error)
    return NextResponse.json(
      { error: error.message || "Error al procesar el pago" },
      { status: 500 }
    )
  }
}
