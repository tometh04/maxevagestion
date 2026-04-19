import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { applyCustomersFilters } from "@/lib/permissions-api"
import { getExchangeRate, getLatestExchangeRate, DEFAULT_USD_ARS_FALLBACK_RATE } from "@/lib/accounting/exchange-rates"

export const dynamic = "force-dynamic"

type AgingBucket = "current" | "days_31_60" | "days_61_90" | "days_91_120" | "days_120_plus"

interface BucketSummary {
  count: number
  total_usd: number
  total_ars: number
}

interface AgingDetail {
  customer_name?: string
  operator_name?: string
  operation_id: string
  file_code: string | null
  destination?: string
  amount: number
  currency: string
  age_days: number
  bucket: AgingBucket
  reference_date: string | null
}

interface AgingSection {
  current: BucketSummary
  days_31_60: BucketSummary
  days_61_90: BucketSummary
  days_91_120: BucketSummary
  days_120_plus: BucketSummary
  total: BucketSummary
  details: AgingDetail[]
}

function emptyBucket(): BucketSummary {
  return { count: 0, total_usd: 0, total_ars: 0 }
}

function emptySection(): AgingSection {
  return {
    current: emptyBucket(),
    days_31_60: emptyBucket(),
    days_61_90: emptyBucket(),
    days_91_120: emptyBucket(),
    days_120_plus: emptyBucket(),
    total: emptyBucket(),
    details: [],
  }
}

function getBucket(ageDays: number): AgingBucket {
  if (ageDays <= 30) return "current"
  if (ageDays <= 60) return "days_31_60"
  if (ageDays <= 90) return "days_61_90"
  if (ageDays <= 120) return "days_91_120"
  return "days_120_plus"
}

function addToBucket(section: AgingSection, bucket: AgingBucket, amountUsd: number, amountArs: number) {
  section[bucket].count += 1
  section[bucket].total_usd += amountUsd
  section[bucket].total_ars += amountArs
  section.total.count += 1
  section.total.total_usd += amountUsd
  section.total.total_ars += amountArs
}

