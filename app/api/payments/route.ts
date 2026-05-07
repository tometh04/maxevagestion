import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import {
  createLedgerMovement,
  calculateARSEquivalent,
  validateSufficientBalance,
  getMainPassengerName,
  invalidateBalanceCache,
} from "@/lib/accounting/ledger"
import {
  getExchangeRateWithFallback,
} from "@/lib/accounting/exchange-rates"
import {
  applyOperatorPaymentSettlement,
  findMatchingOperatorPayment,
  revertOperatorPaymentSettlement,
} from "@/lib/accounting/operator-payment-settlement"
import {
  createPaymentCounterpartMovement,
  mapPaymentMethodToLedgerMethod,
  removePaymentCounterpartMovement,
} from "@/lib/accounting/payment-counterparts"
import { revalidateTag, CACHE_TAGS } from "@/lib/cache"
import { logAudit, getClientIP } from "@/lib/audit"
import {
  coercePositiveNumber,
  getCustomerIncomeReferenceCurrency,
  requiresCustomerIncomeExchangeRate,
} from "@/lib/payments/customer-income-fx"
import { resolveServicePaymentLink } from "@/lib/payments/service-payment-link"
import { upsertSellerReceiptMessage } from "@/lib/whatsapp/seller-receipt-message"
import { autoCreateWithholdings, type WithholdingType } from "@/lib/accounting/withholding-rules"
import { annotatePaymentAsJournalEntry } from "@/lib/accounting/journal-entries"
import { startOfDayAR, endOfDayAR } from "@/lib/utils/date-range"
import { enforceUserRateLimit } from "@/lib/rate-limit"
import { loadApprovalRules, getCurrentArsPerUsd } from "@/lib/payments/load-rules"
import { requiresApproval, convertToArs } from "@/lib/payments/approval"
import { notifyApprovers } from "@/lib/payments/notify-approvers"

const CUSTOMER_INCOME_EXCHANGE_RATE_ERROR =
  "Debe ingresar el tipo de cambio cuando el cobro está en una moneda distinta a la moneda de venta"

async function getOperationOperatorIdsForPayments(
  supabase: any,
  operationId: string,
  operationData?: {
    operator_id?: string | null
    operation_operators?: Array<{ operator_id?: string | null }> | null
  } | null
) {
  const operatorIds = new Set<string>()

  if (operationData?.operator_id) {
    operatorIds.add(operationData.operator_id)
  }

  for (const relation of operationData?.operation_operators || []) {
    if (relation?.operator_id) {
      operatorIds.add(relation.operator_id)
    }
  }

  const [servicesResult, operatorPaymentsResult, ivaPurchasesResult] = await Promise.all([
    (supabase.from("operation_services") as any)
      .select("operator_id")
      .eq("operation_id", operationId)
      .not("operator_id", "is", null),
    (supabase.from("operator_payments") as any)
      .select("operator_id")
      .eq("operation_id", operationId),
    (supabase.from("iva_purchases") as any)
      .select("operator_id")
      .eq("operation_id", operationId),
  ])

  if (!servicesResult.error) {
    for (const service of servicesResult.data || []) {
      if (service?.operator_id) {
        operatorIds.add(service.operator_id)
      }
    }
  }

  if (!operatorPaymentsResult.error) {
    for (const operatorPayment of operatorPaymentsResult.data || []) {
      if (operatorPayment?.operator_id) {
        operatorIds.add(operatorPayment.operator_id)
      }
    }
  }

  if (!ivaPurchasesResult.error) {
    for (const purchaseIva of ivaPurchasesResult.data || []) {
      if (purchaseIva?.operator_id) {
        operatorIds.add(purchaseIva.operator_id)
      }
    }
  }

  return operatorIds
}

