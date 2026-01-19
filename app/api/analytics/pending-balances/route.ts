import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { getExchangeRate, getLatestExchangeRate } from "@/lib/accounting/exchange-rates"

// Forzar ruta dinámica
export const dynamic = 'force-dynamic'

/**
 * GET /api/analytics/pending-balances
 * Obtiene los balances reales de "Deudores por Ventas" y "Deuda a Operadores"
 * Usa la misma lógica que las páginas de /accounting/debts-sales y /accounting/operator-payments
 */
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    const agencyId = searchParams.get("agencyId") || "ALL"

    console.log("[PendingBalances] Iniciando cálculo de balances...")

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // ============================================
    // 1. CALCULAR DEUDORES POR VENTAS (Cuentas por Cobrar)
    // ============================================
    // Misma lógica que /api/accounting/debts-sales
    let accountsReceivableTotal = 0

    try {
      // Obtener todas las operaciones con clientes
      const { data: operations, error: operationsError } = await supabase
        .from("operations")
        .select(`
          id,
          sale_amount_total,
          sale_currency,
          currency,
          departure_date,
          created_at,
          agency_id
        `)
        .in("agency_id", agencyIds)

      if (operationsError) {
        console.error("[PendingBalances] Error obteniendo operaciones:", operationsError)
      } else if (operations && operations.length > 0) {
        // Filtrar por agencia si se especifica
        let filteredOperations = operations
        if (agencyId && agencyId !== "ALL") {
          filteredOperations = filteredOperations.filter((op: any) => op.agency_id === agencyId)
        }

        // Obtener todos los pagos de clientes para estas operaciones
        const operationIds = filteredOperations.map((op: any) => op.id)
        if (operationIds.length > 0) {
          const { data: payments } = await supabase
            .from("payments")
            .select("operation_id, amount, amount_usd, currency, exchange_rate, status, direction")
            .in("operation_id", operationIds)
            .eq("direction", "INCOME")
            .eq("payer_type", "CUSTOMER")
            .eq("status", "PAID")

          // Agrupar pagos por operación
          const paymentsByOperation: Record<string, number> = {}
          if (payments) {
            payments.forEach((payment: any) => {
              const opId = payment.operation_id
              if (!paymentsByOperation[opId]) {
                paymentsByOperation[opId] = 0
              }
              // Usar amount_usd si está disponible, sino calcularlo
              let paidUsd = 0
              if (payment.amount_usd != null) {
                paidUsd = Number(payment.amount_usd)
              } else if (payment.currency === "USD") {
                paidUsd = Number(payment.amount) || 0
              } else if (payment.currency === "ARS" && payment.exchange_rate) {
                paidUsd = (Number(payment.amount) || 0) / Number(payment.exchange_rate)
              }
              paymentsByOperation[opId] += paidUsd
            })
          }

          // Obtener tasa de cambio más reciente como fallback
          const latestExchangeRate = await getLatestExchangeRate(supabase) || 1000

          // Calcular deuda para cada operación
          for (const operation of filteredOperations) {
            const op = operation as any
            const saleCurrency = op.sale_currency || op.currency || "USD"
            const saleAmount = Number(op.sale_amount_total) || 0

            // Convertir sale_amount_total a USD
            let saleAmountUsd = saleAmount
            if (saleCurrency === "ARS") {
              const operationDate = op.departure_date || op.created_at
              let exchangeRate = await getExchangeRate(supabase, operationDate ? new Date(operationDate) : new Date())
              if (!exchangeRate) {
                exchangeRate = latestExchangeRate
              }
              saleAmountUsd = saleAmount / exchangeRate
            }

            const paidUsd = paymentsByOperation[op.id] || 0
            const debtUsd = Math.max(0, saleAmountUsd - paidUsd)
            accountsReceivableTotal += debtUsd
          }
        }
      }
    } catch (error) {
      console.error("[PendingBalances] Error calculando deudores por ventas:", error)
    }

    // ============================================
    // 2. CALCULAR DEUDA A OPERADORES (Cuentas por Pagar)
    // ============================================
    // Misma lógica que /api/accounting/operator-payments
    let accountsPayableTotal = 0

    try {
      // Obtener todos los pagos pendientes a operadores
      const { data: operatorPayments, error: operatorPaymentsError } = await supabase
        .from("operator_payments")
        .select(`
          id,
          amount,
          paid_amount,
          currency,
          status,
          operations:operation_id (id, agency_id)
        `)
        .in("status", ["PENDING", "OVERDUE"])

      if (operatorPaymentsError) {
        console.error("[PendingBalances] Error obteniendo pagos a operadores:", operatorPaymentsError)
      } else if (operatorPayments && operatorPayments.length > 0) {
        // Filtrar por agencia si se especifica
        let filteredPayments = operatorPayments
        if (agencyId && agencyId !== "ALL") {
          filteredPayments = filteredPayments.filter((p: any) => {
            const operation = p.operations
            return operation && operation.agency_id === agencyId
          })
        }

        // Obtener tasa de cambio más reciente como fallback
        const latestExchangeRate = await getLatestExchangeRate(supabase) || 1000

        // Calcular deuda pendiente en USD
        for (const payment of filteredPayments) {
          const p = payment as any
          const amount = Number(p.amount) || 0
          const paidAmount = Number(p.paid_amount) || 0
          const pendingAmount = amount - paidAmount

          if (pendingAmount > 0) {
            const currency = p.currency || "USD"
            let pendingUsd = 0

            if (currency === "USD") {
              pendingUsd = pendingAmount
            } else if (currency === "ARS") {
              // Convertir ARS a USD usando tasa de cambio más reciente
              pendingUsd = pendingAmount / latestExchangeRate
            }

            accountsPayableTotal += pendingUsd
          }
        }
      }
    } catch (error) {
      console.error("[PendingBalances] Error calculando deuda a operadores:", error)
    }

    console.log(`[PendingBalances] Balance final - Deudores por Ventas: ${accountsReceivableTotal} USD, Deuda a Operadores: ${accountsPayableTotal} USD`)

    return NextResponse.json({
      accountsReceivable: Math.max(0, accountsReceivableTotal), // Solo valores positivos
      accountsPayable: Math.max(0, accountsPayableTotal), // Solo valores positivos
    })
  } catch (error: any) {
    console.error("[PendingBalances] Error in GET /api/analytics/pending-balances:", error)
    return NextResponse.json({ 
      accountsReceivable: 0,
      accountsPayable: 0,
      error: error.message 
    }, { status: 500 })
  }
}
