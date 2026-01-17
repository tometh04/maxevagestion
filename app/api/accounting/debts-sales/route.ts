import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canAccessModule } from "@/lib/permissions"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { applyCustomersFilters } from "@/lib/permissions-api"

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

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
    let paymentsByOperation: Record<string, { paid: number; currency: string }> = {}
    if (allOperationIds.length > 0) {
      const { data: payments } = await supabase
        .from("payments")
        .select("operation_id, amount, currency, status, direction")
        .in("operation_id", allOperationIds)
        .eq("direction", "INCOME")
        .eq("payer_type", "CUSTOMER")

      if (payments) {
        payments.forEach((payment: any) => {
          const opId = payment.operation_id
          if (!paymentsByOperation[opId]) {
            paymentsByOperation[opId] = { paid: 0, currency: payment.currency || "ARS" }
          }
          if (payment.status === "PAID") {
            paymentsByOperation[opId].paid += Number(payment.amount) || 0
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

    customers?.forEach((customer: any) => {
      const operations = customer.operation_customers || []
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

      operations.forEach((oc: any) => {
        const operation = oc.operations
        if (!operation) return

        const opId = operation.id
        const saleAmount = Number(operation.sale_amount_total) || 0
        const paymentData = paymentsByOperation[opId] || { paid: 0, currency: operation.currency || "ARS" }
        const paid = paymentData.paid
        const debt = Math.max(0, saleAmount - paid)

        currency = operation.currency || "ARS"

        if (debt > 0) {
          operationsWithDebt.push({
            id: opId,
            file_code: operation.file_code,
            destination: operation.destination || "Sin destino",
            sale_amount_total: saleAmount,
            currency: operation.currency || "ARS",
            paid,
            debt,
            departure_date: operation.departure_date,
          })
          totalDebt += debt
        }
      })

      if (operationsWithDebt.length > 0) {
        debtors.push({
          customer,
          totalDebt,
          currency,
          operationsWithDebt,
        })
      }
    })

    // Sort by total debt (descending)
    debtors.sort((a, b) => b.totalDebt - a.totalDebt)

    return NextResponse.json({ debtors })
  } catch (error) {
    console.error("Error in GET /api/accounting/debts-sales:", error)
    return NextResponse.json({ error: "Error al obtener deudores" }, { status: 500 })
  }
}
