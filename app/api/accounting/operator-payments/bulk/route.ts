import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import {
  createLedgerMovement,
  getOrCreateDefaultAccount,
  validateSufficientBalance,
  isAccountingOnlyAccount,
} from "@/lib/accounting/ledger"
import { getExchangeRate, getLatestExchangeRate } from "@/lib/accounting/exchange-rates"
import { roundMoney } from "@/lib/currency"

interface ToProcessItem {
  paymentItem: { operator_payment_id: string; operation_id: string; amount_to_pay: number | string }
  operatorPayment: any
  amountInPaymentCurrency: number
  amountARS: number
  newPaidAmount: number
  isFullyPaid: boolean
  operation: any
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const body = await request.json()

    const {
      payments,
      payment_account_id,
      payment_currency,
      exchange_rate,
      receipt_number,
      payment_date,
      notes,
    } = body

    if (!payments || !Array.isArray(payments) || payments.length === 0) {
      return NextResponse.json({ error: "Debe especificar al menos un pago" }, { status: 400 })
    }

    if (!payment_account_id || !receipt_number || !payment_date) {
      return NextResponse.json(
        { error: "Faltan campos requeridos (payment_account_id, receipt_number, payment_date)" },
        { status: 400 }
      )
    }

    const { data: paymentAccount, error: accountError } = await (supabase.from("financial_accounts") as any)
      .select("*")
      .eq("id", payment_account_id)
      .single()

    if (accountError || !paymentAccount) {
      return NextResponse.json({ error: "Cuenta financiera no encontrada" }, { status: 404 })
    }

    const accountCurrency = paymentAccount.currency as "ARS" | "USD"
    if (accountCurrency !== payment_currency) {
      return NextResponse.json(
        { error: `La cuenta debe estar en ${payment_currency}. Cuenta actual: ${accountCurrency}.` },
        { status: 400 }
      )
    }

    const accountingOnly = await isAccountingOnlyAccount(payment_account_id, supabase)
    if (accountingOnly) {
      return NextResponse.json(
        { error: "No se puede usar una cuenta solo contable (Cuentas por Cobrar/Pagar) para pagos." },
        { status: 400 }
      )
    }

    let exchangeRateValue: number | null = null
    if (payment_currency === "USD") {
      const rateDate = payment_date ? new Date(payment_date) : new Date()
      exchangeRateValue = await getExchangeRate(supabase, rateDate)
      if (!exchangeRateValue) exchangeRateValue = await getLatestExchangeRate(supabase)
      if (!exchangeRateValue) exchangeRateValue = 1000
    } else if (exchange_rate != null) {
      exchangeRateValue = parseFloat(String(exchange_rate))
    }

    const errors: string[] = []
    const toProcess: ToProcessItem[] = []
    let totalDebit = 0

    for (const paymentItem of payments) {
      const { operator_payment_id, operation_id, amount_to_pay } = paymentItem

      if (!operator_payment_id || !operation_id || amount_to_pay == null || Number(amount_to_pay) <= 0) {
        errors.push(`Pago inválido: ${operator_payment_id}`)
        continue
      }

      const { data: operatorPayment, error: opError } = await (supabase.from("operator_payments") as any)
        .select("*")
        .eq("id", operator_payment_id)
        .single()

      if (opError || !operatorPayment) {
        errors.push(`Pago de operador no encontrado: ${operator_payment_id}`)
        continue
      }

      const paymentCurrency = operatorPayment.currency as "ARS" | "USD"
      const amt = parseFloat(String(amount_to_pay))
      let amountInPaymentCurrency = amt
      let amountARS = 0

      if (paymentCurrency !== payment_currency) {
        if (!exchange_rate && !exchangeRateValue) {
          errors.push(`Se requiere tipo de cambio para convertir ${paymentCurrency} a ${payment_currency} en ${operator_payment_id}`)
          continue
        }
        const rate = exchangeRateValue ?? parseFloat(String(exchange_rate))
        if (payment_currency === "USD" && paymentCurrency === "ARS") {
          amountInPaymentCurrency = amt / rate
        } else if (payment_currency === "ARS" && paymentCurrency === "USD") {
          amountInPaymentCurrency = amt * rate
        }
      }

      amountInPaymentCurrency = roundMoney(amountInPaymentCurrency)
      if (payment_currency === "USD") {
        amountARS = roundMoney(amountInPaymentCurrency * (exchangeRateValue ?? 1000))
      } else {
        amountARS = amountInPaymentCurrency
      }

      const currentPaidAmount = parseFloat(operatorPayment.paid_amount || "0") || 0
      const newPaidAmount = roundMoney(currentPaidAmount + amt)
      const totalAmount = parseFloat(operatorPayment.amount)
      const isFullyPaid = newPaidAmount >= totalAmount

      const { data: operation } = await (supabase.from("operations") as any)
        .select("seller_id, operator_id, agency_id")
        .eq("id", operation_id)
        .single()

      toProcess.push({
        paymentItem: { operator_payment_id, operation_id, amount_to_pay },
        operatorPayment,
        amountInPaymentCurrency,
        amountARS,
        newPaidAmount,
        isFullyPaid,
        operation: operation || null,
      })
      totalDebit += amountInPaymentCurrency
    }

    totalDebit = roundMoney(totalDebit)

    if (toProcess.length === 0) {
      return NextResponse.json(
        { error: "Ningún pago válido para procesar.", details: errors },
        { status: 400 }
      )
    }

    const balanceCheck = await validateSufficientBalance(
      payment_account_id,
      totalDebit,
      payment_currency as "ARS" | "USD",
      supabase
    )
    if (!balanceCheck.valid) {
      return NextResponse.json(
        { error: balanceCheck.error ?? "Saldo insuficiente en la cuenta para el total a pagar." },
        { status: 400 }
      )
    }