/**
 * POST /api/payments
 * Crear un pago y generar movimientos contables asociados:
 * - Registro en tabla payments
 * - Movimiento en ledger_movements (libro mayor)
 * - Movimiento en cash_movements (caja)
 */
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Verificar acceso al módulo de caja
    if (!canAccessModule(user.role as any, "cash")) {
      return NextResponse.json({ error: "No tiene permisos para acceder a este módulo" }, { status: 403 })
    }

    // Rate limit por usuario para evitar doble-submit / bots / scripting
    const rateLimitBlock = enforceUserRateLimit(user.id, "/api/payments:POST", "WRITE")
    if (rateLimitBlock) return rateLimitBlock

    // Bypass de detección de duplicados cuando el user ya confirmó vía dialog
    const url = new URL(request.url)
    const forceCreate = url.searchParams.get("force") === "true"

    const body = await request.json()

    const {
      operation_id,
      operation_service_id, // Vincular pago a un servicio adicional específico
      operator_id,
      operator_payment_id,
      payer_type,
      direction,
      method,
      amount,
      currency,
      financial_account_id,
      exchange_rate: providedExchangeRate, // Tipo de cambio del frontend
      date_paid,
      date_due,
      status,
      notes,
      apply_rg5617,
      apply_rg3819,
    } = body

    const finalStatus = status || "PENDING"
    const providedExchangeRateNumber = coercePositiveNumber(providedExchangeRate)

    // operation_id ahora es opcional (para pagos manuales)
    // financial_account_id es obligatorio solo si el pago se registra como PAID
    if (!payer_type || !direction || !amount || !currency || (finalStatus === "PAID" && !financial_account_id)) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    if (financial_account_id) {
      const { data: account, error: accountError } = await (supabase.from("financial_accounts") as any)
        .select("id, currency")
        .eq("id", financial_account_id)
        .eq("is_active", true)
        .single()

      if (accountError || !account) {
        return NextResponse.json({ error: "Cuenta financiera no encontrada o inactiva" }, { status: 404 })
      }

      if (account.currency !== currency) {
        return NextResponse.json({ error: `La cuenta financiera debe estar en ${currency}` }, { status: 400 })
      }
    }

    // Validaciones de montos
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "El monto debe ser mayor a cero" }, { status: 400 })
    }

    // Detección de pago duplicado: pagos similares (misma op/operador, mismo monto, misma moneda,
    // misma dirección) creados en los últimos 7 días. Si encuentra coincidencia y el caller no
    // pasó force=true, retorna 409 con la lista para que el frontend muestre alerta y permita confirmar.
    if (!forceCreate) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      let dupQ = (supabase.from("payments") as any)
        .select(
          "id, amount, currency, direction, payer_type, status, date_paid, date_due, created_at, reference, operation_id, operator_id"
        )
        .eq("amount", amount)
        .eq("currency", currency)
        .eq("direction", direction)
        .gte("created_at", sevenDaysAgo)
        .neq("source", "OPERATOR_BULK")
      if (operation_id) {
        dupQ = dupQ.eq("operation_id", operation_id)
      } else if (operator_id) {
        dupQ = dupQ.eq("operator_id", operator_id).is("operation_id", null)
      } else {
        // Sin operation_id ni operator_id no hay forma de detectar duplicados (caso raro). Skip.
        dupQ = null
      }
      if (dupQ) {
        const { data: duplicates } = await dupQ.limit(5)
        if (duplicates && duplicates.length > 0) {
          return NextResponse.json(
            {
              error: "Posible pago duplicado detectado",
              code: "DUPLICATE_PAYMENT",
              duplicates: duplicates.map((d: any) => ({
                id: d.id,
                amount: Number(d.amount),
                currency: d.currency,
                date_paid: d.date_paid,
                date_due: d.date_due,
                created_at: d.created_at,
                reference: d.reference,
                status: d.status,
              })),
            },
            { status: 409 }
          )
        }
      }
    }

    // SELLER: verificar que la operación le pertenece
    if (user.role === "SELLER" && operation_id) {
      const { data: operationOwnership } = await (supabase.from("operations") as any)
        .select("id")
        .eq("id", operation_id)
        .eq("seller_id", user.id)
        .maybeSingle()

      if (!operationOwnership) {
        return NextResponse.json({ error: "No tiene permiso para registrar pagos en esta operación" }, { status: 403 })
      }
    }

    let operationData: any = null
    if (operation_id) {
      const { data: operation, error: operationError } = await (supabase.from("operations") as any)
        .select(`
          seller_id,
          operator_id,
          agency_id,
          sale_currency,
          currency,
          destination,
          operation_operators(
            operator_id
          )
        `)
        .eq("id", operation_id)
        .single()

      if (operationError || !operation) {
        return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 })
      }

      operationData = operation
    }

    let operationServiceData: any = null
    if (operation_service_id) {
      const { data: operationService, error: operationServiceError } = await (supabase.from("operation_services") as any)
        .select("id, operation_id, operator_id, operator_payment_id, sale_currency")
        .eq("id", operation_service_id)
        .maybeSingle()

      if (operationServiceError) {
        console.error("Error loading operation service for payment:", operationServiceError)
        return NextResponse.json({ error: "Error al obtener el servicio seleccionado" }, { status: 500 })
      }

      if (!operationService) {
        return NextResponse.json({ error: "El servicio seleccionado no existe o ya no está disponible" }, { status: 404 })
      }

      if (operation_id && operationService.operation_id !== operation_id) {
        return NextResponse.json({ error: "El servicio seleccionado no pertenece a esta operación" }, { status: 400 })
      }

      operationServiceData = operationService
    }

    const requiresCustomerIncomeManualExchangeRate = requiresCustomerIncomeExchangeRate({
      payerType: payer_type,
      direction,
      paymentCurrency: currency,
      saleCurrency: getCustomerIncomeReferenceCurrency({
        operation: operationData,
        service: operationServiceData,
      }),
    })

    if (requiresCustomerIncomeManualExchangeRate && !providedExchangeRateNumber) {
      return NextResponse.json(
        { error: CUSTOMER_INCOME_EXCHANGE_RATE_ERROR },
        { status: 400 }
      )
    }

    // Validaciones de fechas
    const today = new Date()
    today.setHours(0, 0, 0, 0) // Resetear a medianoche para comparación

    if (date_paid) {
      const paidDate = new Date(date_paid)
      paidDate.setHours(0, 0, 0, 0)
      
      // Validar que date_paid no sea futuro
      if (paidDate > today) {
        return NextResponse.json({ error: "La fecha de pago no puede ser futura" }, { status: 400 })
      }
    }

    // Validar que date_due sea después de date_paid (si ambos están)
    if (date_paid && date_due) {
      const paidDate = new Date(date_paid)
      paidDate.setHours(0, 0, 0, 0)
      
      const dueDate = new Date(date_due)
      dueDate.setHours(0, 0, 0, 0)

      if (dueDate < paidDate) {
        return NextResponse.json({ error: "La fecha de vencimiento debe ser posterior o igual a la fecha de pago" }, { status: 400 })
      }
    }

    let resolvedOperatorId: string | null = null
    let resolvedOperatorPaymentId: string | null = null

    if (payer_type === "OPERATOR" && operation_service_id) {
      const serviceLinkResolution = resolveServicePaymentLink({
        operationId: operation_id || null,
        operationServiceId: operation_service_id,
        explicitOperatorId: operator_id || null,
        service: operationServiceData || null,
      })

      if (!serviceLinkResolution.ok) {
        return NextResponse.json({ error: serviceLinkResolution.error }, { status: serviceLinkResolution.status })
      }

      resolvedOperatorId = serviceLinkResolution.operatorId
      resolvedOperatorPaymentId = serviceLinkResolution.operatorPaymentId
    }

    if (payer_type === "OPERATOR") {
      const operationOperatorIds = operation_id
        ? await getOperationOperatorIdsForPayments(supabase, operation_id, operationData)
        : new Set<string>()

      if (!resolvedOperatorId && operator_id) {
        resolvedOperatorId = operator_id
      }

      if (operation_id && resolvedOperatorId && operationOperatorIds.size > 0 && !operationOperatorIds.has(resolvedOperatorId)) {
        return NextResponse.json({ error: "El operador seleccionado no pertenece a esta operación" }, { status: 400 })
      }

      if (operation_id) {
        let matchedOperatorPayment = null

        try {
          matchedOperatorPayment = await findMatchingOperatorPayment(supabase, {
            operationId: operation_id,
            operatorId: resolvedOperatorId,
            operatorPaymentId: resolvedOperatorPaymentId || operator_payment_id || null,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : "Error al identificar la deuda del operador"
          const status = message.startsWith("Error obteniendo deuda de operador") ? 500 : 400
          return NextResponse.json({ error: message }, { status })
        }

        if (!matchedOperatorPayment) {
          if (operation_service_id) {
            return NextResponse.json({
              error: "No hay deuda pendiente para el proveedor vinculado a este servicio",
            }, { status: 400 })
          }

          // Si el operador está asignado a la operación (en operation_operators)
          // pero aún no tiene operator_payment creado, lo creamos on-the-fly usando
          // el cost de operation_operators. Esto soporta el caso de operaciones
          // con múltiples operadores donde el registro de deuda se genera
          // recién al momento de registrar el pago.
          if (resolvedOperatorId && operation_id && operationOperatorIds.has(resolvedOperatorId)) {
            const { data: opOperator } = await (supabase.from("operation_operators") as any)
              .select("cost, cost_currency")
              .eq("operation_id", operation_id)
              .eq("operator_id", resolvedOperatorId)
              .maybeSingle()

            const opCost = opOperator?.cost != null ? parseFloat(opOperator.cost) : 0
            const opCurrency = opOperator?.cost_currency || currency || "USD"

            // Crear operator_payment solo si hay cost > 0
            if (opCost > 0) {
              const { data: newOpPayment, error: createOpPayError } = await (supabase.from("operator_payments") as any)
                .insert({
                  operation_id,
                  operator_id: resolvedOperatorId,
                  amount: opCost,
                  currency: opCurrency,
                  paid_amount: 0,
                  status: "PENDING",
                  due_date: new Date().toISOString().split("T")[0],
                })
                .select("id, operator_id")
                .single()

              if (createOpPayError || !newOpPayment) {
                console.error("[payments POST] No se pudo crear operator_payment on-the-fly:", createOpPayError)
                return NextResponse.json(
                  { error: "No se pudo registrar la deuda del operador para esta operación" },
                  { status: 500 }
                )
              }

              resolvedOperatorId = (newOpPayment as any).operator_id
              resolvedOperatorPaymentId = (newOpPayment as any).id
            } else {
              return NextResponse.json(
                { error: "El operador seleccionado no tiene costo registrado en la operación" },
                { status: 400 }
              )
            }
          } else if (resolvedOperatorId) {
            return NextResponse.json({ error: "No hay deuda pendiente para el operador seleccionado en esta operación" }, { status: 400 })
          } else {
            return NextResponse.json({
              error: operationOperatorIds.size > 1
                ? "Debe seleccionar el operador al que corresponde el pago"
                : "No hay deuda pendiente a operador para esta operación",
            }, { status: 400 })
          }
        } else {
          resolvedOperatorId = matchedOperatorPayment.operator_id
          resolvedOperatorPaymentId = matchedOperatorPayment.id
        }
      }
    }

    // Calcular amount_usd para el pago
    // Si es USD: amount_usd = amount
    // Si es ARS: amount_usd = amount / exchange_rate
    let amountUsd: number | null = null
    if (currency === "USD") {
      amountUsd = parseFloat(amount)
    } else if (currency === "ARS" && providedExchangeRateNumber) {
      amountUsd = parseFloat(amount) / providedExchangeRateNumber
    }

    // Approval gate: load rules and check if this payment requires approval
    const agencyIdForApproval = operationData?.agency_id ?? null
    let needsApproval = false
    if (agencyIdForApproval) {
      try {
        const [approvalRules, arsPerUsd] = await Promise.all([
          loadApprovalRules(agencyIdForApproval, supabase),
          getCurrentArsPerUsd(supabase),
        ])
        const amountArs = convertToArs(parseFloat(amount), currency as "ARS" | "USD", arsPerUsd)
        needsApproval = requiresApproval(amountArs, user.role, approvalRules)
      } catch (approvalErr) {
        console.warn("[payments POST] Error evaluating approval rules, defaulting to no-approval:", approvalErr)
      }
    }

    // 1. Crear el pago en tabla payments
    // IMPORTANTE: Si status no se especifica, crear como PENDING para evitar crear movimientos contables duplicados
    // Los movimientos contables se crearán cuando se marque como PAID
    const paymentData: Record<string, any> = {
      operation_id,
      operation_service_id: operation_service_id || null, // Vincula con servicio adicional si aplica
      operator_id: resolvedOperatorId,
      operator_payment_id: resolvedOperatorPaymentId,
      source: "MANUAL",
      payer_type,
      direction,
      method: method || "Otro",
      amount,
      currency,
      exchange_rate: providedExchangeRateNumber,
      amount_usd: amountUsd,
      date_paid: date_paid || null,
      date_due: date_due || date_paid,
      status: needsApproval ? "PENDING" : finalStatus,
      reference: notes || null,
      created_by_user_id: user.id,
    }
    if (needsApproval) {
      paymentData.approval_status = "PENDING_APPROVAL"
    }

    const { data: payment, error: paymentError } = await (supabase.from("payments") as any)
      .insert(paymentData)
      .select()
      .single()

    if (paymentError) {
      console.error("Error creating payment:", paymentError)
      return NextResponse.json({ error: `Error al crear pago: ${paymentError.message}` }, { status: 500 })
    }

    // Audit log for payment creation
    logAudit(supabase, {
      user_id: user.id,
      user_email: user.email,
      action: "PAYMENT_CREATE",
      entity_type: "payment",
      entity_id: payment.id,
      details: { amount, currency, direction, payer_type },
      ip_address: getClientIP(request) || undefined,
    })

    // Approval gate: if approval is required, skip ledger/cash creation and return early
    if (needsApproval) {
      try {
        await notifyApprovers(payment, agencyIdForApproval, supabase, user.id)
      } catch (notifyErr) {
        console.warn("[payments POST] notifyApprovers failed (non-fatal):", notifyErr)
      }
      return NextResponse.json({ payment, requires_approval: true })
    }

    // Solo crear movimientos contables si el pago está PAID explícitamente
    // Si status no se especifica, el default es PENDING, así que no crear movimientos
    if (finalStatus === "PAID") {
      try {
        // 2. Obtener datos de la operación para seller_id y operator_id (si existe operation_id)
        let sellerId: string | null = null
        let operatorId: string | null = null
        let agencyId: string | undefined = undefined

        if (operationData) {
          sellerId = operationData.seller_id || null
          operatorId = resolvedOperatorId || operationData.operator_id || null
          agencyId = operationData.agency_id
        }

        // 3. Calcular tasa de cambio
        // Si es USD: buscar tasa para convertir a ARS
        // Si es ARS: usar la tasa proporcionada por el frontend para calcular equivalente USD
        let exchangeRate: number | null = null
        
        if (currency === "USD") {
          if (requiresCustomerIncomeManualExchangeRate) {
            exchangeRate = providedExchangeRateNumber
          } else {
            // Para USD, buscar tasa de cambio
            const rateDate = date_paid ? new Date(date_paid) : new Date()
            const rateResult = await getExchangeRateWithFallback(supabase, rateDate, "payments-create")
            exchangeRate = rateResult.rate
          }
        } else if (currency === "ARS" && providedExchangeRateNumber) {
          // Para ARS, usar la tasa proporcionada
          exchangeRate = providedExchangeRateNumber
        }

        // Calcular equivalente en ARS
        // Para ARS: amount_ars_equivalent = amount (es la misma moneda)
        // Para USD: amount_ars_equivalent = amount * exchangeRate
        const amountARS = currency === "ARS" 
          ? parseFloat(amount) 
          : calculateARSEquivalent(parseFloat(amount), "USD", exchangeRate)

        // 4. Usar la cuenta financiera proporcionada por el frontend
        const accountId = financial_account_id
        
        // Validar que la cuenta existe y está activa
        const { data: selectedAccount, error: accountCheckError } = await (supabase.from("financial_accounts") as any)
          .select("id, name, currency, is_active")
          .eq("id", accountId)
          .single()

        if (accountCheckError || !selectedAccount || !selectedAccount.is_active) {
          return NextResponse.json({ error: "La cuenta financiera seleccionada no existe o no está activa" }, { status: 400 })
        }

        // Validar que la moneda de la cuenta coincide
        if (selectedAccount.currency !== currency) {
          return NextResponse.json({ error: `La cuenta financiera debe estar en ${currency}` }, { status: 400 })
        }

        // Validar saldo suficiente para egresos (NUNCA permitir saldo negativo)
        if (direction === "EXPENSE" || payer_type === "OPERATOR") {
          const amountToCheck = parseFloat(amount)
          const balanceCheck = await validateSufficientBalance(
            accountId,
            amountToCheck,
            currency as "ARS" | "USD",
            supabase
          )
          
          if (!balanceCheck.valid) {
            return NextResponse.json(
              { error: balanceCheck.error || "Saldo insuficiente en cuenta para realizar el pago" },
              { status: 400 }
            )
          }
        }

        // 5. Mapear método de pago a método de ledger
        const ledgerMethod = mapPaymentMethodToLedgerMethod(method)

        // 6. Determinar tipo de ledger movement
        const ledgerType = direction === "INCOME" 
          ? "INCOME" 
          : (payer_type === "OPERATOR" ? "OPERATOR_PAYMENT" : "EXPENSE")

        // 6.1. Obtener nombre del pasajero principal para el concepto
        const passengerName = operation_id ? await getMainPassengerName(operation_id, supabase) : null
        const operationCode = operation_id ? operation_id.slice(0, 8) : "N/A"
        
        // 7. Verificar que no exista un movimiento duplicado (misma operación, tipo, monto, cuenta)
        if (operation_id) {
          const { data: existingMovements } = await (supabase.from("ledger_movements") as any)
            .select("id")
            .eq("operation_id", operation_id)
            .eq("type", ledgerType)
            .eq("amount_original", parseFloat(amount))
            .eq("account_id", accountId)
            .limit(1)
          if (existingMovements && existingMovements.length > 0) {
            return NextResponse.json(
              { error: "Ya existe un movimiento con el mismo monto para esta operación en esta cuenta. Verificá que no sea duplicado." },
              { status: 409 }
            )
          }
        }

        // Crear movimiento PRINCIPAL en libro mayor (ledger_movements) usando la cuenta seleccionada
        // Este es el ÚNICO movimiento que afecta el balance de la cuenta financiera seleccionada
        const { id: ledgerMovementId } = await createLedgerMovement(
          {
            operation_id,
            lead_id: null,
            type: ledgerType,
            concept: direction === "INCOME" 
              ? passengerName 
                ? `${passengerName} (${operationCode})`
                : `Pago de cliente recibido - Op. ${operationCode}`
              : passengerName
                ? `Pago a operador - ${passengerName} (${operationCode})`
                : `Pago a operador - Op. ${operationCode}`,
            currency: currency as "ARS" | "USD",
            amount_original: parseFloat(amount),
            exchange_rate: exchangeRate,
            amount_ars_equivalent: amountARS,
            method: ledgerMethod,
            account_id: accountId, // IMPORTANTE: Usar la cuenta financiera seleccionada por el usuario
            seller_id: sellerId,
            operator_id: payer_type === "OPERATOR" ? operatorId : null,
            receipt_number: null,
            notes: `Cuenta: ${selectedAccount.name} - ${notes || ""}`,
            created_by: user.id,
          },
          supabase
        )
        
        // 8. Actualizar payment con referencia al ledger_movement (CRÍTICO)
        //
        // Bug fix 2026-05-07 (caso Santi op 35a1ef37): si este UPDATE fallaba,
        // el código solo logueaba "⚠️ RETRY FAILED" y seguía como si nada,
        // dejando un payment status=PAID sin ledger_movement_id (huérfano).
        // Después del fallo se creaba o no el cash_movement con otro silencio,
        // la UI mostraba el cobro como pagado y la contabilidad quedaba MAL.
        //
        // Ahora: si después del retry el link falla, hacemos rollback
        // completo (borrar ledger_movement + payment) y devolvemos 500.
        // El usuario ve un error claro y puede retomar; el sistema queda
        // consistente.
        const { error: linkError } = await (supabase.from("payments") as any)
          .update({ ledger_movement_id: ledgerMovementId })
          .eq("id", payment.id)

        if (linkError) {
          console.error("⚠️ Failed to link ledger_movement_id to payment, retrying:", linkError)
          const { error: retryError } = await (supabase.from("payments") as any)
            .update({ ledger_movement_id: ledgerMovementId })
            .eq("id", payment.id)
          if (retryError) {
            console.error("⚠️ CRITICAL: link retry failed — rolling back payment + ledger:", {
              paymentId: payment.id, ledgerMovementId, error: retryError,
            })
            await (supabase.from("ledger_movements") as any).delete().eq("id", ledgerMovementId)
            await (supabase.from("payments") as any).delete().eq("id", payment.id)
            return NextResponse.json(
              {
                error: "No se pudo vincular el pago al libro mayor. La operación se revirtió por completo, reintentá. Si vuelve a fallar avisá a soporte.",
              },
              { status: 500 }
            )
          }
        }

        // 9. Crear cash_movement para que aparezca en la vista de caja (CRÍTICO)
        //
        // Mismo problema histórico: cashMovementError caía en console.warn y
        // se ignoraba. Ahora: si falla, rollback completo (borrar ledger,
        // borrar payment) y 500. agency_id se pasa explícito (defensivo —
        // el trigger autofill_cash_movements_agency_id lo cubre, pero
        // asegurar evita race conditions del schema cache de PostgREST).
        const { data: defaultCashBox } = await (supabase.from("cash_boxes") as any)
          .select("id")
          .eq("currency", currency)
          .eq("is_default", true)
          .eq("is_active", true)
          .eq("agency_id", agencyId || "")
          .maybeSingle()

        const { error: cashMovementError } = await (supabase.from("cash_movements") as any)
          .insert({
            operation_id: operation_id || null,
            payment_id: payment.id,
            cash_box_id: (defaultCashBox as any)?.id || null,
            financial_account_id: accountId,
            user_id: user.id,
            type: direction === "INCOME" ? "INCOME" : "EXPENSE",
            category: direction === "INCOME" ? "SALE" : "OPERATOR_PAYMENT",
            amount: parseFloat(amount),
            currency: currency,
            movement_date: date_paid || new Date().toISOString().split("T")[0],
            notes: notes || null,
            is_touristic: true,
            agency_id: agencyId,
          })

        if (cashMovementError) {
          console.error("⚠️ CRITICAL: cash_movement insert failed — rolling back:", {
            paymentId: payment.id, ledgerMovementId, error: cashMovementError,
          })
          await (supabase.from("ledger_movements") as any).delete().eq("id", ledgerMovementId)
          await (supabase.from("payments") as any).delete().eq("id", payment.id)
          return NextResponse.json(
            {
              error: `No se pudo crear el movimiento de caja: ${cashMovementError.message}. La operación se revirtió, reintentá.`,
            },
            { status: 500 }
          )
        }

        // 10. Si es pago a operador, marcar operator_payment como PAID
        if (payer_type === "OPERATOR" && resolvedOperatorPaymentId) {
          await applyOperatorPaymentSettlement(
            supabase,
            resolvedOperatorPaymentId,
            parseFloat(amount),
            ledgerMovementId
          )
        }

        const counterpartResult = await createPaymentCounterpartMovement({
          supabase,
          paymentId: payment.id,
          operationId: operation_id || null,
          direction,
          payerType: payer_type,
          currency,
          amount: parseFloat(amount),
          method,
          reference: notes || null,
          datePaid: date_paid || new Date().toISOString().split("T")[0],
          exchangeRate,
          selectedFinancialAccountId: accountId,
          sellerId,
          operatorId: payer_type === "OPERATOR" ? operatorId : null,
          userId: user.id,
        })

        // ============================================
        // PERCEPCIONES AUTOMÁTICAS (RG 5617 / RG 3819)
        // Solo para cobros de cliente con operación
        // ============================================
        const perceptionMovementIds: string[] = []
        if (direction === "INCOME" && operation_id) {
          try {
            const { data: billingInfo } = await (supabase.from("billing_info") as any)
              .select("cuit")
              .eq("operation_id", operation_id)
              .maybeSingle()

            const excludedTypes: WithholdingType[] = []
            if (!apply_rg5617) excludedTypes.push("PERCEPCION_RG5617_30")
            if (!apply_rg3819) excludedTypes.push("PERCEPCION_RG3819_5")

            const createdWithholdings = await autoCreateWithholdings(supabase, {
              amount: parseFloat(amount),
              currency,
              type: "CUSTOMER_PAYMENT",
              counterpart_cuit: billingInfo?.cuit || undefined,
              counterpart_name: passengerName || undefined,
              tax_period: (date_paid || new Date().toISOString().split("T")[0]).substring(0, 7),
              withholding_date: date_paid || new Date().toISOString().split("T")[0],
              operation_id,
              source_type: "PAYMENT",
              source_id: payment.id,
              direction: "PRACTICED",
              created_by: user.id,
              agency_id: agencyId,
              payment_method: method || undefined,
              destination: operationData?.destination || undefined,
              excluded_types: excludedTypes.length > 0 ? excludedTypes : undefined,
            })

            // Asientos contables para percepciones (doble entrada)
            const perceptionRecords = createdWithholdings.filter((w: any) =>
              w.type === "PERCEPCION_RG5617_30" || w.type === "PERCEPCION_RG3819_5"
            )

            if (perceptionRecords.length > 0) {
              // IDEMPOTENCY GUARD: si ya existen ledger_movements de percepcion
              // para esta operación, no crear duplicados.
              const { data: existingPercMovements } = await (supabase.from("ledger_movements") as any)
                .select("id")
                .eq("operation_id", operation_id)
                .ilike("notes", "%Percepción RG%")
                .limit(1)

              if (existingPercMovements && existingPercMovements.length > 0) {
                console.log(
                  `[payments POST] Ledger movements de percepción ya existen para op ${operation_id}. Skipping duplicate creation.`
                )
              } else {
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
                const percName = passengerName || "Cliente"
                const percOpCode = operation_id.slice(0, 8)

                for (const perc of perceptionRecords) {
                  const percAmount = parseFloat(perc.amount)
                  const percLabel = perc.type === "PERCEPCION_RG5617_30" ? "RG 5617 (30%)" : "RG 3819 (5%)"

                  const { id: percIncomeId } = await createLedgerMovement(
                    {
                      operation_id,
                      type: "INCOME",
                      concept: `Percepción ${percLabel} - ${percName} (${percOpCode})`,
                      currency: "ARS",
                      amount_original: percAmount,
                      exchange_rate: null,
                      amount_ars_equivalent: percAmount,
                      method: ledgerMethod,
                      account_id: accountId,
                      seller_id: sellerId,
                      notes: `Percepción ${percLabel} cobrada al cliente`,
                      created_by: user.id,
                      movement_date: date_paid || undefined,
                    },
                    supabase
                  )
                  perceptionMovementIds.push(percIncomeId)

                  const { id: percExpenseId } = await createLedgerMovement(
                    {
                      operation_id,
                      type: "EXPENSE",
                      concept: `Percepción ${percLabel} - ${percName} (${percOpCode})`,
                      currency: "ARS",
                      amount_original: percAmount,
                      exchange_rate: null,
                      amount_ars_equivalent: percAmount,
                      method: ledgerMethod,
                      account_id: percAfipAccountId,
                      seller_id: sellerId,
                      notes: `Percepción ${percLabel} a depositar AFIP`,
                      created_by: user.id,
                      movement_date: date_paid || undefined,
                    },
                    supabase
                  )
                  perceptionMovementIds.push(percExpenseId)
                }
              } else {
                console.warn("⚠️ Cuenta 'Percepciones a depositar AFIP' (2.1.04) no encontrada.")
              }
              } // end else (no existing percepciones) - idempotency guard
            }
          } catch (percError) {
            console.error("Error calculando percepciones:", percError)
            // No romper el flujo principal
          }
        }

        // ============================================
        // ASIENTO CONTABLE AUTOMÁTICO (partida doble)
        // Anota los movimientos existentes como journal entry
        // ============================================
        try {
          const paymentDate = date_paid || new Date().toISOString().split("T")[0]
          const jeDescription = direction === "INCOME"
            ? passengerName
              ? `Cobro - ${passengerName} (${operationCode})`
              : `Cobro de cliente - Op. ${operationCode}`
            : passengerName
              ? `Pago a operador - ${passengerName} (${operationCode})`
              : `Pago a operador - Op. ${operationCode}`

          await annotatePaymentAsJournalEntry(
            {
              mainMovementId: ledgerMovementId,
              counterpartMovementId: counterpartResult?.id || null,
              perceptionMovementIds,
              description: jeDescription,
              date: paymentDate,
              amount: amountARS,
              currency: currency as "ARS" | "USD",
              operation_id: operation_id || null,
              direction: direction === "INCOME" ? "INCOME" : "EXPENSE",
              financialAccountId: accountId,
              created_by: user.id,
            },
            supabase
          )
        } catch (jeError) {
          console.error("Error creando asiento contable automático:", jeError)
          // No romper el flujo principal — el pago ya fue registrado
        }

      } catch (accountingError) {
        const errorMsg = accountingError instanceof Error ? accountingError.message : String(accountingError)
        console.error("❌ CRITICAL: Error creating ledger movement for payment:", {
          paymentId: payment.id,
          operationId: operation_id,
          currency,
          amount,
          financial_account_id,
          error: errorMsg
        })
        // CRITICAL: revertir el pago si los movimientos contables fallaron
        // para evitar inconsistencias (pago marcado como PAID sin impacto en saldos)
        await (supabase.from("payments") as any)
          .delete()
          .eq("id", payment.id)

        return NextResponse.json({
          error: `Error en movimientos contables: ${errorMsg}. El pago fue revertido para mantener consistencia. Por favor intente nuevamente.`
        }, { status: 500 })
      }
    }

    // Generar alertas a 30 días si el pago está asociado a una operación
    if (operation_id && finalStatus === "PENDING") {
      try {
        // Obtener datos de la operación para generar alertas
        const { data: operation } = await (supabase.from("operations") as any)
          .select("id, destination, seller_id")
          .eq("id", operation_id)
          .single()

        if (operation && operation.seller_id) {
          const { generatePaymentAlerts30Days } = await import("@/lib/alerts/generate")
          await generatePaymentAlerts30Days(supabase, operation_id, operation.seller_id, operation.destination || "Sin destino")
        }
      } catch (error) {
        console.error("Error generating payment alerts:", error)
        // No lanzamos error para no romper la creación del pago
      }
    }

    // ============================================
    // ALERTA: Operación cobrada sin factura
    // Se genera al registrar cobro PAID si la operación no tiene factura autorizada
    // ============================================
    if (finalStatus === "PAID" && direction === "INCOME" && operation_id) {
      try {
        // Resolver agency_id y file_code de la operación (las variables del scope
        // interno de creación del cash_movement no están accesibles acá).
        const { data: opForAlert } = await (supabase.from("operations") as any)
          .select("agency_id, file_code")
          .eq("id", operation_id)
          .maybeSingle()

        const alertAgencyId = opForAlert?.agency_id || null
        const opCode = opForAlert?.file_code || operation_id.slice(0, 8)

        if (!alertAgencyId) {
          // Sin agency_id no podemos crear la alerta — la operación debería tener una;
          // logueamos para que el equipo investigue datos huérfanos.
          console.warn(
            `[missing-invoice-alert] operation ${operation_id} sin agency_id, skip alert`
          )
        } else {
          const { data: authorizedInvoice } = await (supabase.from("invoices") as any)
            .select("id")
            .eq("operation_id", operation_id)
            .eq("status", "authorized")
            .limit(1)
            .maybeSingle()

          if (!authorizedInvoice) {
            const alertDescription = `Operación ${opCode} cobrada sin factura autorizada`

            // Verificar que no exista alerta PENDING duplicada
            const { data: existingAlert } = await (supabase.from("alerts") as any)
              .select("id")
              .eq("type", "MISSING_INVOICE")
              .eq("agency_id", alertAgencyId)
              .like("description", `%${opCode}%`)
              .eq("status", "PENDING")
              .maybeSingle()

            if (!existingAlert) {
              await (supabase.from("alerts") as any).insert({
                agency_id: alertAgencyId,
                user_id: user.id,
                operation_id,
                type: "MISSING_INVOICE",
                description: alertDescription,
                date_due: new Date().toISOString(),
                status: "PENDING",
              })
            }
          }
        }
      } catch (alertError) {
        console.error("Error generating missing invoice alert:", alertError)
      }
    }

    // Registrar en audit trail
    try {
      await (supabase.rpc as any)('log_audit_action', {
        p_user_id: user.id,
        p_action: 'PAYMENT_CREATED',
        p_entity_type: 'payment',
        p_entity_id: payment.id,
        p_details: { amount, currency, direction, operation_id }
      })
    } catch (auditError) {
      console.warn('Error logging audit action:', auditError)
    }

    if (finalStatus === "PAID" && direction === "INCOME" && payer_type === "CUSTOMER") {
      try {
        await upsertSellerReceiptMessage(supabase, payment.id)
      } catch (error) {
        console.error("Error creando mensaje interno de recibo para vendedor:", error)
      }
    }

    return NextResponse.json({ payment })
  } catch (error) {
    console.error("Error in POST /api/payments:", error)
    return NextResponse.json({ error: "Error al registrar pago" }, { status: 500 })
  }
}

