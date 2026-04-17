import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import {
  createLedgerMovement,
  calculateARSEquivalent,
  validateSufficientBalance,
  getMainPassengerName,
} from "@/lib/accounting/ledger"
import { autoCalculateFXForPayment } from "@/lib/accounting/fx"
import { getExchangeRateWithFallback } from "@/lib/accounting/exchange-rates"
import {
  applyOperatorPaymentSettlement,
  findMatchingOperatorPayment,
} from "@/lib/accounting/operator-payment-settlement"
import {
  createPaymentCounterpartMovement,
  mapPaymentMethodToLedgerMethod,
} from "@/lib/accounting/payment-counterparts"
import { createPaymentReceivedMessage } from "@/lib/whatsapp/whatsapp-service"
import { upsertSellerReceiptMessage } from "@/lib/whatsapp/seller-receipt-message"
import { autoCreateWithholdings, type WithholdingType } from "@/lib/accounting/withholding-rules"
import { enforceUserRateLimit } from "@/lib/rate-limit"

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()

    // Solo ADMIN, SUPER_ADMIN y CONTABLE pueden marcar pagos como cobrados
    if (!canAccessModule(user.role, "cash")) {
      return NextResponse.json({ error: "No tiene permisos para marcar pagos como cobrados" }, { status: 403 })
    }

    // Rate limit: marcar como pagado es destructivo y ejecuta side effects
    // contables (FX, percepciones, counterparts). Evita doble-submit/bot.
    const rateLimitBlock = enforceUserRateLimit(user.id, "/api/payments/mark-paid:POST", "WRITE")
    if (rateLimitBlock) return rateLimitBlock

    const supabase = await createServerClient()
    const body = await request.json()
    const { paymentId, datePaid, reference, financial_account_id, exchange_rate, apply_rg5617, apply_rg3819 } = body

    if (!paymentId || !datePaid || !financial_account_id) {
      return NextResponse.json({ error: "Faltan parámetros (paymentId, datePaid, financial_account_id son requeridos)" }, { status: 400 })
    }

    // Validar que datePaid no sea una fecha futura
    const paidDate = new Date(datePaid)
    const today = new Date()
    today.setHours(23, 59, 59, 999)
    if (paidDate > today) {
      return NextResponse.json({ error: "La fecha de pago no puede ser futura" }, { status: 400 })
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
        operator_id,
        operator_payment_id,
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
    const paymentsTable = supabase.from("payments") as any
    let linkedOperatorId: string | null = paymentData.operator_id || null
    let linkedOperatorPaymentId: string | null = paymentData.operator_payment_id || null

    if (paymentData.payer_type === "OPERATOR" && paymentData.operation_id && !linkedOperatorPaymentId) {
      const matchedOperatorPayment = await findMatchingOperatorPayment(supabase, {
        operationId: paymentData.operation_id,
        operatorId: linkedOperatorId,
      })

      if (matchedOperatorPayment) {
        linkedOperatorId = linkedOperatorId || matchedOperatorPayment.operator_id
        linkedOperatorPaymentId = matchedOperatorPayment.id
      }
    }

    if (paymentData.payer_type === "OPERATOR" && paymentData.operation_id && !linkedOperatorPaymentId) {
      return NextResponse.json({
        error: "No se pudo identificar la deuda del operador para este pago. Volvé a crearlo seleccionando el operador correcto.",
      }, { status: 400 })
    }

    // ============================================
    // GUARD DE IDEMPOTENCIA: Verificar ANTES de cualquier modificación
    // ============================================
    // Si el pago ya está PAID, rechazar la operación completamente
    if (paymentData.status === "PAID") {
      return NextResponse.json({
        error: "Este pago ya fue marcado como pagado anteriormente",
        already_paid: true
      }, { status: 409 }) // 409 Conflict
    }

    // Guard adicional: usar update atómico con condición de estado
    // Esto previene race conditions entre requests simultáneos
    const { data: atomicUpdate, error: atomicError } = await paymentsTable
      .update({ status: "PROCESSING" }) // Estado transitorio para bloquear otros requests
      .eq("id", paymentId)
      .eq("status", "PENDING") // Solo actualizar si sigue PENDING (Compare-And-Set)
      .select("id")
      .maybeSingle()

    if (!atomicUpdate) {
      // Otro request ya tomó este pago, o cambió de estado
      return NextResponse.json({
        error: "Este pago ya está siendo procesado por otra operación",
        already_paid: true
      }, { status: 409 })
    }

    // Calcular amount_usd si hay exchange_rate proporcionado
    let amountUsd: number | null = null
    if (exchange_rate && paymentData.currency === "ARS") {
      amountUsd = parseFloat(paymentData.amount) / exchange_rate
    } else if (paymentData.currency === "USD") {
      amountUsd = parseFloat(paymentData.amount)
    }

    // Update payment — ya pasó el guard atómico (status = PROCESSING)
    const updateData: any = {
      date_paid: datePaid,
      status: "PAID",
      reference: reference || null,
      updated_at: new Date().toISOString(),
    }
    if (paymentData.payer_type === "OPERATOR") {
      updateData.operator_id = linkedOperatorId
      updateData.operator_payment_id = linkedOperatorPaymentId
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
        financial_account_id: financial_account_id || null, // Vincular con cuenta financiera → visible en Caja
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

    // Calcular ARS equivalent
    // Priorizar exchange_rate proporcionado por el frontend
    // Si currency = ARS y se proporcionó exchange_rate, usarlo para convertir a USD
    // Si currency = USD y no se proporcionó exchange_rate, obtenerlo de la tabla
    let exchangeRate: number | null = exchange_rate || null

    if (!exchangeRate) {
      // Solo calcular automáticamente si no se proporcionó desde el frontend
      if (paymentData.currency === "USD") {
        const rateDate = datePaid ? new Date(datePaid) : new Date()
        const rateResult = await getExchangeRateWithFallback(supabase, rateDate, `mark-paid-main-${paymentId}`)
        exchangeRate = rateResult.rate
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
    const operatorId = linkedOperatorId || operation?.operator_id || null
    
    // Mapear method del payment a ledger method
    const ledgerMethod = mapPaymentMethodToLedgerMethod(paymentData.method)

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

    // Obtener nombre del pasajero principal para el concepto
    const passengerName = paymentData.operation_id 
      ? await getMainPassengerName(paymentData.operation_id, supabase) 
      : null
    const operationCode = paymentData.operation_id ? paymentData.operation_id.slice(0, 8) : "N/A"

    // Crear ledger movement PRINCIPAL en la cuenta financiera seleccionada
    // Este es el movimiento que afecta directamente el balance de la cuenta seleccionada
    const { id: ledgerMovementId } = await createLedgerMovement(
      {
        operation_id: paymentData.operation_id || null,
        lead_id: null,
        type: ledgerType,
        concept:
          paymentData.direction === "INCOME"
            ? passengerName
              ? `${passengerName} (${operationCode})`
              : `Pago de cliente recibido - Op. ${operationCode}`
            : passengerName
              ? `Pago a operador - ${passengerName} (${operationCode})`
              : `Pago a operador - Op. ${operationCode}`,
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
        movement_date: datePaid, // Usar fecha del pago (puede ser retroactiva)
      },
      supabase
    )
    
    // Si es un pago a operador, marcar operator_payment como PAID
    if (paymentData.payer_type === "OPERATOR" && linkedOperatorPaymentId) {
      try {
        await applyOperatorPaymentSettlement(
          supabase,
          linkedOperatorPaymentId,
          parseFloat(paymentData.amount),
          ledgerMovementId
        )
      } catch (error) {
        console.error("Error marcando operator_payment como PAID:", error)
        // No lanzamos error para no romper el flujo
      }
    }

    const counterpartResult = await createPaymentCounterpartMovement({
      supabase,
      paymentId,
      operationId: paymentData.operation_id || null,
      direction: paymentData.direction,
      payerType: paymentData.payer_type,
      currency: paymentData.currency,
      amount: parseFloat(paymentData.amount),
      method: paymentData.method,
      reference: reference || null,
      datePaid,
      exchangeRate,
      selectedFinancialAccountId: financial_account_id,
      sellerId,
      operatorId: paymentData.payer_type === "OPERATOR" ? linkedOperatorId : null,
      userId: user.id,
    })

    // ============================================
    // ASIENTO 3 — Cobranza (Caja / Ds x Ventas)
    // Anotar los movimientos de pago como asiento contable con Debe/Haber
    // ============================================
    try {
      const { annotatePaymentAsJournalEntry } = await import("@/lib/accounting/journal-entries")
      const operationCode = paymentData.operation_id ? paymentData.operation_id.slice(0, 8) : "N/A"

      await annotatePaymentAsJournalEntry({
        mainMovementId: ledgerMovementId,
        counterpartMovementId: counterpartResult?.id || null,
        description: paymentData.direction === "INCOME"
          ? `Cobro — ${passengerName || `Op. ${operationCode}`}`
          : `Pago a operador — ${passengerName || `Op. ${operationCode}`}`,
        date: datePaid,
        amount: parseFloat(paymentData.amount),
        currency: paymentData.currency as "ARS" | "USD",
        operation_id: paymentData.operation_id || null,
        direction: paymentData.direction === "INCOME" ? "INCOME" : "EXPENSE",
        financialAccountId: financial_account_id,
        created_by: user.id,
      }, supabase)
    } catch (error) {
      console.error("Error creating payment journal entry:", error)
      // No romper el flujo principal
    }

    // Calcular FX automáticamente si hay diferencia de moneda
    // NOTA: autoCalculateFXForPayment no es transaccional — si falla, el pago
    // queda registrado pero sin su movimiento FX correlativo. Generamos alerta
    // visible para revisión manual.
    // TODO: migrar a RPC atómico (payment + ledger + FX en una sola transacción).
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
        console.error(
          `⚠️ CRITICAL: Error calculando FX para payment ${paymentId} (op ${paymentData.operation_id}). Pago quedó sin FX correlativo. Revisar manualmente.`,
          error
        )
        // Crear alerta de sistema para revisión manual
        try {
          await (supabase.from("alerts") as any).insert({
            agency_id: agencyId || null,
            user_id: user.id,
            operation_id: paymentData.operation_id,
            type: "SYSTEM",
            description: `FX no calculado para pago ${paymentId}. Revisar manualmente diferencia de cambio.`,
            date_due: new Date().toISOString(),
            status: "PENDING",
          })
        } catch (alertError) {
          console.error("Error generando alerta de FX fallido:", alertError)
        }
        // No lanzamos error para no romper el flujo
      }
    }

    // ============================================
    // CALCULAR PERCEPCIONES AUTOMÁTICAS (RG 5617 / RG 3819)
    // ============================================
    if (paymentData.direction === "INCOME" && paymentData.operation_id) {
      try {
        // Get operation destination for international check
        const { data: opForPerc } = await (supabase.from("operations") as any)
          .select("destination, agency_id")
          .eq("id", paymentData.operation_id)
          .single()

        // Get customer CUIT from billing_info
        const { data: billingInfo } = await (supabase.from("billing_info") as any)
          .select("cuit")
          .eq("operation_id", paymentData.operation_id)
          .maybeSingle()

        // Build excluded types based on user selection
        const excludedTypes: WithholdingType[] = []
        if (!apply_rg5617) excludedTypes.push("PERCEPCION_RG5617_30")
        if (!apply_rg3819) excludedTypes.push("PERCEPCION_RG3819_5")

        const createdWithholdings = await autoCreateWithholdings(supabase, {
          amount: parseFloat(paymentData.amount),
          currency: paymentData.currency,
          type: "CUSTOMER_PAYMENT",
          counterpart_cuit: billingInfo?.cuit || undefined,
          counterpart_name: await getMainPassengerName(paymentData.operation_id, supabase) || undefined,
          tax_period: datePaid.substring(0, 7),
          withholding_date: datePaid,
          operation_id: paymentData.operation_id,
          source_type: "PAYMENT",
          source_id: paymentId,
          direction: "PRACTICED",
          created_by: user.id,
          agency_id: opForPerc?.agency_id || undefined,
          payment_method: paymentData.method || undefined,
          destination: opForPerc?.destination || undefined,
          excluded_types: excludedTypes.length > 0 ? excludedTypes : undefined,
        })

        // ============================================
        // ASIENTOS CONTABLES para percepciones (doble entrada)
        // Débito: cuenta financiera del cobro (entra dinero del cliente)
        // Crédito: "Percepciones a depositar AFIP" (pasivo - deuda con AFIP)
        // ============================================
        const perceptionRecords = createdWithholdings.filter((w: any) =>
          w.type === "PERCEPCION_RG5617_30" || w.type === "PERCEPCION_RG3819_5"
        )

        if (perceptionRecords.length > 0) {
          // IDEMPOTENCY GUARD: si ya existen ledger_movements de percepcion
          // para esta operación (mismo concepto), no crear duplicados.
          const { data: existingPercMovements } = await (supabase.from("ledger_movements") as any)
            .select("id, notes")
            .eq("operation_id", paymentData.operation_id)
            .ilike("notes", "%Percepción RG%")
            .limit(1)

          if (existingPercMovements && existingPercMovements.length > 0) {
            console.log(
              `[mark-paid] Ledger movements de percepción ya existen para op ${paymentData.operation_id}. Skipping duplicate creation.`
            )
          } else {
          // Find the "Percepciones a depositar AFIP" liability account (2.1.04)
          const { data: percChartAccount } = await (supabase.from("chart_of_accounts") as any)
            .select("id")
            .eq("account_code", "2.1.04")
            .eq("is_active", true)
            .maybeSingle()

          let percAfipAccountId: string | null = null
          if (percChartAccount) {
            const { data: percFinAccount } = await (supabase.from("financial_accounts") as any)
              .select("id")
              .eq("chart_account_id", percChartAccount.id)
              .eq("currency", "ARS")
              .eq("is_active", true)
              .maybeSingle()
            percAfipAccountId = percFinAccount?.id || null
          }

          if (percAfipAccountId) {
            const percPassengerName = passengerName || "Cliente"
            const percOpCode = paymentData.operation_id.slice(0, 8)

            for (const perc of perceptionRecords) {
              const percAmount = parseFloat(perc.amount)
              const percLabel = perc.type === "PERCEPCION_RG5617_30" ? "RG 5617 (30%)" : "RG 3819 (5%)"

              try {
                // 1. INCOME on financial account (money received from customer)
                await createLedgerMovement(
                  {
                    operation_id: paymentData.operation_id,
                    type: "INCOME",
                    concept: `Percepción ${percLabel} - ${percPassengerName} (${percOpCode})`,
                    currency: "ARS",
                    amount_original: percAmount,
                    exchange_rate: null,
                    amount_ars_equivalent: percAmount,
                    method: ledgerMethod,
                    account_id: financial_account_id,
                    seller_id: sellerId,
                    notes: `Percepción ${percLabel} cobrada al cliente`,
                    created_by: user.id,
                    movement_date: datePaid,
                  },
                  supabase
                )

                // 2. EXPENSE on AFIP liability account (increases the liability)
                await createLedgerMovement(
                  {
                    operation_id: paymentData.operation_id,
                    type: "EXPENSE",
                    concept: `Percepción ${percLabel} - ${percPassengerName} (${percOpCode})`,
                    currency: "ARS",
                    amount_original: percAmount,
                    exchange_rate: null,
                    amount_ars_equivalent: percAmount,
                    method: ledgerMethod,
                    account_id: percAfipAccountId,
                    seller_id: sellerId,
                    notes: `Percepción ${percLabel} a depositar AFIP`,
                    created_by: user.id,
                    movement_date: datePaid,
                  },
                  supabase
                )
              } catch (ledgerError) {
                console.error(`Error creando asiento contable para percepción ${perc.type}:`, ledgerError)
              }
            }
          } else {
            console.warn("⚠️ Cuenta 'Percepciones a depositar AFIP' (2.1.04) no encontrada. Ejecutar migración 145.")
          }
          } // end else (no existing percepciones) - idempotency guard
        }
      } catch (error: unknown) {
        console.error("Error calculando percepciones:", error)
        // No lanzamos error para no romper el flujo principal
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

      try {
        await upsertSellerReceiptMessage(supabase, paymentId)
      } catch (error) {
        console.error("Error creando mensaje interno de recibo para vendedor:", error)
      }
    }

    // Registrar en audit trail
    try {
      await (supabase.rpc as any)('log_audit_action', {
        p_user_id: user.id,
        p_action: 'PAYMENT_MARKED_PAID',
        p_entity_type: 'payment',
        p_entity_id: paymentId,
        p_details: {
          amount: paymentData.amount,
          currency: paymentData.currency,
          financial_account_id: financial_account_id,
          ledger_movement_id: ledgerMovementId,
          direction: paymentData.direction,
          operation_id: paymentData.operation_id
        }
      })
    } catch (auditError) {
      console.warn('Error logging audit action:', auditError)
    }

    return NextResponse.json({ success: true, ledger_movement_id: ledgerMovementId })
  } catch (error: any) {
    console.error("Error en mark-paid:", error)

    // Si el pago quedó en PROCESSING por un error, revertirlo a PENDING
    try {
      const body = await request.clone().json().catch(() => null)
      if (body?.paymentId) {
        const supabase = await createServerClient()
        await (supabase.from("payments") as any)
          .update({ status: "PENDING", updated_at: new Date().toISOString() })
          .eq("id", body.paymentId)
          .eq("status", "PROCESSING") // Solo revertir si sigue en PROCESSING
      }
    } catch (revertError) {
      console.error("Error revirtiendo estado PROCESSING:", revertError)
    }

    return NextResponse.json(
      { error: error.message || "Error al actualizar" },
      { status: 500 }
    )
  }
}