    let ledgerMethod: "CASH" | "BANK" | "MP" | "USD" | "OTHER" = "OTHER"
    if (paymentAccount.type === "CASH_ARS" || paymentAccount.type === "CASH_USD") ledgerMethod = "CASH"
    else if (paymentAccount.type === "CHECKING_ARS" || paymentAccount.type === "CHECKING_USD") ledgerMethod = "BANK"
    else if (paymentAccount.type === "CREDIT_CARD") ledgerMethod = "MP"
    else if (paymentAccount.type === "SAVINGS_ARS" || paymentAccount.type === "SAVINGS_USD") ledgerMethod = "USD"

    const { data: costosChart } = await (supabase.from("chart_of_accounts") as any)
      .select("id")
      .eq("account_code", "4.2.01")
      .eq("is_active", true)
      .maybeSingle()

    let costAccountId: string
    if (costosChart) {
      const { data: costosFA } = await (supabase.from("financial_accounts") as any)
        .select("id")
        .eq("chart_account_id", costosChart.id)
        .eq("is_active", true)
        .maybeSingle()
      if (costosFA?.id) {
        costAccountId = costosFA.id
      } else {
        const { data: newFA, error: insErr } = await (supabase.from("financial_accounts") as any)
          .insert({
            name: "Costo de Operadores",
            type: "CASH_ARS",
            currency: "ARS",
            chart_account_id: costosChart.id,
            initial_balance: 0,
            is_active: true,
            created_by: user.id,
          })
          .select("id")
          .single()
        if (insErr || !newFA?.id) {
          costAccountId = await getOrCreateDefaultAccount("CASH", "ARS", user.id, supabase)
        } else {
          costAccountId = newFA.id
        }
      }
    } else {
      costAccountId = await getOrCreateDefaultAccount("CASH", "ARS", user.id, supabase)
    }

    const processedPayments: { operator_payment_id: string; amount_paid: number | string; new_status: string }[] = []

    for (const item of toProcess) {
      try {
        const { operator_payment_id, operation_id, amount_to_pay } = item.paymentItem
        const paymentCurrency = item.operatorPayment.currency as "ARS" | "USD"
        const sellerId = item.operation?.seller_id ?? null
        const operatorId = item.operation?.operator_id ?? null

        const ledgerMovementResult = await createLedgerMovement(
          {
            operation_id,
            lead_id: null,
            type: "EXPENSE",
            concept: `Pago masivo a operador - Operación ${operation_id.slice(0, 8)}`,
            currency: payment_currency as "ARS" | "USD",
            amount_original: item.amountInPaymentCurrency,
            exchange_rate: payment_currency === "USD" ? exchangeRateValue : (exchange_rate != null ? exchangeRateValue : null),
            amount_ars_equivalent: item.amountARS,
            method: ledgerMethod,
            account_id: payment_account_id,
            seller_id: sellerId,
            operator_id: operatorId,
            receipt_number,
            notes: notes ?? `Pago masivo - ${receipt_number}`,
            created_by: user.id,
          },
          supabase
        )

        const costAmount = parseFloat(String(amount_to_pay))
        const costARS = paymentCurrency === "USD"
          ? roundMoney(costAmount * (exchangeRateValue ?? 1000))
          : costAmount

        await createLedgerMovement(
          {
            operation_id,
            lead_id: null,
            type: "OPERATOR_PAYMENT",
            concept: `Costo operador - Operación ${operation_id.slice(0, 8)}`,
            currency: paymentCurrency,
            amount_original: roundMoney(costAmount),
            exchange_rate: paymentCurrency === "USD" ? (exchangeRateValue ?? 1000) : null,
            amount_ars_equivalent: roundMoney(costARS),
            method: ledgerMethod,
            account_id: costAccountId,
            seller_id: sellerId,
            operator_id: operatorId,
            receipt_number,
            notes: notes ?? `Pago masivo - ${receipt_number}`,
            created_by: user.id,
          },
          supabase
        )

        const updateData: any = {
          paid_amount: item.newPaidAmount,
          updated_at: new Date().toISOString(),
        }
        if (item.isFullyPaid) {
          updateData.status = "PAID"
          updateData.ledger_movement_id = ledgerMovementResult.id
        }

        const { error: updateError } = await (supabase.from("operator_payments") as any)
          .update(updateData)
          .eq("id", operator_payment_id)

        if (updateError) {
          errors.push(`Error actualizando ${operator_payment_id}: ${updateError.message}`)
          continue
        }

        processedPayments.push({
          operator_payment_id,
          amount_paid: amount_to_pay,
          new_status: item.isFullyPaid ? "PAID" : "PENDING",
        })
      } catch (e: any) {
        errors.push(`Error procesando ${item.paymentItem.operator_payment_id}: ${e?.message ?? String(e)}`)
      }
    }

    if (processedPayments.length === 0) {
      return NextResponse.json(
        { error: "No se pudo procesar ningún pago.", details: errors },
        { status: 500 }
      )
    }

    if (errors.length > 0) {
      return NextResponse.json({
        success: true,
        processed: processedPayments,
        errors,
        warning: `Se procesaron ${processedPayments.length} de ${payments.length} pagos. Algunos tuvieron errores.`,
      })
    }

    return NextResponse.json({
      success: true,
      processed: processedPayments,
      message: `Se procesaron ${processedPayments.length} pago(s) correctamente`,
    })
  } catch (e: any) {
    console.error("Error in POST /api/accounting/operator-payments/bulk:", e)
    return NextResponse.json(
      { error: e?.message ?? "Error al procesar pagos masivos" },
      { status: 500 }
    )
  }
}