/**
 * GET /api/payments
 * Obtener pagos, opcionalmente filtrados por operación
 * Con paginación: page (default: 1) y limit (default: 50, max: 200)
 */
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const operationId = searchParams.get("operationId")
    const dateFrom = searchParams.get("dateFrom")
    const dateTo = searchParams.get("dateTo")
    const dateType = (searchParams.get("dateType") ?? "CREACION").toUpperCase()
    const currency = searchParams.get("currency")
    const agencyId = searchParams.get("agencyId")
    const direction = searchParams.get("direction")
    const status = searchParams.get("status")
    const payerType = searchParams.get("payerType")
    const contactName = searchParams.get("contactName")

    // Paginación
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
    const requestedLimit = parseInt(searchParams.get("limit") || "50")
    const limit = Math.min(requestedLimit, 200)
    const offset = (page - 1) * limit

    // SELLER: solo ve pagos de sus operaciones
    let allowedOperationIds: string[] | null = null
    if (user.role === "SELLER") {
      const { data: sellerOps } = await (supabase.from("operations") as any)
        .select("id")
        .eq("seller_id", user.id)
      allowedOperationIds = (sellerOps || []).map((op: any) => op.id)
      if (!allowedOperationIds || allowedOperationIds.length === 0) {
        return NextResponse.json({
          payments: [],
          pagination: { total: 0, page: 1, limit, totalPages: 0, hasMore: false }
        })
      }
    }

    // Query base con relación a operations y clientes
    let query = (supabase.from("payments") as any).select(`
      *,
      operators:operator_id(
        id,
        name,
        contact_email
      ),
      operations:operation_id(
        id,
        destination,
        file_code,
        agency_id,
        seller_id,
        agencies:agency_id(
          id,
          name
        ),
        operation_customers(
          role,
          customers:customer_id(
            id,
            first_name,
            last_name
          )
        )
      ),
      ledger_movements:ledger_movement_id(
        id,
        created_at,
        receipt_number,
        method,
        notes,
        account_id,
        financial_accounts:account_id(name)
      )
    `, { count: "exact" })
      .neq("source", "OPERATOR_BULK")

    if (operationId) {
      query = query.eq("operation_id", operationId)
    }

    // SELLER: filtrar por operaciones propias
    if (allowedOperationIds) {
      query = query.in("operation_id", allowedOperationIds)
    }

    // Filtro de direction (INCOME o EXPENSE)
    if (direction && direction !== "ALL") {
      query = query.eq("direction", direction)
    }

    // Filtro de status (PENDING, PAID, OVERDUE)
    if (status && status !== "ALL") {
      query = query.eq("status", status)
    }

    // Filtro de payer_type (CUSTOMER, OPERATOR)
    if (payerType && payerType !== "ALL") {
      query = query.eq("payer_type", payerType)
    }

    // Filtros de fecha según dateType:
    // - CREACION (default): payments.created_at — campo siempre presente, equivale al comportamiento legacy
    // - PAGO: payments.date_paid — pagos efectivamente realizados (rows con date_paid NULL quedan fuera)
    // - VENCIMIENTO: payments.date_due — vencimientos (rows con date_due NULL quedan fuera)
    // - OPERACION: pre-resolver operation_ids cuya operations.operation_date cae en [from,to]
    //   y restringir payments.operation_id IN (...). Pagos sin operación quedan fuera.
    // Si se filtra por una operación específica, no filtrar por fecha (mostrar todos los pagos de esa operación)
    if (!operationId && (dateFrom || dateTo)) {
      if (dateType === "OPERACION") {
        let opQuery = (supabase.from("operations") as any).select("id")
        if (dateFrom) opQuery = opQuery.gte("operation_date", dateFrom)
        if (dateTo) opQuery = opQuery.lte("operation_date", dateTo)
        const { data: matchingOps } = await opQuery.limit(5000)
        const opIds = (matchingOps || []).map((o: any) => o.id)
        if (opIds.length === 0) {
          return NextResponse.json({
            payments: [],
            pagination: { total: 0, page, limit, totalPages: 0, hasMore: false },
          })
        }
        // Intersectar con allowedOperationIds (SELLER) si existe
        const finalIds = allowedOperationIds
          ? opIds.filter((id: string) => (allowedOperationIds as string[]).includes(id))
          : opIds
        if (finalIds.length === 0) {
          return NextResponse.json({
            payments: [],
            pagination: { total: 0, page, limit, totalPages: 0, hasMore: false },
          })
        }
        query = query.in("operation_id", finalIds)
      } else if (dateType === "PAGO") {
        if (dateFrom) query = query.gte("date_paid", dateFrom)
        if (dateTo) query = query.lte("date_paid", dateTo)
      } else if (dateType === "VENCIMIENTO") {
        if (dateFrom) query = query.gte("date_due", dateFrom)
        if (dateTo) query = query.lte("date_due", dateTo)
      } else {
        // CREACION (default)
        if (dateFrom) query = query.gte("created_at", startOfDayAR(dateFrom))
        if (dateTo) query = query.lte("created_at", endOfDayAR(dateTo))
      }
    }

    // Filtro de moneda
    if (currency && currency !== "ALL") {
      query = query.eq("currency", currency)
    }

    // Paginación y ordenamiento
    const { data: payments, error, count } = await query
      .order("date_due", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error("Error fetching payments:", error)
      return NextResponse.json({ error: "Error al obtener pagos" }, { status: 500 })
    }

    // Filtrar en memoria por agencia y nombre de cliente (nested join fields)
    let filteredPayments = payments || []
    if (agencyId && agencyId !== "ALL") {
      filteredPayments = filteredPayments.filter((p: any) =>
        p.operations?.agency_id === agencyId
      )
    }
    if (contactName && contactName.trim()) {
      const search = contactName.trim().toLowerCase()
      filteredPayments = filteredPayments.filter((p: any) => {
        // Buscar en destino de la operación
        if (p.operations?.destination?.toLowerCase().includes(search)) return true
        // Buscar en nombre de clientes vinculados a la operación
        const customers = p.operations?.operation_customers || []
        for (const oc of customers) {
          const c = oc.customers
          if (c) {
            const fullName = `${c.first_name || ""} ${c.last_name || ""}`.toLowerCase()
            if (fullName.includes(search)) return true
          }
        }
        // Buscar en referencia del pago
        if (p.reference?.toLowerCase().includes(search)) return true
        return false
      })
    }

    const totalPages = count ? Math.ceil(count / limit) : 0

    return NextResponse.json({
      payments: filteredPayments,
      pagination: {
        total: count || 0,
        page,
        limit,
        totalPages,
        hasMore: page < totalPages
      }
    })
  } catch (error) {
    console.error("Error in GET /api/payments:", error)
    return NextResponse.json({ error: "Error al obtener pagos" }, { status: 500 })
  }
}