function daysBetween(dateStr: string, now: Date): number {
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
}

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Check permissions - only ADMIN, SUPER_ADMIN, CONTABLE
    if (!canAccessModule(user.role as any, "accounting")) {
      return NextResponse.json({ error: "No tiene permiso para ver esta seccion" }, { status: 403 })
    }

    const type = searchParams.get("type") || "both" // receivable | payable | both
    const currencyFilter = searchParams.get("currency") || "ALL" // ARS | USD | ALL
    const agencyId = searchParams.get("agencyId") || null

    const now = new Date()
    const latestExchangeRate = await getLatestExchangeRate(supabase) || DEFAULT_USD_ARS_FALLBACK_RATE

    const result: { receivable: AgingSection | null; payable: AgingSection | null } = {
      receivable: null,
      payable: null,
    }

    // =============================================
    // RECEIVABLE (Cuentas por cobrar - customer debts)
    // =============================================
    if (type === "receivable" || type === "both") {
      const receivable = emptySection()

      const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

      // Get customers with operations — .select() FIRST so applyCustomersFilters can chain .eq()
      let query = supabase.from("customers").select(`
          id,
          first_name,
          last_name,
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
              departure_date,
              created_at,
              agency_id
            )
          )
        `)

      try {
        const applied = await applyCustomersFilters(query, user, agencyIds, supabase)
        query = applied.query
      } catch (error: any) {
        console.error("Error applying customers filters:", error)
        return NextResponse.json({ error: error.message }, { status: 403 })
      }

      const { data: customers, error: customersError } = await query

      if (customersError) {
        console.error("Error fetching customers for aging:", customersError)
        return NextResponse.json({ error: "Error al obtener clientes" }, { status: 500 })
      }

      // Collect all operation IDs
      const allOperationIds: string[] = []
      customers?.forEach((customer: any) => {
        customer.operation_customers?.forEach((oc: any) => {
          if (oc.operation_id) {
            allOperationIds.push(oc.operation_id)
          }
        })
      })

      // Get payments for these operations
      const paymentsByOperation: Record<string, { paidUsd: number; paidArs: number }> = {}
      if (allOperationIds.length > 0) {
        // Supabase .in() revienta URL con >300 UUIDs — chunk de 200 por seguridad
        const chunkSize = 200
        for (let i = 0; i < allOperationIds.length; i += chunkSize) {
          const chunk = allOperationIds.slice(i, i + chunkSize)
          const { data: payments } = await supabase
            .from("payments")
            .select("operation_id, amount, amount_usd, currency, exchange_rate, status, direction")
            .in("operation_id", chunk)
            .eq("direction", "INCOME")
            .eq("payer_type", "CUSTOMER")

          if (payments) {
            payments.forEach((payment: any) => {
              const opId = payment.operation_id
              if (!paymentsByOperation[opId]) {
                paymentsByOperation[opId] = { paidUsd: 0, paidArs: 0 }
              }
              if (payment.status === "PAID") {
                if (payment.currency === "ARS") {
                  paymentsByOperation[opId].paidArs += Number(payment.amount) || 0
                }
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
      }

      // Process each customer/operation for aging
      for (const customer of (customers || []) as any[]) {
        const customerName = `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || "Sin nombre"
        const operations = (customer.operation_customers || []) as any[]

        for (const oc of operations) {
          const operation = oc.operations
          if (!operation) continue

          // Agency filter
          if (agencyId && agencyId !== "ALL" && operation.agency_id !== agencyId) {
            continue
          }

          const opId = operation.id
          const saleCurrency = operation.sale_currency || operation.currency || "USD"
          const saleAmount = Number(operation.sale_amount_total) || 0

          // Convert sale amount to USD
          let saleAmountUsd = saleAmount
          let saleAmountArs = 0
          if (saleCurrency === "ARS") {
            saleAmountArs = saleAmount
            const operationDate = operation.departure_date || operation.created_at
            let exchangeRate = await getExchangeRate(supabase, operationDate ? new Date(operationDate) : new Date())
            if (!exchangeRate) exchangeRate = latestExchangeRate
            saleAmountUsd = saleAmount / exchangeRate
          } else {
            saleAmountUsd = saleAmount
          }

          const paymentData = paymentsByOperation[opId] || { paidUsd: 0, paidArs: 0 }
          const debtUsd = Math.max(0, saleAmountUsd - paymentData.paidUsd)
          const debtArs = saleCurrency === "ARS" ? Math.max(0, saleAmountArs - paymentData.paidArs) : 0

          if (debtUsd <= 0.01) continue // No debt, skip

          // Currency filter
          if (currencyFilter === "USD" && saleCurrency !== "USD") continue
          if (currencyFilter === "ARS" && saleCurrency !== "ARS") continue

          // Calculate age from departure_date or created_at
          const referenceDate = operation.departure_date || operation.created_at
          const ageDays = referenceDate ? daysBetween(referenceDate, now) : 0
          const bucket = getBucket(ageDays)

          addToBucket(receivable, bucket, debtUsd, debtArs)

          receivable.details.push({
            customer_name: customerName,
            operation_id: opId,
            file_code: operation.file_code,
            destination: operation.destination || "Sin destino",
            amount: debtUsd,
            currency: "USD",
            age_days: ageDays,
            bucket,
            reference_date: referenceDate,
          })
        }
      }

      // Sort details by age descending (oldest first)
      receivable.details.sort((a, b) => b.age_days - a.age_days)

      result.receivable = receivable
    }

    // =============================================
    // PAYABLE (Cuentas por pagar - operator debts)
    // =============================================
    if (type === "payable" || type === "both") {
      const payable = emptySection()

      let opQuery = (supabase.from("operator_payments") as any)
        .select(`
          id,
          operation_id,
          operator_id,
          amount,
          paid_amount,
          currency,
          status,
          due_date,
          notes,
          operations:operation_id (id, file_code, destination, agency_id),
          operators:operator_id (id, name)
        `)
        .neq("status", "PAID")

      if (agencyId && agencyId !== "ALL") {
        // We'll filter after the query since agency_id is on the operations relation
      }

      const { data: operatorPayments, error: opError } = await opQuery

      if (opError) {
        console.error("Error fetching operator payments for aging:", opError)
        return NextResponse.json({ error: "Error al obtener pagos a operadores" }, { status: 500 })
      }

      for (const payment of (operatorPayments || []) as any[]) {
        // Agency filter
        if (agencyId && agencyId !== "ALL") {
          const operation = payment.operations
          if (operation && operation.agency_id !== agencyId) continue
        }

        const amount = Number(payment.amount) || 0
        const paidAmount = Number(payment.paid_amount) || 0
        const debt = Math.max(0, amount - paidAmount)

        if (debt <= 0.01) continue

        const payCurrency = payment.currency || "USD"

        // Currency filter
        if (currencyFilter === "USD" && payCurrency !== "USD") continue
        if (currencyFilter === "ARS" && payCurrency !== "ARS") continue

        const debtUsd = payCurrency === "USD" ? debt : 0
        const debtArs = payCurrency === "ARS" ? debt : 0

        // Calculate age from due_date
        const referenceDate = payment.due_date
        const ageDays = referenceDate ? daysBetween(referenceDate, now) : 0
        const bucket = getBucket(ageDays)

        addToBucket(payable, bucket, debtUsd, debtArs)

        const operatorName = payment.operators?.name || "Sin operador"
        const operation = payment.operations

        payable.details.push({
          operator_name: operatorName,
          operation_id: payment.operation_id || "",
          file_code: operation?.file_code || null,
          destination: operation?.destination || "Sin destino",
          amount: debt,
          currency: payCurrency,
          age_days: ageDays,
          bucket,
          reference_date: referenceDate,
        })
      }

      // Sort details by age descending (oldest first)
      payable.details.sort((a, b) => b.age_days - a.age_days)

      result.payable = payable
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Error in GET /api/accounting/aging:", error)
    return NextResponse.json({ error: "Error al obtener aging de cuentas" }, { status: 500 })
  }
}
