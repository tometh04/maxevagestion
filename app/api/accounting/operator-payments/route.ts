import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getOverdueOperatorPayments, updateOverduePayments } from "@/lib/accounting/operator-payments"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const operatorId = searchParams.get("operatorId") || undefined
    const status = searchParams.get("status") || undefined
    const agencyId = searchParams.get("agencyId")
    const dueDateFrom = searchParams.get("dueDateFrom") || undefined
    const dueDateTo = searchParams.get("dueDateTo") || undefined
    const amountMin = searchParams.get("amountMin") || undefined
    const amountMax = searchParams.get("amountMax") || undefined
    const operationSearch = searchParams.get("operationSearch") || undefined

    console.log("[OperatorPayments API] Params:", { operatorId, status, agencyId, dueDateFrom, dueDateTo })

    // Update overdue payments first
    await updateOverduePayments(supabase)

    // Build query - obtener TODOS los pagos del operador si se especifica operatorId
    let query = (supabase.from("operator_payments") as any)
      .select(
        `
        *,
        operations:operation_id (id, destination, file_code, sale_amount_total, agency_id),
        operators:operator_id (id, name, contact_email),
        ledger_movements:ledger_movement_id (id, created_at)
      `
      )
      .order("due_date", { ascending: true })

    if (operatorId) {
      console.log("[OperatorPayments API] Filtering by operatorId:", operatorId)
      query = query.eq("operator_id", operatorId)
    }

    if (status) {
      query = query.eq("status", status)
    }

    if (dueDateFrom) {
      query = query.gte("due_date", dueDateFrom)
    }

    if (dueDateTo) {
      // Agregar 23:59:59 para incluir todo el día
      const dateTo = new Date(dueDateTo)
      dateTo.setHours(23, 59, 59, 999)
      query = query.lte("due_date", dateTo.toISOString())
    }

    const { data: payments, error } = await query

    if (error) {
      console.error("Error fetching operator payments:", error)
      return NextResponse.json({ error: "Error al obtener pagos a operadores" }, { status: 500 })
    }

    console.log("[OperatorPayments API] Query returned", payments?.length || 0, "payments")
    if (payments && payments.length > 0 && operatorId) {
      console.log("[OperatorPayments API] First payment:", {
        id: payments[0].id,
        operator_id: payments[0].operator_id,
        status: payments[0].status,
        currency: payments[0].currency,
        amount: payments[0].amount,
        paid_amount: payments[0].paid_amount,
      })
    }

    // Filtrar por agencia si se especifica
    let filteredPayments = payments || []
    if (agencyId && agencyId !== "ALL") {
      filteredPayments = filteredPayments.filter((p: any) => {
        const operation = p.operations
        return operation && operation.agency_id === agencyId
      })
    }

    // Filtrar por monto
    if (amountMin) {
      const minAmount = parseFloat(amountMin)
      if (!isNaN(minAmount)) {
        filteredPayments = filteredPayments.filter((p: any) => {
          const amount = parseFloat(p.amount || "0")
          return amount >= minAmount
        })
      }
    }

    if (amountMax) {
      const maxAmount = parseFloat(amountMax)
      if (!isNaN(maxAmount)) {
        filteredPayments = filteredPayments.filter((p: any) => {
          const amount = parseFloat(p.amount || "0")
          return amount <= maxAmount
        })
      }
    }

    // Filtrar por búsqueda de operación (código o destino)
    if (operationSearch) {
      const searchLower = operationSearch.toLowerCase().trim()
      filteredPayments = filteredPayments.filter((p: any) => {
        const operation = p.operations
        if (!operation) return false
        const fileCode = (operation.file_code || "").toLowerCase()
        const destination = (operation.destination || "").toLowerCase()
        return fileCode.includes(searchLower) || destination.includes(searchLower)
      })
    }

    return NextResponse.json({ payments: filteredPayments })
  } catch (error) {
    console.error("Error in GET /api/accounting/operator-payments:", error)
    return NextResponse.json({ error: "Error al obtener pagos a operadores" }, { status: 500 })
  }
}

