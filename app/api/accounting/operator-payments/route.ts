import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getOverdueOperatorPayments, updateOverduePayments } from "@/lib/accounting/operator-payments"
import {
  getEffectiveOperatorPaymentStatus,
  hasPendingBalance,
} from "@/lib/accounting/operator-payment-settlement"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const operatorId = searchParams.get("operatorId") || undefined
    const status = searchParams.get("status") || undefined
    const agencyId = searchParams.get("agencyId")
    // Backward-compat: aceptar dueDateFrom/dueDateTo legacy + nuevos dateFrom/dateTo
    const dateFrom = searchParams.get("dateFrom") || searchParams.get("dueDateFrom") || undefined
    const dateTo = searchParams.get("dateTo") || searchParams.get("dueDateTo") || undefined
    const dateType = (searchParams.get("dateType") || "VENCIMIENTO").toUpperCase()
    const amountMin = searchParams.get("amountMin") || undefined
    const amountMax = searchParams.get("amountMax") || undefined
    const operationSearch = searchParams.get("operationSearch") || undefined

    // Update overdue payments first
    await updateOverduePayments(supabase)

    // Build query - obtener TODOS los pagos del operador si se especifica operatorId
    let query = (supabase.from("operator_payments") as any)
      .select(
        `
        *,
        operations:operation_id (id, destination, file_code, sale_amount_total, agency_id),
        operators:operator_id (id, name, contact_email),
        ledger_movements:ledger_movement_id (id, created_at, receipt_number, method, notes, account_id, financial_accounts:account_id(name))
      `
      )
      .order("due_date", { ascending: true })

    if (operatorId) {
      query = query.eq("operator_id", operatorId)
    }

    if (status && status !== "UNPAID") {
      query = query.eq("status", status)
    }

    // dateType:
    // - VENCIMIENTO (default): operator_payments.due_date
    // - OPERACION: pre-resolver operation_ids cuya operations.operation_date ∈ [from,to]
    //   y restringir operator_payments.operation_id IN (...). Pagos sin operación quedan fuera.
    if (dateType === "OPERACION" && (dateFrom || dateTo)) {
      let opQuery = (supabase.from("operations") as any).select("id")
      if (dateFrom) opQuery = opQuery.gte("operation_date", dateFrom)
      if (dateTo) opQuery = opQuery.lte("operation_date", dateTo)
      const { data: matchingOps } = await opQuery.limit(5000)
      const opIds = (matchingOps || []).map((o: any) => o.id)
      if (opIds.length === 0) {
        return NextResponse.json({ payments: [] })
      }
      query = query.in("operation_id", opIds)
    } else {
      // VENCIMIENTO (default)
      if (dateFrom) {
        query = query.gte("due_date", dateFrom)
      }
      if (dateTo) {
        // Agregar 23:59:59 para incluir todo el día
        const dateToEnd = new Date(dateTo)
        dateToEnd.setHours(23, 59, 59, 999)
        query = query.lte("due_date", dateToEnd.toISOString())
      }
    }

    const { data: payments, error } = await query

    if (error) {
      console.error("Error fetching operator payments:", error)
      return NextResponse.json({ error: "Error al obtener pagos a operadores" }, { status: 500 })
    }

    // Filtrar por agencia si se especifica
    let filteredPayments = (payments || []).map((payment: any) => ({
      ...payment,
      status: getEffectiveOperatorPaymentStatus(payment),
    }))

    if (status === "UNPAID") {
      filteredPayments = filteredPayments.filter((payment: any) => hasPendingBalance(payment))
    }
    if (agencyId && agencyId !== "ALL") {
      filteredPayments = filteredPayments.filter((p: any) => {
        const operation = p.operations
        return operation && operation.agency_id === agencyId
      })
    }

    // Filtrar por deuda (amount - paid_amount)
    if (amountMin) {
      const minAmount = parseFloat(amountMin)
      if (!isNaN(minAmount)) {
        filteredPayments = filteredPayments.filter((p: any) => {
          const amount = parseFloat(p.amount || "0")
          const paid = parseFloat(p.paid_amount || "0")
          const debt = amount - paid
          return debt >= minAmount
        })
      }
    }

    if (amountMax) {
      const maxAmount = parseFloat(amountMax)
      if (!isNaN(maxAmount)) {
        filteredPayments = filteredPayments.filter((p: any) => {
          const amount = parseFloat(p.amount || "0")
          const paid = parseFloat(p.paid_amount || "0")
          const debt = amount - paid
          return debt <= maxAmount
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

    // Enriquecer pagos con nombre del pasajero principal
    const enrichedPayments = await Promise.all(
      filteredPayments.map(async (payment: any) => {
        if (payment.operations?.id) {
          const { data: mainCustomer } = await (supabase.from("operation_customers") as any)
            .select(`
              customers:customer_id (first_name, last_name)
            `)
            .eq("operation_id", payment.operations.id)
            .eq("role", "MAIN")
            .maybeSingle()
          
          if (mainCustomer?.customers) {
            const c = mainCustomer.customers as any
            const firstName = c.first_name || ""
            const lastName = c.last_name || ""
            payment.operations.main_passenger_name = `${firstName} ${lastName}`.trim()
          }
        }
        return payment
      })
    )

    return NextResponse.json({ payments: enrichedPayments })
  } catch (error) {
    console.error("Error in GET /api/accounting/operator-payments:", error)
    return NextResponse.json({ error: "Error al obtener pagos a operadores" }, { status: 500 })
  }
}

// POST - Crear pago manual a operador (sin operación)
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const body = await request.json()

    const {
      operator_id,
      amount,
      currency,
      due_date,
      notes,
    } = body

    // Validaciones
    if (!operator_id || !amount || !currency || !due_date) {
      return NextResponse.json({ error: "Faltan campos requeridos (operator_id, amount, currency, due_date)" }, { status: 400 })
    }

    if (amount <= 0) {
      return NextResponse.json({ error: "El monto debe ser mayor a 0" }, { status: 400 })
    }

    // Validar que el operador existe
    const { data: operator, error: operatorError } = await (supabase.from("operators") as any)
      .select("id")
      .eq("id", operator_id)
      .single()

    if (operatorError || !operator) {
      return NextResponse.json({ error: "Operador no encontrado" }, { status: 404 })
    }

    // Crear operator_payment manual (sin operation_id)
    const { data: operatorPayment, error: paymentError } = await (supabase.from("operator_payments") as any)
      .insert({
        operation_id: null, // Pago manual sin operación
        operator_id,
        amount: parseFloat(amount),
        currency,
        due_date,
        status: "PENDING",
        paid_amount: 0,
        notes: notes || null,
      })
      .select()
      .single()

    if (paymentError) {
      console.error("Error creating operator payment:", paymentError)
      return NextResponse.json({ error: `Error al crear pago: ${paymentError.message}` }, { status: 500 })
    }

    return NextResponse.json({ payment: operatorPayment }, { status: 201 })
  } catch (error: any) {
    console.error("Error in POST /api/accounting/operator-payments:", error)
    return NextResponse.json({ error: error.message || "Error al crear pago a operador" }, { status: 500 })
  }
}

// PATCH - Actualizar pago a operador (moneda, monto, fecha de vencimiento)
export async function PATCH(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (!["ADMIN", "SUPER_ADMIN", "CONTABLE"].includes(user.role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const body = await request.json()
    const { id, currency, amount, due_date, notes } = body

    if (!id) {
      return NextResponse.json({ error: "Se requiere el ID del pago" }, { status: 400 })
    }

    const updateData: Record<string, any> = {}
    if (currency) updateData.currency = currency
    if (amount !== undefined) updateData.amount = parseFloat(amount)
    if (due_date) updateData.due_date = due_date
    if (notes !== undefined) updateData.notes = notes

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No hay campos para actualizar" }, { status: 400 })
    }

    const { data: updated, error } = await (supabase.from("operator_payments") as any)
      .update(updateData)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("Error updating operator payment:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ payment: updated })
  } catch (error: any) {
    console.error("Error in PATCH /api/accounting/operator-payments:", error)
    return NextResponse.json({ error: error.message || "Error al actualizar pago" }, { status: 500 })
  }
}