/**
 * DELETE /api/payments
 * Eliminar un pago y todos sus movimientos contables asociados
 */
export async function DELETE(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const paymentId = searchParams.get("paymentId")

    if (!paymentId) {
      return NextResponse.json({ error: "paymentId es requerido" }, { status: 400 })
    }

    // Rate limit por usuario: eliminar pagos es destructivo
    const rateLimitBlock = enforceUserRateLimit(user.id, "/api/payments:DELETE", "WRITE")
    if (rateLimitBlock) return rateLimitBlock

    // Validación de permisos por rol:
    // - VIEWER: no puede eliminar pagos
    // - SELLER: solo puede eliminar pagos de operaciones donde él es seller_id
    // - ADMIN, SUPER_ADMIN, CONTABLE: pueden eliminar cualquier pago
    if (user.role === "VIEWER") {
      return NextResponse.json({ error: "No tienes permisos para eliminar pagos" }, { status: 403 })
    }

    // 1. Obtener el pago con su ledger_movement_id
    const { data: payment, error: fetchError } = await (supabase.from("payments") as any)
      .select("*, operation_id")
      .eq("id", paymentId)
      .single()

    if (fetchError || !payment) {
      return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 })
    }

    // SELLER: verificar que la operación asociada le pertenece
    if (user.role === "SELLER") {
      if (!payment.operation_id) {
        return NextResponse.json(
          { error: "No tienes permisos para eliminar este pago" },
          { status: 403 }
        )
      }
      const { data: operation, error: opError } = await (supabase.from("operations") as any)
        .select("id, seller_id")
        .eq("id", payment.operation_id)
        .single()

      if (opError || !operation || operation.seller_id !== user.id) {
        return NextResponse.json(
          { error: "No tienes permisos para eliminar pagos de esta operación" },
          { status: 403 }
        )
      }
    }

    // Audit log en BD (tabla audit_log vía lib/audit.ts)
    logAudit(supabase, {
      user_id: user.id,
      user_email: user.email,
      action: "PAYMENT_DELETE",
      entity_type: "payment",
      entity_id: payment.id,
      details: {
        amount: payment.amount,
        currency: payment.currency,
        operation_id: payment.operation_id,
        payer_type: payment.payer_type,
        direction: payment.direction,
        status: payment.status,
        user_role: user.role,
      },
      ip_address: getClientIP(request) || undefined,
    })

    if (payment.source === "OPERATOR_BULK") {
      return NextResponse.json(
        { error: "Los pagos generados desde Pago Masivo no se pueden eliminar desde esta pantalla." },
        { status: 400 }
      )
    }

    // 2. Eliminar movimiento de caja relacionado
    const { data: deletedCash, error: cashError } = await (supabase.from("cash_movements") as any)
      .delete()
      .eq("payment_id", paymentId)
      .select("id")

    if (cashError) {
      console.warn("Warning: Could not delete cash movement by payment_id:", cashError)
    }

    // Fallback: si no se encontró por payment_id, buscar huérfanos por operation_id + amount + type
    // (movimientos creados sin payment_id por versiones anteriores del código)
    if (!deletedCash?.length && payment.operation_id && payment.status === "PAID") {
      const expectedType = payment.direction === "INCOME" ? "INCOME" : "EXPENSE"
      const { error: orphanError } = await (supabase.from("cash_movements") as any)
        .delete()
        .eq("operation_id", payment.operation_id)
        .eq("type", expectedType)
        .eq("amount", payment.amount)
        .eq("currency", payment.currency)
        .is("payment_id", null)

      if (orphanError) {
        console.warn("Warning: Could not delete orphaned cash movement:", orphanError)
      } else {
      }
    }

    // 3. Si hay ledger_movement_id, eliminar el movimiento del libro mayor
    let ledgerMovementId = payment.ledger_movement_id

    // Fallback: si no hay ledger_movement_id pero el pago era PAID con operation_id,
    // buscar ledger movement huérfano por operation_id + monto + tipo
    if (!ledgerMovementId && payment.status === "PAID" && payment.operation_id) {
      const expectedType = payment.direction === "INCOME" ? "INCOME" : "OPERATOR_PAYMENT"
      const { data: orphaned } = await (supabase.from("ledger_movements") as any)
        .select("id")
        .eq("operation_id", payment.operation_id)
        .eq("type", expectedType)
        .eq("amount_original", payment.amount)
        .eq("currency", payment.currency)
        .limit(1)
        .maybeSingle()

      if (orphaned) {
        console.warn(`⚠️ Found orphaned ledger movement ${orphaned.id} for payment ${paymentId} (ledger_movement_id was null)`)
        ledgerMovementId = orphaned.id
      }
    }

    if (ledgerMovementId) {
      // Obtener account_id antes de eliminar para invalidar cache
      const { data: ledgerMovement } = await (supabase.from("ledger_movements") as any)
        .select("account_id")
        .eq("id", ledgerMovementId)
        .single()

      if (payment.payer_type === "OPERATOR" && payment.operator_payment_id) {
        await revertOperatorPaymentSettlement(supabase, {
          operatorPaymentId: payment.operator_payment_id,
          paymentAmount: parseFloat(payment.amount),
          currentPaymentId: paymentId,
          removedLedgerMovementId: ledgerMovementId,
        })
      } else {
        // Desmarcar operator_payment legado si existe
        await (supabase.from("operator_payments") as any)
          .update({
            status: "PENDING",
            ledger_movement_id: null,
            updated_at: new Date().toISOString()
          })
          .eq("ledger_movement_id", ledgerMovementId)
      }

      // Eliminar el ledger movement
      const { error: ledgerError } = await (supabase.from("ledger_movements") as any)
        .delete()
        .eq("id", ledgerMovementId)

      if (ledgerError) {
        console.error("ERROR: Could not delete ledger movement:", ledgerError)
        return NextResponse.json({ error: "Error al eliminar movimiento contable asociado. El pago NO fue eliminado." }, { status: 500 })
      } else if (ledgerMovement?.account_id) {
        // Invalidar cache de balance de la cuenta afectada
        invalidateBalanceCache(ledgerMovement.account_id)
      }
    }

    if (!ledgerMovementId && payment.status === "PAID" && payment.payer_type === "OPERATOR" && payment.operator_payment_id) {
      await revertOperatorPaymentSettlement(supabase, {
        operatorPaymentId: payment.operator_payment_id,
        paymentAmount: parseFloat(payment.amount),
        currentPaymentId: paymentId,
        removedLedgerMovementId: null,
      })
    }

    if (payment.operation_id && payment.status === "PAID") {
      try {
        await removePaymentCounterpartMovement({
          supabase,
          paymentId,
          operationId: payment.operation_id,
          direction: payment.direction,
          payerType: payment.payer_type,
          currency: payment.currency,
          amount: parseFloat(payment.amount),
          reference: payment.reference || null,
          datePaid: payment.date_paid || null,
          excludeLedgerMovementId: ledgerMovementId || null,
        })
      } catch (counterpartError) {
        console.warn("Warning: Could not delete counterpart CpC/CpP ledger movement:", counterpartError)
      }
    }

    // 4. Eliminar el pago
    const { error: deleteError } = await (supabase.from("payments") as any)
      .delete()
      .eq("id", paymentId)

    if (deleteError) {
      console.error("Error deleting payment:", deleteError)
      return NextResponse.json({ error: "Error al eliminar pago" }, { status: 500 })
    }

    // Invalidar caché del dashboard (los KPIs cambian al eliminar un pago)
    revalidateTag(CACHE_TAGS.DASHBOARD)

    return NextResponse.json({ success: true, message: "Pago eliminado correctamente. Los movimientos contables fueron revertidos." })
  } catch (error) {
    console.error("Error in DELETE /api/payments:", error)
    return NextResponse.json({ error: "Error al eliminar pago" }, { status: 500 })
  }
}

