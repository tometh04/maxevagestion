import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { applyCustomersFilters } from "@/lib/permissions-api"
import { getExchangeRate, getLatestExchangeRate } from "@/lib/accounting/exchange-rates"

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Obtener filtros de query params
    const currencyFilter = searchParams.get("currency") // "ALL" | "USD" | "ARS"
    const customerIdFilter = searchParams.get("customerId") // ID de cliente
    const dateFromFilter = searchParams.get("dateFrom") // YYYY-MM-DD
    const dateToFilter = searchParams.get("dateTo") // YYYY-MM-DD

    // Verificar permiso de acceso (accounting en vez de customers)
    if (!canAccessModule(user.role as any, "accounting")) {
      return NextResponse.json({ error: "No tiene permiso para ver esta sección" }, { status: 403 })
    }

    // Get user agencies
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Build base query
    let query = supabase.from("customers")

    // Apply role-based filters
    try {
      query = await applyCustomersFilters(query, user, agencyIds, supabase)
    } catch (error: any) {
      console.error("Error applying customers filters:", error)
      return NextResponse.json({ error: error.message }, { status: 403 })
    }

    // Get all customers with their operations
    const { data: customers, error: customersError } = await query
      .select(`
        *,
        operation_customers(
          operation_id,
          operations:operation_id(
            id,
            file_code,
            destination,
            sale_amount_total,
            sale_currency,
            currency,
            status,
            departure_date
          )
        )
      `)
      .order("created_at", { ascending: false })

    if (customersError) {
      console.error("Error fetching customers:", customersError)
      return NextResponse.json({ error: "Error al obtener clientes" }, { status: 500 })
    }

    // Get all operation IDs
    const allOperationIds: string[] = []
    customers?.forEach((customer: any) => {
      customer.operation_customers?.forEach((oc: any) => {
        if (oc.operation_id) {
          allOperationIds.push(oc.operation_id)
        }
      })
    })

    // Get all payments for these operations
    // Usar amount_usd para calcular todo en USD
    let paymentsByOperation: Record<string, { paidUsd: number; currency: string }> = {}
    if (allOperationIds.length > 0) {
      const { data: payments } = await supabase
        .from("payments")
        .select("operation_id, amount, amount_usd, currency, exchange_rate, status, direction")
        .in("operation_id", allOperationIds)
        .eq("direction", "INCOME")
        .eq("payer_type", "CUSTOMER")

      if (payments) {
        payments.forEach((payment: any) => {
          const opId = payment.operation_id
          if (!paymentsByOperation[opId]) {
            paymentsByOperation[opId] = { paidUsd: 0, currency: payment.currency || "ARS" }
          }
          if (payment.status === "PAID") {
            // Usar amount_usd si está disponible (pagos nuevos)
            // Si no, calcularlo usando exchange_rate
            let paidUsd = 0
            if (payment.amount_usd != null) {
              paidUsd = Number(payment.amount_usd)
            } else if (payment.currency === "USD") {
              paidUsd = Number(payment.amount) || 0
            } else if (payment.currency === "ARS" && payment.exchange_rate) {
              paidUsd = (Number(payment.amount) || 0) / Number(payment.exchange_rate)
            }
            paymentsByOperation[opId].paidUsd += paidUsd
          }
        })
      }
    }

    // Calculate debt for each customer
    const debtors: Array<{
      customer: any
      totalDebt: number
      currency: string
      operationsWithDebt: Array<{
        id: string
        file_code: string | null
        destination: string
        sale_amount_total: number
        currency: string
        paid: number
        debt: number
        departure_date: string | null
      }>
    }> = []

    // Obtener tasa de cambio más reciente como fallback (una sola vez fuera del loop)
    const latestExchangeRate = await getLatestExchangeRate(supabase) || 1000

    // Cambiar forEach a for...of para permitir await dentro del loop
    const customersList = (customers || []) as any[]
    for (const customer of customersList) {
      const operations = (customer.operation_customers || []) as any[]
      const operationsWithDebt: Array<{
        id: string
        file_code: string | null
        destination: string
        sale_amount_total: number
        currency: string
        paid: number
        debt: number
        departure_date: string | null
      }> = []
      let totalDebt = 0
      let currency = "ARS"

      // Usar for...of para poder usar await correctamente
      for (const oc of operations) {
        const operation = oc.operations
        if (!operation) continue

        const opId = operation.id
        const saleCurrency = operation.sale_currency || operation.currency || "USD"
        const saleAmount = Number(operation.sale_amount_total) || 0
        
        // Convertir sale_amount_total a USD
        let saleAmountUsd = saleAmount
        if (saleCurrency === "ARS") {
          // Obtener tasa de cambio histórica para la fecha de la operación
          const operationDate = operation.departure_date || operation.created_at
          let exchangeRate = await getExchangeRate(supabase, operationDate ? new Date(operationDate) : new Date())
          if (!exchangeRate) {
            exchangeRate = latestExchangeRate
          }
          // Convertir ARS a USD: dividir por el exchange_rate
          saleAmountUsd = saleAmount / exchangeRate
        }
        // Si ya está en USD, saleAmountUsd = saleAmount (ya está correcto)
        
        const paymentData = paymentsByOperation[opId] || { paidUsd: 0, currency: saleCurrency }
        const paidUsd = paymentData.paidUsd
        
        const debtUsd = Math.max(0, saleAmountUsd - paidUsd)

        // Usar USD como moneda principal para deudas
        currency = "USD"

        if (debtUsd > 0) {
          operationsWithDebt.push({
            id: opId,
            file_code: operation.file_code,
            destination: operation.destination || "Sin destino",
            sale_amount_total: saleAmountUsd, // En USD
            currency: "USD",
            paid: paidUsd, // En USD
            debt: debtUsd, // En USD
            departure_date: operation.departure_date,
          })
          totalDebt += debtUsd
        }
      }

      // Filtro por ID de cliente
      if (customerIdFilter && customer.id !== customerIdFilter) {
        // Si hay filtro de cliente y no coincide, saltar este cliente
        continue
      }

      if (operationsWithDebt.length > 0) {
        debtors.push({
          customer,
          totalDebt,
          currency,
          operationsWithDebt,
        })
      }
    }

    // Sort by total debt (descending)
    debtors.sort((a, b) => b.totalDebt - a.totalDebt)

    return NextResponse.json({ debtors })
  } catch (error) {
    console.error("Error in GET /api/accounting/debts-sales:", error)
    return NextResponse.json({ error: "Error al obtener deudores" }, { status: 500 })
  }
}
