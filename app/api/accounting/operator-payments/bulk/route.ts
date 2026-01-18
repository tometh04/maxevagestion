import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import {
  createLedgerMovement,
  calculateARSEquivalent,
  getOrCreateDefaultAccount,
} from "@/lib/accounting/ledger"
import { getExchangeRate, getLatestExchangeRate } from "@/lib/accounting/exchange-rates"

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const body = await request.json()

    const {
      payments, // Array<{ operator_payment_id, operation_id, amount_to_pay }>
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
      return NextResponse.json({ error: "Faltan campos requeridos (payment_account_id, receipt_number, payment_date)" }, { status: 400 })
    }

    // Validar que payment_account_id existe
    const { data: paymentAccount, error: accountError } = await (supabase.from("financial_accounts") as any)
      .select("*")
      .eq("id", payment_account_id)
      .single()

    if (accountError || !paymentAccount) {
      return NextResponse.json({ error: "Cuenta financiera no encontrada" }, { status: 404 })
    }

    // Obtener tipo de cambio si es necesario (para USD)
    let exchangeRateValue: number | null = null
    if (payment_currency === "USD") {
      const rateDate = payment_date ? new Date(payment_date) : new Date()
      exchangeRateValue = await getExchangeRate(supabase, rateDate)
      if (!exchangeRateValue) {
        exchangeRateValue = await getLatestExchangeRate(supabase)
      }
      if (!exchangeRateValue) {
        exchangeRateValue = 1000 // Fallback
      }
    } else if (exchange_rate) {
      // Si se proporciona TC manual, usarlo
      exchangeRateValue = parseFloat(exchange_rate)
    }

    // Procesar cada pago
    const processedPayments = []
    const errors: string[] = []

    for (const paymentItem of payments) {
      const { operator_payment_id, operation_id, amount_to_pay } = paymentItem

      if (!operator_payment_id || !operation_id || !amount_to_pay || amount_to_pay <= 0) {
        errors.push(`Pago inválido: ${operator_payment_id}`)
        continue
      }

      try {
        // 1. Obtener operator_payment actual
        const { data: operatorPayment, error: opError } = await (supabase.from("operator_payments") as any)
          .select("*")
          .eq("id", operator_payment_id)
          .single()

        if (opError || !operatorPayment) {
          errors.push(`Pago de operador no encontrado: ${operator_payment_id}`)
          continue
        }

        // 2. Calcular nuevo paid_amount
        const currentPaidAmount = parseFloat(operatorPayment.paid_amount || "0") || 0
        const newPaidAmount = currentPaidAmount + parseFloat(amount_to_pay)
        const totalAmount = parseFloat(operatorPayment.amount)
        const paymentCurrency = operatorPayment.currency

        // 3. Determinar si el pago está completo
        const isFullyPaid = newPaidAmount >= totalAmount
        const newStatus = isFullyPaid ? "PAID" : "PENDING"

        // 4. Convertir amount_to_pay a la moneda del pago si es necesario
        let amountInPaymentCurrency = parseFloat(amount_to_pay)
        let amountARS = 0

        if (paymentCurrency === payment_currency) {
          // Misma moneda, no necesita conversión
          amountInPaymentCurrency = parseFloat(amount_to_pay)
        } else {
          // Conversión necesaria usando exchange_rate
          if (!exchange_rate || !exchangeRateValue) {
            errors.push(`Se requiere tipo de cambio para convertir ${paymentCurrency} a ${payment_currency} en pago ${operator_payment_id}`)
            continue
          }

          if (payment_currency === "USD" && paymentCurrency === "ARS") {
            // Pago en USD, operación en ARS: convertir ARS a USD
            amountInPaymentCurrency = parseFloat(amount_to_pay) / exchangeRateValue
          } else if (payment_currency === "ARS" && paymentCurrency === "USD") {
            // Pago en ARS, operación en USD: convertir USD a ARS
            amountInPaymentCurrency = parseFloat(amount_to_pay) * exchangeRateValue
          }
        }

        // Calcular equivalente en ARS para ledger
        if (payment_currency === "USD") {
          amountARS = amountInPaymentCurrency * (exchangeRateValue || 1000)
        } else {
          amountARS = amountInPaymentCurrency
        }

        // 5. Obtener datos de la operación
        const { data: operation } = await (supabase.from("operations") as any)
          .select("seller_id, operator_id, agency_id")
          .eq("id", operation_id)
          .single()

        const sellerId = operation?.seller_id || null
        const operatorId = operation?.operator_id || null

        // 6. Determinar método de pago según tipo de cuenta
        let ledgerMethod: "CASH" | "BANK" | "MP" | "USD" | "OTHER" = "OTHER"
        if (paymentAccount.type === "CASH_ARS" || paymentAccount.type === "CASH_USD") {
          ledgerMethod = "CASH"
        } else if (paymentAccount.type === "CHECKING_ARS" || paymentAccount.type === "CHECKING_USD") {
          ledgerMethod = "BANK"
        } else if (paymentAccount.type === "CREDIT_CARD") {
          ledgerMethod = "MP"
        } else if (paymentAccount.type === "SAVINGS_ARS" || paymentAccount.type === "SAVINGS_USD") {
          ledgerMethod = "USD"
        }

        // 7. Crear ledger_movement en cuenta de origen (EXPENSE - salida)
        const ledgerMovementResult = await createLedgerMovement(
          {
            operation_id: operation_id,
            lead_id: null,
            type: "EXPENSE", // Salida de dinero
            concept: `Pago masivo a operador - Operación ${operation_id.slice(0, 8)}`,
            currency: payment_currency as "ARS" | "USD",
            amount_original: amountInPaymentCurrency,
            exchange_rate: payment_currency === "USD" ? exchangeRateValue : (exchange_rate ? exchangeRateValue : null),
            amount_ars_equivalent: amountARS,
            method: ledgerMethod,
            account_id: payment_account_id,
            seller_id: sellerId,
            operator_id: operatorId,
            receipt_number: receipt_number,
            notes: notes || `Pago masivo - ${receipt_number}`,
            created_by: user.id,
          },
          supabase
        )

        // 8. Crear ledger_movement en cuenta de RESULTADO (COSTO)
        // Obtener cuenta de costo por operador
        const costAccount = await getOrCreateDefaultAccount(
          "RESULTADO",
          "COSTOS",
          null,
          supabase
        )

        await createLedgerMovement(
          {
            operation_id: operation_id,
            lead_id: null,
            type: "OPERATOR_PAYMENT", // Costo de operador
            concept: `Costo operador - Operación ${operation_id.slice(0, 8)}`,
            currency: paymentCurrency as "ARS" | "USD",
            amount_original: parseFloat(amount_to_pay), // Monto en moneda de la operación
            exchange_rate: paymentCurrency === "USD" ? (exchangeRateValue || 1000) : null,
            amount_ars_equivalent: paymentCurrency === "USD" 
              ? parseFloat(amount_to_pay) * (exchangeRateValue || 1000)
              : parseFloat(amount_to_pay),
            method: ledgerMethod,
            account_id: costAccount.id,
            seller_id: sellerId,
            operator_id: operatorId,
            receipt_number: receipt_number,
            notes: notes || `Pago masivo - ${receipt_number}`,
            created_by: user.id,
          },
          supabase
        )

        // 9. Actualizar operator_payment
        const updateData: any = {
          paid_amount: newPaidAmount,
          updated_at: new Date().toISOString(),
        }

        if (isFullyPaid) {
          updateData.status = "PAID"
          updateData.ledger_movement_id = ledgerMovementResult.id
        }

        const { error: updateError } = await (supabase.from("operator_payments") as any)
          .update(updateData)
          .eq("id", operator_payment_id)

        if (updateError) {
          errors.push(`Error actualizando pago ${operator_payment_id}: ${updateError.message}`)
          continue
        }

        processedPayments.push({
          operator_payment_id,
          amount_paid: amount_to_pay,
          new_status: newStatus,
        })

      } catch (error: any) {
        console.error(`Error processing payment ${operator_payment_id}:`, error)
        errors.push(`Error procesando pago ${operator_payment_id}: ${error.message}`)
      }
    }

    if (errors.length > 0 && processedPayments.length === 0) {
      // Si todos fallaron, retornar error
      return NextResponse.json(
        { error: "Error al procesar pagos", details: errors },
        { status: 500 }
      )
    }

    // Si algunos fallaron pero otros se procesaron, retornar warning
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

  } catch (error: any) {
    console.error("Error in POST /api/accounting/operator-payments/bulk:", error)
    return NextResponse.json(
      { error: error.message || "Error al procesar pagos masivos" },
      { status: 500 }
    )
  }
}
