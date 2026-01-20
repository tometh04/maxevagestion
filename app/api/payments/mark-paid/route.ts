import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import {
  createLedgerMovement,
  calculateARSEquivalent,
  getOrCreateDefaultAccount,
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
    const { paymentId, datePaid, reference, financial_account_id } = body

    if (!paymentId || !datePaid) {
      return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 })
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

    // Update payment
    const paymentsTable = supabase.from("payments") as any
    await paymentsTable
      .update({
        date_paid: datePaid,
        status: "PAID",
        reference: reference || null,
        updated_at: new Date().toISOString(),
      })
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
              account_id: accountsReceivableAccount.id,
              seller_id: operation?.seller_id || null,
              operator_id: null,
              receipt_number: reference || null,
              notes: `Pago recibido: ${reference || ""}`,
              created_by: user.id,
            },
            supabase
          )
          console.log(`✅ Reducido "Cuentas por Cobrar" por pago de cliente ${paymentId}`)
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
              account_id: accountsPayableAccount.id,
              seller_id: operation?.seller_id || null,
              operator_id: operation?.operator_id || null,
              receipt_number: reference || null,
              notes: `Pago realizado: ${reference || ""}`,
              created_by: user.id,
            },
            supabase
          )
          console.log(`✅ Reducido "Cuentas por Pagar" por pago a operador ${paymentId}`)
        }
      }
    }
    
    // 2. Crear movimiento en RESULTADO (INGRESOS/COSTOS/GASTOS)
    // Determinar cuenta financiera según el tipo de movimiento y el plan de cuentas
    let accountId: string
    
    if (paymentData.direction === "INCOME") {
      // INGRESOS: usar cuenta de RESULTADO > INGRESOS > "4.1.01" - Ventas de Viajes
      const { data: ingresosChart } = await (supabase.from("chart_of_accounts") as any)
        .select("id")
        .eq("account_code", "4.1.01")
        .eq("is_active", true)
        .maybeSingle()
      
      if (ingresosChart) {
        // Buscar o crear financial_account vinculada a esta cuenta del plan
        let ingresosFinancialAccount = await (supabase.from("financial_accounts") as any)
          .select("id")
          .eq("chart_account_id", ingresosChart.id)
          .eq("is_active", true)
          .maybeSingle()
        
        if (!ingresosFinancialAccount) {
          const { data: newFA } = await (supabase.from("financial_accounts") as any)
            .insert({
              name: "Ventas de Viajes",
              type: "CASH_ARS", // Tipo genérico, no importa para RESULTADO
              currency: paymentData.currency as "ARS" | "USD",
              chart_account_id: ingresosChart.id,
              initial_balance: 0,
              is_active: true,
              created_by: user.id,
            })
            .select("id")
            .single()
          ingresosFinancialAccount = newFA
        }
        accountId = ingresosFinancialAccount.id
      } else {
        // Fallback si no existe el plan de cuentas
        const accountType = paymentData.currency === "USD" ? "USD" : "CASH"
        accountId = await getOrCreateDefaultAccount(
          accountType,
          paymentData.currency as "ARS" | "USD",
          user.id,
          supabase
        )
      }
    } else if (paymentData.payer_type === "OPERATOR") {
      // COSTOS: usar cuenta de RESULTADO > COSTOS > "4.2.01" - Costo de Operadores
      const { data: costosChart } = await (supabase.from("chart_of_accounts") as any)
        .select("id")
        .eq("account_code", "4.2.01")
        .eq("is_active", true)
        .maybeSingle()
      
      if (costosChart) {
        let costosFinancialAccount = await (supabase.from("financial_accounts") as any)
          .select("id")
          .eq("chart_account_id", costosChart.id)
          .eq("is_active", true)
          .maybeSingle()
        
        if (!costosFinancialAccount) {
          const { data: newFA } = await (supabase.from("financial_accounts") as any)
            .insert({
              name: "Costo de Operadores",
              type: "CASH_ARS",
              currency: paymentData.currency as "ARS" | "USD",
              chart_account_id: costosChart.id,
              initial_balance: 0,
              is_active: true,
              created_by: user.id,
            })
            .select("id")
            .single()
          costosFinancialAccount = newFA
        }
        accountId = costosFinancialAccount.id
      } else {
        // Fallback
    const accountType = paymentData.currency === "USD" ? "USD" : "CASH"
        accountId = await getOrCreateDefaultAccount(
      accountType,
      paymentData.currency as "ARS" | "USD",
      user.id,
      supabase
    )
      }
    } else {
      // GASTOS: usar cuenta de RESULTADO > GASTOS > "4.3.03" - Comisiones de Vendedores (o genérico)
      const { data: gastosChart } = await (supabase.from("chart_of_accounts") as any)
        .select("id")
        .eq("account_code", "4.3.01") // Gastos Administrativos como default
        .eq("is_active", true)
        .maybeSingle()
      
      if (gastosChart) {
        let gastosFinancialAccount = await (supabase.from("financial_accounts") as any)
          .select("id")
          .eq("chart_account_id", gastosChart.id)
          .eq("is_active", true)
          .maybeSingle()
        
        if (!gastosFinancialAccount) {
          const { data: newFA } = await (supabase.from("financial_accounts") as any)
            .insert({
              name: "Gastos Administrativos",
              type: "CASH_ARS",
              currency: paymentData.currency as "ARS" | "USD",
              chart_account_id: gastosChart.id,
              initial_balance: 0,
              is_active: true,
              created_by: user.id,
            })
            .select("id")
            .single()
          gastosFinancialAccount = newFA
        }
        accountId = gastosFinancialAccount.id
      } else {
        // Fallback
        const accountType = paymentData.currency === "USD" ? "USD" : "CASH"
        accountId = await getOrCreateDefaultAccount(
          accountType,
          paymentData.currency as "ARS" | "USD",
          user.id,
          supabase
        )
      }
    }

    // Calcular ARS equivalent
    // Si currency = ARS, amount_ars_equivalent = amount_original
    // Si currency = USD, necesitamos exchange_rate de la tabla
    let exchangeRate: number | null = null
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

    // Determinar tipo de ledger movement
    const ledgerType =
      paymentData.direction === "INCOME"
        ? "INCOME"
        : paymentData.payer_type === "OPERATOR"
        ? "OPERATOR_PAYMENT"
        : "EXPENSE"

    // Crear ledger movement
    const { id: ledgerMovementId } = await createLedgerMovement(
      {
        operation_id: paymentData.operation_id || null,
        lead_id: null,
        type: ledgerType,
        concept:
          paymentData.direction === "INCOME"
            ? "Pago de cliente"
            : "Pago a operador",
        currency: paymentData.currency as "ARS" | "USD",
        amount_original: parseFloat(paymentData.amount),
        exchange_rate: paymentData.currency === "USD" ? exchangeRate : null,
        amount_ars_equivalent: amountARS,
        method: ledgerMethod,
        account_id: accountId,
        seller_id: sellerId,
        operator_id: operatorId,
        receipt_number: reference || null,
        notes: reference || null,
        created_by: user.id,
      },
      supabase
    )

    // ============================================
    // 3. REGISTRAR EN CUENTA DE CAJA SEGÚN MÉTODO DE PAGO
    // ============================================
    // Si el método es "Transferencia" y se proporcionó financial_account_id, usar esa cuenta
    let cashAccountId: string
    let cashAccountType: "CASH" | "BANK" | "MP" | "USD" = "CASH"
    
    if (paymentData.method === "Transferencia" && financial_account_id) {
      // Validar que la cuenta existe y es del tipo correcto
      const { data: account, error: accountError } = await (supabase.from("financial_accounts") as any)
        .select("id, name, type, currency, is_active")
        .eq("id", financial_account_id)
        .eq("is_active", true)
        .single()

      if (accountError || !account) {
        return NextResponse.json(
          { error: "La cuenta financiera seleccionada no existe o no está activa" },
          { status: 400 }
        )
      }

      // Validar que la cuenta sea bancaria (CHECKING o SAVINGS)
      if (
        account.type !== "CHECKING_ARS" &&
        account.type !== "CHECKING_USD" &&
        account.type !== "SAVINGS_ARS" &&
        account.type !== "SAVINGS_USD"
      ) {
        return NextResponse.json(
          { error: "La cuenta seleccionada debe ser una cuenta bancaria (corriente o ahorro)" },
          { status: 400 }
        )
      }

      // Validar que la moneda coincida
      if (account.currency !== paymentData.currency) {
        return NextResponse.json(
          { error: `La cuenta seleccionada es en ${account.currency} pero el pago es en ${paymentData.currency}` },
          { status: 400 }
        )
      }

      cashAccountId = account.id
      cashAccountType = "BANK" // Transferencia siempre usa cuenta bancaria
      console.log(`💵 mark-paid: Usando cuenta específica seleccionada`, {
        account_id: cashAccountId,
        account_name: account.name,
        account_type: account.type,
        account_currency: account.currency,
      })
    } else {
      // Para otros métodos o si no se proporcionó cuenta específica, usar cuenta por defecto
      if (paymentData.method === "Efectivo") {
        cashAccountType = "CASH"
      } else if (paymentData.method === "Transferencia") {
        cashAccountType = "BANK"
      } else if (paymentData.method === "Mercado Pago" || paymentData.method === "MercadoPago" || paymentData.method === "MP") {
        cashAccountType = "MP"
      } else if (paymentData.method === "USD") {
        cashAccountType = "USD"
      }

      cashAccountId = await getOrCreateDefaultAccount(
        cashAccountType,
        paymentData.currency as "ARS" | "USD",
        user.id,
        supabase
      )
      console.log(`💵 mark-paid: Usando cuenta por defecto`, {
        method: paymentData.method,
        cashAccountType,
        cashAccountId,
      })
    }
    console.log(`💵 mark-paid: Cuenta de caja seleccionada`, {
      paymentId,
      method: paymentData.method,
      currency: paymentData.currency,
      cashAccountType,
      cashAccountId,
      amount: paymentData.amount,
      direction: paymentData.direction,
    })

    // Crear movimiento en cuenta de caja
    // Para INCOME: aumenta la cuenta (INCOME)
    // Para EXPENSE: disminuye la cuenta (EXPENSE)
    const cashLedgerType = paymentData.direction === "INCOME" ? "INCOME" : "EXPENSE"
    
    await createLedgerMovement(
      {
        operation_id: paymentData.operation_id || null,
        lead_id: null,
        type: cashLedgerType,
        concept:
          paymentData.direction === "INCOME"
            ? `Cobro en ${paymentData.method || "efectivo"} - Operación ${paymentData.operation_id?.slice(0, 8) || ""}`
            : `Pago en ${paymentData.method || "efectivo"} - Operación ${paymentData.operation_id?.slice(0, 8) || ""}`,
        currency: paymentData.currency as "ARS" | "USD",
        amount_original: parseFloat(paymentData.amount),
        exchange_rate: paymentData.currency === "USD" ? exchangeRate : null,
        amount_ars_equivalent: amountARS,
        method: ledgerMethod,
        account_id: cashAccountId,
        seller_id: sellerId,
        operator_id: operatorId,
        receipt_number: reference || null,
        notes: reference || null,
        created_by: user.id,
      },
      supabase
    )
    console.log(`✅ Registrado movimiento en cuenta de caja ${cashAccountType} por pago ${paymentId}`)

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

