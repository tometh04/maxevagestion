import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import {
  createLedgerMovement,
  calculateARSEquivalent,
  getOrCreateDefaultAccount,
  validateSufficientBalance,
} from "@/lib/accounting/ledger"
import { autoCalculateFXForPayment } from "@/lib/accounting/fx"
import { markOperatorPaymentAsPaid } from "@/lib/accounting/operator-payments"
import { getExchangeRate } from "@/lib/accounting/exchange-rates"
import { createPaymentReceivedMessage } from "@/lib/whatsapp/whatsapp-service"

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const body = await request.json()
    const { paymentId, datePaid, reference, financial_account_id, exchange_rate } = body

    if (!paymentId || !datePaid || !financial_account_id) {
      return NextResponse.json({ error: "Faltan parámetros (paymentId, datePaid, financial_account_id son requeridos)" }, { status: 400 })
    }

    // Validar que la cuenta financiera existe
    const { data: financialAccount, error: accountError } = await (supabase.from("financial_accounts") as any)
      .select("id, currency")
      .eq("id", financial_account_id)
      .eq("is_active", true)
      .single()

    if (accountError || !financialAccount) {
      return NextResponse.json({ error: "Cuenta financiera no encontrada o inactiva" }, { status: 404 })
    }

    // Get payment to get operation_id, payer_type, etc.
    const paymentsSelect = supabase.from("payments") as any
    const { data: payment } = await paymentsSelect
      .select(`
        operation_id, 
        amount, 
        currency, 
        direction, 
        payer_type, 
        method,
        status,
        ledger_movement_id,
        operations:operation_id(
          id,
          agency_id,
          seller_id,
          seller_secondary_id,
          operator_id,
          sale_currency,
          operator_cost_currency
        )
      `)
      .eq("id", paymentId)
      .single()

    if (!payment) {
      return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 })
    }

    const paymentData = payment as any
    const operation = paymentData.operations || null

    // Verificar si el pago ya está marcado como PAID y tiene ledger_movement_id
    // Si ya tiene ledger_movement_id, significa que los movimientos contables ya fueron creados
    // Solo actualizamos la fecha y referencia, pero no creamos movimientos duplicados
    const alreadyHasLedgerMovement = paymentData.status === "PAID" && paymentData.ledger_movement_id

    // Calcular amount_usd si hay exchange_rate proporcionado
    let amountUsd: number | null = null
    if (exchange_rate && paymentData.currency === "ARS") {
      amountUsd = parseFloat(paymentData.amount) / exchange_rate
    } else if (paymentData.currency === "USD") {
      amountUsd = parseFloat(paymentData.amount)
    }

    // Update payment
    const paymentsTable = supabase.from("payments") as any
    const updateData: any = {
      date_paid: datePaid,
      status: "PAID",
      reference: reference || null,
      updated_at: new Date().toISOString(),
    }
    
    // Si se proporcionó exchange_rate, guardarlo y calcular amount_usd
    if (exchange_rate) {
      updateData.exchange_rate = exchange_rate
      if (amountUsd !== null) {
        updateData.amount_usd = amountUsd
      }
    }
    
    await paymentsTable
      .update(updateData)
      .eq("id", paymentId)

    // Si el pago ya tiene ledger_movement_id, no crear movimientos duplicados
    if (alreadyHasLedgerMovement) {
      console.log(`⚠️ Pago ${paymentId} ya tiene ledger_movement_id ${paymentData.ledger_movement_id}, omitiendo creación de movimientos contables`)
      return NextResponse.json({ 
        success: true, 
        payment: { ...paymentData, date_paid: datePaid, status: "PAID", reference },
        message: "Pago actualizado (movimientos contables ya existían)"
      })
    }

    // Get agency_id from operation or user agencies
    let agencyId = operation?.agency_id
    if (!agencyId) {
      const { data: userAgencies } = await supabase
        .from("user_agencies")
        .select("agency_id")
        .eq("user_id", user.id)
        .limit(1)
      agencyId = (userAgencies as any)?.[0]?.agency_id
    }

    // Verificar si ya existe un cash_movement para este pago
    const { data: existingCashMovement } = await supabase
      .from("cash_movements")
      .select("id")
      .eq("payment_id", paymentId)
      .maybeSingle()

    // Solo crear cash_movement si no existe uno ya vinculado a este pago
    if (!existingCashMovement) {
      // Get default cash box for agency
      const { data: defaultCashBox } = await supabase
        .from("cash_boxes")
        .select("id")
        .eq("agency_id", agencyId || "")
        .eq("currency", paymentData.currency)
        .eq("is_default", true)
        .eq("is_active", true)
        .maybeSingle()

      // Create cash movement (mantener compatibilidad)
      const movementsTable = supabase.from("cash_movements") as any
      const { error: cashMovementError } = await movementsTable.insert({
        operation_id: paymentData.operation_id,
        payment_id: paymentId, // Vincular con el pago
        cash_box_id: (defaultCashBox as any)?.id || null,
        user_id: user.id,
        type: paymentData.direction === "INCOME" ? "INCOME" : "EXPENSE",
        category: paymentData.direction === "INCOME" ? "SALE" : "OPERATOR_PAYMENT",
        amount: paymentData.amount,
        currency: paymentData.currency,
        movement_date: datePaid,
        notes: reference || null,
        is_touristic: true, // Payments are always touristic
      })

      if (cashMovementError) {
        console.warn(`⚠️ Error creando cash_movement para pago ${paymentId}:`, cashMovementError)
        // No fallar, continuar con el flujo
      }
    } else {
      console.log(`⚠️ Pago ${paymentId} ya tiene cash_movement ${(existingCashMovement as any).id}, omitiendo creación`)
    }

    // ============================================
    // FASE 1: REDUCIR ACTIVO/PASIVO Y CREAR MOVIMIENTO EN RESULTADO
    // ============================================
    
    // 1. Reducir "Cuentas por Cobrar" (ACTIVO) si es INCOME
    //    o "Cuentas por Pagar" (PASIVO) si es EXPENSE
    if (paymentData.direction === "INCOME") {
      // Reducir "Cuentas por Cobrar" (ACTIVO) - el cliente pagó
      const { data: accountsReceivableChart } = await (supabase.from("chart_of_accounts") as any)
        .select("id")
        .eq("account_code", "1.1.03")
        .eq("is_active", true)
        .maybeSingle()
      
      if (accountsReceivableChart) {
        const { data: accountsReceivableAccount } = await (supabase.from("financial_accounts") as any)
          .select("id")
          .eq("chart_account_id", accountsReceivableChart.id)
          .eq("currency", paymentData.currency)
          .eq("is_active", true)
          .maybeSingle()
        
        if (accountsReceivableAccount) {
          // IMPORTANTE: Verificar que "Cuentas por Cobrar" NO sea la misma cuenta que la seleccionada
          // Si es la misma, NO crear este movimiento para evitar duplicación
          if (accountsReceivableAccount.id === financial_account_id) {
            console.log(`⚠️ "Cuentas por Cobrar" es la misma cuenta seleccionada (${financial_account_id}). Omitiendo movimiento duplicado.`)
          } else {
            // Calcular exchange rate si es USD
            let exchangeRate: number | null = null
            if (paymentData.currency === "USD") {
              exchangeRate = await getExchangeRate(supabase, new Date(datePaid))
              if (!exchangeRate) {
                const { getLatestExchangeRate } = await import("@/lib/accounting/exchange-rates")
                exchangeRate = await getLatestExchangeRate(supabase)
              }
              if (!exchangeRate) {
                console.warn(`No exchange rate found for USD payment ${paymentId}`)
                exchangeRate = 1000 // Fallback temporal
              }
            }
            
            const amountARS = calculateARSEquivalent(
              parseFloat(paymentData.amount),
              paymentData.currency as "ARS" | "USD",
              exchangeRate
            )
            
            // Crear movimiento INCOME en "Cuentas por Cobrar" para REDUCIR el activo
            // NOTA: Este movimiento NO afecta el balance de la cuenta financiera seleccionada
            await createLedgerMovement(
              {
                operation_id: paymentData.operation_id || null,
                lead_id: null,
                type: "INCOME", // INCOME reduce el activo "Cuentas por Cobrar"
                concept: `Cobro de cliente - Operación ${paymentData.operation_id?.slice(0, 8) || ""}`,
                currency: paymentData.currency as "ARS" | "USD",
                amount_original: parseFloat(paymentData.amount),
                exchange_rate: exchangeRate,
                amount_ars_equivalent: amountARS,
                method: paymentData.method === "Efectivo" ? "CASH" : paymentData.method === "Transferencia" ? "BANK" : "OTHER",
                account_id: accountsReceivableAccount.id, // Cuenta "Cuentas por Cobrar" (diferente a la seleccionada)
                seller_id: operation?.seller_id || null,
                operator_id: null,
                receipt_number: reference || null,
                notes: `Pago recibido: ${reference || ""}`,
                created_by: user.id,
              },
              supabase
            )
            console.log(`✅ Reducido "Cuentas por Cobrar" (${accountsReceivableAccount.id}) por pago de cliente ${paymentId}`)
          }
        }
      }
    } else if (paymentData.payer_type === "OPERATOR") {
      // Reducir "Cuentas por Pagar" (PASIVO) - pagaste al operador
      const { data: accountsPayableChart } = await (supabase.from("chart_of_accounts") as any)
        .select("id")
        .eq("account_code", "2.1.01")
        .eq("is_active", true)
        .maybeSingle()
      
      if (accountsPayableChart) {
        const { data: accountsPayableAccount } = await (supabase.from("financial_accounts") as any)
          .select("id")
          .eq("chart_account_id", accountsPayableChart.id)
          .eq("currency", paymentData.currency)
          .eq("is_active", true)
          .maybeSingle()
        
        if (accountsPayableAccount) {
          // IMPORTANTE: Verificar que "Cuentas por Pagar" NO sea la misma cuenta que la seleccionada
          // Si es la misma, NO crear este movimiento para evitar duplicación
          if (accountsPayableAccount.id === financial_account_id) {
            console.log(`⚠️ "Cuentas por Pagar" es la misma cuenta seleccionada (${financial_account_id}). Omitiendo movimiento duplicado.`)
          } else {
            // Calcular exchange rate si es USD
            let exchangeRate: number | null = null
            if (paymentData.currency === "USD") {
              exchangeRate = await getExchangeRate(supabase, new Date(datePaid))
              if (!exchangeRate) {
                const { getLatestExchangeRate } = await import("@/lib/accounting/exchange-rates")
                exchangeRate = await getLatestExchangeRate(supabase)
              }
              if (!exchangeRate) {
                console.warn(`No exchange rate found for USD payment ${paymentId}`)
                exchangeRate = 1000 // Fallback temporal
              }
            }
            
            const amountARS = calculateARSEquivalent(
              parseFloat(paymentData.amount),
              paymentData.currency as "ARS" | "USD",
              exchangeRate
            )
            
            // Crear movimiento INCOME en "Cuentas por Pagar" para REDUCIR el pasivo
            // NOTA: Este movimiento NO afecta el balance de la cuenta financiera seleccionada
            await createLedgerMovement(
              {
                operation_id: paymentData.operation_id || null,
                lead_id: null,
                type: "INCOME", // INCOME reduce el pasivo "Cuentas por Pagar"
                concept: `Pago a operador - Operación ${paymentData.operation_id?.slice(0, 8) || ""}`,
                currency: paymentData.currency as "ARS" | "USD",
                amount_original: parseFloat(paymentData.amount),
                exchange_rate: exchangeRate,
                amount_ars_equivalent: amountARS,
                method: paymentData.method === "Efectivo" ? "CASH" : paymentData.method === "Transferencia" ? "BANK" : "OTHER",
                account_id: accountsPayableAccount.id, // Cuenta "Cuentas por Pagar" (diferente a la seleccionada)
                seller_id: operation?.seller_id || null,
                operator_id: operation?.operator_id || null,
                receipt_number: reference || null,
                notes: `Pago realizado: ${reference || ""}`,
                created_by: user.id,
              },
              supabase
            )
            console.log(`✅ Reducido "Cuentas por Pagar" (${accountsPayableAccount.id}) por pago a operador ${paymentId}`)
          }
        }
      }
    }
    
    // 2. Crear movimiento en la cuenta financiera seleccionada
    // IMPORTANTE: Este es el movimiento principal que afecta el balance de la cuenta seleccionada
    // Usar la cuenta financiera proporcionada por el frontend
    const accountId = financial_account_id

    // Validar que la moneda de la cuenta coincide con la del pago
    if (financialAccount.currency !== paymentData.currency) {
      return NextResponse.json({ error: `La cuenta financiera debe estar en ${paymentData.currency}` }, { status: 400 })
    }

    // Validar que la cuenta seleccionada NO sea la misma que "Cuentas por Cobrar/Pagar"
    // para evitar duplicar movimientos
    let accountsReceivableAccountId: string | null = null
    let accountsPayableAccountId: string | null = null
    
    if (paymentData.direction === "INCOME") {
      const { data: accountsReceivableChart } = await (supabase.from("chart_of_accounts") as any)
        .select("id")
        .eq("account_code", "1.1.03")
        .eq("is_active", true)
        .maybeSingle()
      
      if (accountsReceivableChart) {
        const { data: accountsReceivableAccount } = await (supabase.from("financial_accounts") as any)
          .select("id")
          .eq("chart_account_id", accountsReceivableChart.id)
          .eq("currency", paymentData.currency)
          .eq("is_active", true)
          .maybeSingle()
        
        accountsReceivableAccountId = accountsReceivableAccount?.id || null
      }
    } else if (paymentData.payer_type === "OPERATOR") {
      const { data: accountsPayableChart } = await (supabase.from("chart_of_accounts") as any)
        .select("id")
        .eq("account_code", "2.1.01")
        .eq("is_active", true)
        .maybeSingle()
      
      if (accountsPayableChart) {
        const { data: accountsPayableAccount } = await (supabase.from("financial_accounts") as any)
          .select("id")
          .eq("chart_account_id", accountsPayableChart.id)
          .eq("currency", paymentData.currency)
          .eq("is_active", true)
          .maybeSingle()
        
        accountsPayableAccountId = accountsPayableAccount?.id || null
      }
    }

    if (accountId === accountsReceivableAccountId || accountId === accountsPayableAccountId) {
      console.warn(`⚠️ La cuenta seleccionada es la misma que "Cuentas por Cobrar/Pagar". Esto puede causar duplicación de movimientos.`)
    }

    console.log(`💰 Creando movimiento contable PRINCIPAL en cuenta seleccionada:`, {
      accountId: accountId,
      accountCurrency: financialAccount.currency,
      direction: paymentData.direction,
      amount: paymentData.amount,
      currency: paymentData.currency,
      paymentId: paymentId,
      accountsReceivableAccountId: accountsReceivableAccountId,
      accountsPayableAccountId: accountsPayableAccountId,
      isSameAccount: accountId === accountsReceivableAccountId || accountId === accountsPayableAccountId
    })

    // Calcular ARS equivalent
    // Priorizar exchange_rate proporcionado por el frontend
    // Si currency = ARS y se proporcionó exchange_rate, usarlo para convertir a USD
    // Si currency = USD y no se proporcionó exchange_rate, obtenerlo de la tabla
    let exchangeRate: number | null = exchange_rate || null
    
    if (!exchangeRate) {
      // Solo calcular automáticamente si no se proporcionó desde el frontend
      if (paymentData.currency === "USD") {
        const rateDate = datePaid ? new Date(datePaid) : new Date()
        exchangeRate = await getExchangeRate(supabase, rateDate)
        
        // Si no hay tasa para esa fecha, usar la más reciente disponible
        if (!exchangeRate) {
          const { getLatestExchangeRate } = await import("@/lib/accounting/exchange-rates")
          exchangeRate = await getLatestExchangeRate(supabase)
        }
        
        // Fallback: si aún no hay tasa, usar 1000 como último recurso
        if (!exchangeRate) {
          console.warn(`No exchange rate found for ${rateDate.toISOString()}, using fallback 1000`)
          exchangeRate = 1000
        }
      } else if (paymentData.currency === "ARS" && exchange_rate) {
        // Si el pago es en ARS y se proporcionó TC, usarlo
        exchangeRate = exchange_rate
      }
    }
    
    const amountARS = calculateARSEquivalent(
      parseFloat(paymentData.amount),
      paymentData.currency as "ARS" | "USD",
      exchangeRate
    )
    
    // Obtener seller_id y operator_id de la operación si existe
    const sellerId = operation?.seller_id || null
    const operatorId = operation?.operator_id || null
    
    // Mapear method del payment a ledger method
    const methodMap: Record<string, "CASH" | "BANK" | "MP" | "USD" | "OTHER"> = {
      "Efectivo": "CASH",
      "Transferencia": "BANK",
      "Mercado Pago": "MP",
      "MercadoPago": "MP",
      "MP": "MP",
      "USD": "USD",
    }
    const ledgerMethod = paymentData.method 
      ? (methodMap[paymentData.method] || "OTHER")
      : "CASH"

    // Validar saldo suficiente para egresos (NUNCA permitir saldo negativo)
    if (paymentData.direction === "EXPENSE" || paymentData.payer_type === "OPERATOR") {
      const amountToCheck = parseFloat(paymentData.amount)
      const balanceCheck = await validateSufficientBalance(
        accountId,
        amountToCheck,
        paymentData.currency as "ARS" | "USD",
        supabase
      )
      
      if (!balanceCheck.valid) {
        return NextResponse.json(
          { error: balanceCheck.error || "Saldo insuficiente en cuenta para realizar el pago" },
          { status: 400 }
        )
      }
    }

    // Determinar tipo de ledger movement
    const ledgerType =
      paymentData.direction === "INCOME"
        ? "INCOME"
        : paymentData.payer_type === "OPERATOR"
        ? "OPERATOR_PAYMENT"
        : "EXPENSE"

    // Crear ledger movement PRINCIPAL en la cuenta financiera seleccionada
    // Este es el movimiento que afecta directamente el balance de la cuenta seleccionada
    const { id: ledgerMovementId } = await createLedgerMovement(
      {
        operation_id: paymentData.operation_id || null,
        lead_id: null,
        type: ledgerType,
        concept:
          paymentData.direction === "INCOME"
            ? `Pago de cliente recibido en cuenta ${financialAccount.currency}`
            : `Pago a operador desde cuenta ${financialAccount.currency}`,
        currency: paymentData.currency as "ARS" | "USD",
        amount_original: parseFloat(paymentData.amount),
        exchange_rate: exchangeRate,
        amount_ars_equivalent: amountARS,
        method: ledgerMethod,
        account_id: accountId, // IMPORTANTE: Usar la cuenta financiera seleccionada por el usuario
        seller_id: sellerId,
        operator_id: operatorId,
        receipt_number: reference || null,
        notes: `Cuenta: ${financialAccount.name || accountId} - ${reference || ""}`,
        created_by: user.id,
      },
      supabase
    )
    
    console.log(`✅ Movimiento contable PRINCIPAL creado:`, {
      ledgerMovementId: ledgerMovementId,
      accountId: accountId,
      accountName: financialAccount.name || "N/A",
      accountCurrency: financialAccount.currency,
      type: ledgerType,
      direction: paymentData.direction,
      amount: paymentData.amount,
      currency: paymentData.currency,
      effect: paymentData.direction === "INCOME" ? "AUMENTA balance" : "DISMINUYE balance"
    })

    // NOTA: Solo creamos movimientos contables necesarios:
    // 1. Movimiento para reducir Cuentas por Cobrar/Pagar (líneas 172-294) - parte de la contabilidad de doble entrada
    // 2. Movimiento en la cuenta financiera seleccionada (líneas 365-388) - este es el que afecta el balance de la cuenta
    // NO creamos un tercer movimiento duplicado
    console.log(`✅ Movimiento contable creado en cuenta ${accountId} por pago ${paymentId}`)

    // Si es un pago a operador, marcar operator_payment como PAID
    if (paymentData.payer_type === "OPERATOR" && paymentData.operation_id) {
      try {
        // Buscar el operator_payment correspondiente
        const { data: operatorPayment } = await (supabase.from("operator_payments") as any)
          .select("id")
          .eq("operation_id", paymentData.operation_id)
          .eq("status", "PENDING")
          .limit(1)
          .maybeSingle()

        if (operatorPayment) {
          await markOperatorPaymentAsPaid(supabase, operatorPayment.id, ledgerMovementId)
          console.log(`✅ Marcado operator_payment ${operatorPayment.id} como PAID`)
        }
      } catch (error) {
        console.error("Error marcando operator_payment como PAID:", error)
        // No lanzamos error para no romper el flujo
      }
    }

    // Calcular FX automáticamente si hay diferencia de moneda
    if (paymentData.operation_id) {
      try {
        await autoCalculateFXForPayment(
          supabase,
          paymentData.operation_id,
          paymentData.currency as "ARS" | "USD",
          parseFloat(paymentData.amount),
          paymentData.currency === "USD" ? exchangeRate : null,
          user.id
        )
        
        // Si se generó un FX_LOSS, verificar si debemos generar alerta
        // (la alerta se generará automáticamente en generateAllAlerts)
      } catch (error) {
        console.error("Error calculando FX:", error)
        // No lanzamos error para no romper el flujo
      }
    }

    // ============================================
    // CREAR MENSAJE WHATSAPP AUTOMÁTICO
    // ============================================
    // Solo para pagos de cliente (INCOME), no para pagos a operadores
    if (paymentData.direction === "INCOME" && paymentData.operation_id) {
      try {
        // Obtener cliente principal de la operación
        const { data: operationCustomer } = await (supabase.from("operation_customers") as any)
          .select(`
            customers:customer_id (
              id, first_name, last_name, phone
            )
          `)
          .eq("operation_id", paymentData.operation_id)
          .eq("role", "MAIN")
          .single()

        const customer = (operationCustomer as any)?.customers

        if (customer?.phone) {
          // Contar pagos pendientes restantes
          const { count: remainingPayments } = await (supabase.from("payments") as any)
            .select("id", { count: "exact", head: true })
            .eq("operation_id", paymentData.operation_id)
            .eq("direction", "CUSTOMER_TO_AGENCY")
            .eq("status", "PENDING")

          // Obtener destino de la operación
          const { data: opData } = await (supabase.from("operations") as any)
            .select("destination, agency_id")
            .eq("id", paymentData.operation_id)
            .single()

          if (opData) {
            await createPaymentReceivedMessage(
              supabase,
              {
                id: paymentId,
                amount: parseFloat(paymentData.amount),
                currency: paymentData.currency,
                operation_id: paymentData.operation_id,
              },
              customer,
              opData,
              remainingPayments || 0
            )
          }
        }
      } catch (error) {
        console.error("Error creando mensaje WhatsApp:", error)
        // No lanzamos error para no romper el flujo principal
      }
    }

    return NextResponse.json({ success: true, ledger_movement_id: ledgerMovementId })
  } catch (error: any) {
    console.error("Error en mark-paid:", error)
    return NextResponse.json(
      { error: error.message || "Error al actualizar" },
      { status: 500 }
    )
  }
}