/**
 * PATCH /api/payments
 * Editar un pago existente y actualizar movimientos contables asociados.
 * Solo ADMIN, SUPER_ADMIN y CONTABLE pueden editar.
 *
 * Campos editables: amount, currency, method, date_paid, exchange_rate, financial_account_id, notes
 * NO editables: operation_id, payer_type, direction (definen la naturaleza del pago)
 */
export async function PATCH(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Validar rol
    const allowedRoles = ["ADMIN", "SUPER_ADMIN", "CONTABLE"]
    if (!allowedRoles.includes(user.role)) {
      return NextResponse.json({ error: "No tienes permisos para editar pagos" }, { status: 403 })
    }

    const body = await request.json()
    const {
      paymentId,
      amount,
      currency,
      method,
      date_paid,
      exchange_rate: providedExchangeRate,
      financial_account_id,
      notes,
      markAsPaid,
    } = body

    if (!paymentId) {
      return NextResponse.json({ error: "paymentId es requerido" }, { status: 400 })
    }

    // 1. Obtener pago actual
    const { data: existingPayment, error: fetchError } = await (supabase.from("payments") as any)
      .select("*")
      .eq("id", paymentId)
      .single()

    if (fetchError || !existingPayment) {
      return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 })
    }

    if (existingPayment.source === "OPERATOR_BULK") {
      return NextResponse.json(
        { error: "Los pagos generados desde Pago Masivo no se pueden editar desde esta pantalla." },
        { status: 400 }
      )
    }

    let linkedOperatorId: string | null = existingPayment.operator_id || null
    let linkedOperatorPaymentId: string | null = existingPayment.operator_payment_id || null
    let existingOperationData: any = null
    let existingOperationServiceData: any = null

    if (existingPayment.operation_id) {
      const { data: operation, error: operationError } = await (supabase.from("operations") as any)
        .select("seller_id, operator_id, agency_id, sale_currency, currency")
        .eq("id", existingPayment.operation_id)
        .single()

      if (operationError || !operation) {
        return NextResponse.json({ error: "Operación asociada al pago no encontrada" }, { status: 404 })
      }

      existingOperationData = operation
    }

    if (existingPayment.operation_service_id) {
      const { data: operationService, error: operationServiceError } = await (supabase.from("operation_services") as any)
        .select("id, operation_id, sale_currency")
        .eq("id", existingPayment.operation_service_id)
        .maybeSingle()

      if (operationServiceError) {
        console.error("Error loading operation service for payment edit:", operationServiceError)
        return NextResponse.json({ error: "Error al obtener el servicio asociado al pago" }, { status: 500 })
      }

      existingOperationServiceData = operationService || null
    }

    if (existingPayment.payer_type === "OPERATOR") {
      if (!linkedOperatorPaymentId && existingPayment.ledger_movement_id) {
        const { data: linkedByLedger } = await (supabase.from("operator_payments") as any)
          .select("id, operator_id")
          .eq("ledger_movement_id", existingPayment.ledger_movement_id)
          .maybeSingle()

        if (linkedByLedger) {
          linkedOperatorPaymentId = linkedByLedger.id
          linkedOperatorId = linkedOperatorId || linkedByLedger.operator_id || null
        }
      }

      if (!linkedOperatorPaymentId && existingPayment.operation_id) {
        const matchedOperatorPayment = await findMatchingOperatorPayment(supabase, {
          operationId: existingPayment.operation_id,
          operatorId: linkedOperatorId,
        })

        if (matchedOperatorPayment) {
          linkedOperatorPaymentId = matchedOperatorPayment.id
          linkedOperatorId = linkedOperatorId || matchedOperatorPayment.operator_id
        }
      }
    }

    // Determinar valores finales (usar nuevos si se proporcionan, o mantener existentes)
    const finalAmount = amount !== undefined ? parseFloat(amount) : parseFloat(existingPayment.amount)
    const finalCurrency = currency || existingPayment.currency
    const finalMethod = method || existingPayment.method
    const finalDatePaid = date_paid || existingPayment.date_paid
    const finalExchangeRate = providedExchangeRate !== undefined
      ? coercePositiveNumber(providedExchangeRate)
      : coercePositiveNumber(existingPayment.exchange_rate)
    const finalAccountId = financial_account_id || null
    const finalNotes = notes !== undefined ? notes : existingPayment.reference
    const requiresCustomerIncomeManualExchangeRate = requiresCustomerIncomeExchangeRate({
      payerType: existingPayment.payer_type,
      direction: existingPayment.direction,
      paymentCurrency: finalCurrency,
      saleCurrency: getCustomerIncomeReferenceCurrency({
        operation: existingOperationData,
        service: existingOperationServiceData,
      }),
    })

    // Validaciones
    if (finalAmount <= 0) {
      return NextResponse.json({ error: "El monto debe ser mayor a 0" }, { status: 400 })
    }

    if (requiresCustomerIncomeManualExchangeRate && !finalExchangeRate) {
      return NextResponse.json(
        { error: CUSTOMER_INCOME_EXCHANGE_RATE_ERROR },
        { status: 400 }
      )
    }

    if (finalDatePaid) {
      const paidDate = new Date(finalDatePaid)
      paidDate.setHours(0, 0, 0, 0)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      if (paidDate > today) {
        return NextResponse.json({ error: "La fecha de pago no puede ser futura" }, { status: 400 })
      }
    }

    // Validar cuenta financiera si se proporcionó una nueva
    if (finalAccountId) {
      const { data: financialAccount, error: accountError } = await (supabase.from("financial_accounts") as any)
        .select("id, currency, is_active, name")
        .eq("id", finalAccountId)
        .eq("is_active", true)
        .single()

      if (accountError || !financialAccount) {
        return NextResponse.json({ error: "Cuenta financiera no encontrada o inactiva" }, { status: 404 })
      }

      if (financialAccount.currency !== finalCurrency) {
        return NextResponse.json({ error: `La cuenta financiera debe estar en ${finalCurrency}` }, { status: 400 })
      }
    }

    // Calcular amount_usd
    let amountUsd: number | null = null
    if (finalCurrency === "USD") {
      amountUsd = finalAmount
    } else if (finalCurrency === "ARS" && finalExchangeRate) {
      amountUsd = finalAmount / finalExchangeRate
    }

    // 2. Si el pago está PAID y tiene ledger_movement_id, reversar movimientos contables
    const wasPaid = existingPayment.status === "PAID" && existingPayment.ledger_movement_id

    if (wasPaid) {
      if (existingPayment.payer_type === "OPERATOR" && linkedOperatorPaymentId) {
        await revertOperatorPaymentSettlement(supabase, {
          operatorPaymentId: linkedOperatorPaymentId,
          paymentAmount: parseFloat(existingPayment.amount),
          currentPaymentId: paymentId,
          removedLedgerMovementId: existingPayment.ledger_movement_id,
        })
      } else {
        // 2a. Revertir operator_payment legado si aplica
        await (supabase.from("operator_payments") as any)
          .update({
            status: "PENDING",
            ledger_movement_id: null,
            updated_at: new Date().toISOString()
          })
          .eq("ledger_movement_id", existingPayment.ledger_movement_id)
      }

      // 2b. Eliminar cash_movement vinculado
      await (supabase.from("cash_movements") as any)
        .delete()
        .eq("payment_id", paymentId)

      // 2c. Eliminar ledger_movement viejo
      await (supabase.from("ledger_movements") as any)
        .delete()
        .eq("id", existingPayment.ledger_movement_id)

      await removePaymentCounterpartMovement({
        supabase,
        paymentId,
        operationId: existingPayment.operation_id,
        direction: existingPayment.direction,
        payerType: existingPayment.payer_type,
        currency: existingPayment.currency,
        amount: parseFloat(existingPayment.amount),
        reference: existingPayment.reference || null,
        datePaid: existingPayment.date_paid || null,
        excludeLedgerMovementId: existingPayment.ledger_movement_id,
      })
    }

    // 3. Actualizar registro del pago
    const updateData: any = {
      amount: finalAmount,
      currency: finalCurrency,
      method: finalMethod,
      date_paid: finalDatePaid,
      exchange_rate: finalExchangeRate,
      amount_usd: amountUsd,
      reference: finalNotes || null,
      updated_at: new Date().toISOString(),
    }
    if (existingPayment.payer_type === "OPERATOR") {
      updateData.operator_id = linkedOperatorId
      updateData.operator_payment_id = linkedOperatorPaymentId
    }
    // Solo resetear ledger_movement_id si el pago tenía uno (evita error de schema cache)
    if (wasPaid && existingPayment.ledger_movement_id) {
      updateData.ledger_movement_id = null
    }

    // BUG #3 audit forense 2026-05-05: si el user solicita `markAsPaid=true`
    // tenemos que aplicar un guard CAS (Compare-And-Set) para evitar que dos
    // requests concurrentes pasen el `if (wasPaid || markAsPaid)` simultáneamente
    // y dupliquen ledger_movements + cash_movements + counterparts.
    //
    // El CAS se hace en el UPDATE final con un filtro `.eq("status", "PENDING")`,
    // todo en una sola operación atómica. Si dos requests corren a la vez, solo
    // uno hace match (Postgres serializa); el otro recibe `count: 0` rows
    // afectadas y devolvemos 409.
    //
    // (Antes intentábamos un guard intermedio status='PROCESSING' pero el CHECK
    // constraint payments_status_check solo permite ('PENDING','PAID','OVERDUE').
    // El UPDATE atómico con filtro de status logra el mismo efecto sin agregar
    // un estado transient al enum.)
    if (markAsPaid) {
      updateData.status = "PAID"
    }

    let updateQuery = (supabase.from("payments") as any)
      .update(updateData)
      .eq("id", paymentId)

    // Solo aplicamos CAS cuando estamos transitando PENDING → PAID (caso Yamil).
    // En edición de un pago ya PAID el bloque previo (línea 1648+) ya revirtió
    // los movimientos; ahí no necesitamos CAS porque no hay transición de status.
    if (markAsPaid && !wasPaid) {
      updateQuery = updateQuery.eq("status", "PENDING")
    }

    const { data: updatedRows, error: updateError, count } = await updateQuery
      .select("id", { count: "exact" })

    if (updateError) {
      console.error("Error updating payment:", updateError)
      return NextResponse.json({ error: `Error al actualizar pago: ${updateError.message}` }, { status: 500 })
    }

    // CAS check: si esperabamos transicionar PENDING → PAID y no afectamos filas,
    // significa que otra request ya lo marcó como PAID. Devolvemos 409.
    if (markAsPaid && !wasPaid && (!updatedRows || updatedRows.length === 0)) {
      return NextResponse.json(
        {
          error: "Este pago ya fue marcado como pagado por otra operación. Refrescá la página.",
          already_paid: true,
        },
        { status: 409 }
      )
    }

    // 4. Si el pago estaba PAID o se está marcando como PAID, crear/recrear movimientos contables
    if ((wasPaid || markAsPaid) && finalAccountId) {
      try {
        // Obtener datos de la operación
        let sellerId: string | null = null
        let operatorId: string | null = null

        let agencyId: string | null = null

        sellerId = existingOperationData?.seller_id || null
        operatorId = linkedOperatorId || existingOperationData?.operator_id || null
        agencyId = existingOperationData?.agency_id || null

        // Calcular tasa de cambio para ARS equivalent
        let exchangeRate: number | null = null
        if (finalCurrency === "USD") {
          if (requiresCustomerIncomeManualExchangeRate) {
            exchangeRate = finalExchangeRate
          } else {
            const rateDate = finalDatePaid ? new Date(finalDatePaid) : new Date()
            const rateResult = await getExchangeRateWithFallback(supabase, rateDate, "payments-create-CpC")
            exchangeRate = rateResult.rate
          }
        } else if (finalCurrency === "ARS" && finalExchangeRate) {
          exchangeRate = finalExchangeRate
        }

        const amountARS = finalCurrency === "ARS"
          ? finalAmount
          : calculateARSEquivalent(finalAmount, "USD", exchangeRate)

        // Validar saldo suficiente para egresos
        if (existingPayment.direction === "EXPENSE" || existingPayment.payer_type === "OPERATOR") {
          const balanceCheck = await validateSufficientBalance(
            finalAccountId,
            finalAmount,
            finalCurrency as "ARS" | "USD",
            supabase
          )
          if (!balanceCheck.valid) {
            return NextResponse.json(
              { error: balanceCheck.error || "Saldo insuficiente en cuenta para realizar el pago" },
              { status: 400 }
            )
          }
        }

        // Obtener nombre de cuenta financiera
        const { data: accountInfo } = await (supabase.from("financial_accounts") as any)
          .select("name")
          .eq("id", finalAccountId)
          .single()

        // Mapear método
        const ledgerMethod = mapPaymentMethodToLedgerMethod(finalMethod)

        const ledgerType = existingPayment.direction === "INCOME"
          ? "INCOME"
          : (existingPayment.payer_type === "OPERATOR" ? "OPERATOR_PAYMENT" : "EXPENSE")

        const passengerName = existingPayment.operation_id
          ? await getMainPassengerName(existingPayment.operation_id, supabase)
          : null
        const operationCode = existingPayment.operation_id ? existingPayment.operation_id.slice(0, 8) : "N/A"

        // Crear nuevo ledger movement
        const { id: newLedgerMovementId } = await createLedgerMovement(
          {
            operation_id: existingPayment.operation_id,
            lead_id: null,
            type: ledgerType,
            concept: existingPayment.direction === "INCOME"
              ? passengerName
                ? `${passengerName} (${operationCode})`
                : `Pago de cliente recibido - Op. ${operationCode}`
              : passengerName
                ? `Pago a operador - ${passengerName} (${operationCode})`
                : `Pago a operador - Op. ${operationCode}`,
            currency: finalCurrency as "ARS" | "USD",
            amount_original: finalAmount,
            exchange_rate: exchangeRate,
            amount_ars_equivalent: amountARS,
            method: ledgerMethod,
            account_id: finalAccountId,
            seller_id: sellerId,
            operator_id: existingPayment.payer_type === "OPERATOR" ? operatorId : null,
            receipt_number: null,
            notes: `Cuenta: ${accountInfo?.name || finalAccountId} - ${finalNotes || ""} (editado)`,
            created_by: user.id,
          },
          supabase
        )

        // Vincular nuevo ledger_movement al pago (CRÍTICO).
        // Bug fix 2026-05-07: si este UPDATE falla en silencio, el pago queda
        // PAID pero `ledger_movement_id` apunta al viejo (ya borrado) o queda
        // null. Resultado: pago huérfano. Ahora si falla hacemos rollback del
        // ledger nuevo y devolvemos 500.
        const { error: linkErr } = await (supabase.from("payments") as any)
          .update({ ledger_movement_id: newLedgerMovementId })
          .eq("id", paymentId)
        if (linkErr) {
          console.error("⚠️ CRITICAL: PATCH no pudo vincular nuevo ledger al payment — rollback:", {
            paymentId, newLedgerMovementId, error: linkErr,
          })
          await (supabase.from("ledger_movements") as any).delete().eq("id", newLedgerMovementId)
          return NextResponse.json(
            { error: "No se pudo vincular el pago al libro mayor. Reintentá; si vuelve a fallar avisá a soporte." },
            { status: 500 }
          )
        }

        // Marcar operator_payment como PAID si aplica
        if (existingPayment.payer_type === "OPERATOR" && linkedOperatorPaymentId) {
          await applyOperatorPaymentSettlement(
            supabase,
            linkedOperatorPaymentId,
            finalAmount,
            newLedgerMovementId
          )
        } else if (existingPayment.payer_type === "OPERATOR" && existingPayment.operation_id) {
          const matchedOperatorPayment = await findMatchingOperatorPayment(supabase, {
            operationId: existingPayment.operation_id,
            operatorId: linkedOperatorId,
          })

          if (matchedOperatorPayment) {
            linkedOperatorPaymentId = matchedOperatorPayment.id
            linkedOperatorId = linkedOperatorId || matchedOperatorPayment.operator_id

            await (supabase.from("payments") as any)
              .update({
                operator_id: linkedOperatorId,
                operator_payment_id: linkedOperatorPaymentId,
              })
              .eq("id", paymentId)

            await applyOperatorPaymentSettlement(
              supabase,
              linkedOperatorPaymentId,
              finalAmount,
              newLedgerMovementId
            )
          }
        }

        // Crear nuevo cash_movement (el PATCH borraba el viejo pero no recreaba el nuevo)
        const { data: defaultCashBox } = await (supabase.from("cash_boxes") as any)
          .select("id")
          .eq("currency", finalCurrency)
          .eq("is_default", true)
          .eq("is_active", true)
          .eq("agency_id", agencyId || "")
          .maybeSingle()

        const { error: cashInsertError } = await (supabase.from("cash_movements") as any)
          .insert({
            operation_id: existingPayment.operation_id,
            payment_id: paymentId,
            cash_box_id: (defaultCashBox as any)?.id || null,
            financial_account_id: finalAccountId,
            user_id: user.id,
            type: existingPayment.direction === "INCOME" ? "INCOME" : "EXPENSE",
            category: existingPayment.direction === "INCOME" ? "SALE" : "OPERATOR_PAYMENT",
            amount: finalAmount,
            currency: finalCurrency,
            movement_date: finalDatePaid,
            notes: finalNotes || null,
            is_touristic: true,
            agency_id: agencyId,
          })

        if (cashInsertError) {
          // Bug fix 2026-05-07: antes era console.warn — el endpoint devolvía
          // 200 al cliente y la UI mostraba el cobro como editado, pero la
          // caja quedaba sin el movimiento. Ahora rollback: borrar el ledger
          // recién creado, desvincularlo del payment, y devolver 500.
          console.error("⚠️ CRITICAL: PATCH cash_movement insert falló — rollback:", {
            paymentId, newLedgerMovementId, error: cashInsertError,
          })
          await (supabase.from("payments") as any)
            .update({ ledger_movement_id: null })
            .eq("id", paymentId)
          await (supabase.from("ledger_movements") as any).delete().eq("id", newLedgerMovementId)
          return NextResponse.json(
            {
              error: `No se pudo crear el movimiento de caja: ${cashInsertError.message}. La edición se revirtió, reintentá.`,
            },
            { status: 500 }
          )
        }

        await createPaymentCounterpartMovement({
          supabase,
          paymentId,
          operationId: existingPayment.operation_id,
          direction: existingPayment.direction,
          payerType: existingPayment.payer_type,
          currency: finalCurrency,
          amount: finalAmount,
          method: finalMethod,
          reference: finalNotes || null,
          datePaid: finalDatePaid,
          exchangeRate,
          selectedFinancialAccountId: finalAccountId,
          sellerId,
          operatorId: existingPayment.payer_type === "OPERATOR" ? operatorId : null,
          userId: user.id,
        })

      } catch (accountingError) {
        console.error("Error recreating accounting movements:", accountingError)
        return NextResponse.json({
          payment: { ...existingPayment, ...updateData },
          warning: "Pago actualizado pero hubo error en movimientos contables"
        })
      }
    }

    // Invalidar caché
    revalidateTag(CACHE_TAGS.DASHBOARD)

    if ((wasPaid || markAsPaid) && existingPayment.direction === "INCOME" && existingPayment.payer_type === "CUSTOMER") {
      try {
        await upsertSellerReceiptMessage(supabase, paymentId)
      } catch (error) {
        console.error("Error creando mensaje interno de recibo para vendedor:", error)
      }
    }

    return NextResponse.json({ success: true, message: "Pago editado correctamente" })
  } catch (error) {
    console.error("Error in PATCH /api/payments:", error)
    return NextResponse.json({ error: "Error al editar pago" }, { status: 500 })
  }
}
