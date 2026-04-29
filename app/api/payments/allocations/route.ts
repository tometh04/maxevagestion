import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { hasPermission } from "@/lib/permissions"
import { createServerClient } from "@/lib/supabase/server"

/**
 * GET /api/payments/allocations?operationId=xxx
 * Get all payment-passenger allocations for an operation
 */
export async function GET(request: Request) {
  const { user } = await getCurrentUser()
  const userRole = user.role as any

  if (!hasPermission(userRole, "cash", "read")) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const operationId = searchParams.get("operationId")
  const paymentId = searchParams.get("paymentId")

  if (!operationId && !paymentId) {
    return NextResponse.json({ error: "operationId o paymentId requerido" }, { status: 400 })
  }

  const supabase = await createServerClient()

  let query = (supabase.from("payment_passenger_allocations") as any)
    .select(`
      *,
      operation_customers:operation_customer_id(
        id,
        customer_id,
        role,
        customers:customer_id(id, first_name, last_name, email)
      )
    `)

  if (paymentId) {
    query = query.eq("payment_id", paymentId)
  }

  if (operationId) {
    // Get all payment IDs for this operation first
    const { data: payments } = await supabase
      .from("payments")
      .select("id")
      .eq("operation_id", operationId)

    if (!payments || payments.length === 0) {
      return NextResponse.json({ allocations: [] })
    }

    const paymentIds = payments.map((p: any) => p.id)
    query = query.in("payment_id", paymentIds)
  }

  const { data: allocations, error } = await query.order("created_at", { ascending: true })

  if (error) {
    console.error("[Allocations] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ allocations: allocations || [] })
}

/**
 * POST /api/payments/allocations
 * Create or update allocations for a payment
 * Body: { paymentId, allocations: [{ operationCustomerId, amount }] }
 */
export async function POST(request: Request) {
  const { user } = await getCurrentUser()
  const userRole = user.role as any

  if (!hasPermission(userRole, "cash", "write")) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
  }

  const body = await request.json()
  const { paymentId, allocations } = body

  if (!paymentId || !allocations || !Array.isArray(allocations)) {
    return NextResponse.json({ error: "paymentId y allocations son requeridos" }, { status: 400 })
  }

  if (allocations.some((allocation: any) => Number(allocation.amount || 0) < 0)) {
    return NextResponse.json({ error: "Los montos asignados no pueden ser negativos" }, { status: 400 })
  }

  const supabase = await createServerClient()

  // Verify payment exists and get its amount
  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select("id, amount, currency, operation_id")
    .eq("id", paymentId)
    .single()

  if (paymentError || !payment) {
    return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 })
  }

  const rows = allocations
    .map((allocation: any) => ({
      operationCustomerId: allocation.operationCustomerId,
      amount: Number(allocation.amount || 0),
      notes: allocation.notes || null,
    }))
    .filter((allocation: any) => allocation.amount > 0)

  if (rows.some((allocation: any) => !allocation.operationCustomerId || Number.isNaN(allocation.amount))) {
    return NextResponse.json({ error: "Asignaciones inválidas" }, { status: 400 })
  }

  const operationCustomerIds = Array.from(new Set(rows.map((allocation: any) => allocation.operationCustomerId)))

  if (operationCustomerIds.length > 0) {
    const { data: linkedCustomers, error: linkedCustomersError } = await (supabase
      .from("operation_customers") as any)
      .select("id, operation_id")
      .in("id", operationCustomerIds)

    if (linkedCustomersError) {
      console.error("[Allocations] Operation customer validation error:", linkedCustomersError)
      return NextResponse.json({ error: "Error validando pasajeros" }, { status: 500 })
    }

    const linkedIds = new Set((linkedCustomers || []).map((customer: any) => customer.id))
    const hasInvalidCustomer =
      linkedIds.size !== operationCustomerIds.length ||
      (linkedCustomers || []).some((customer: any) => customer.operation_id !== (payment as any).operation_id)

    if (hasInvalidCustomer) {
      return NextResponse.json(
        { error: "Una asignación pertenece a otra operación o a un pasajero inexistente" },
        { status: 400 }
      )
    }
  }

  // Validate total allocations don't exceed payment amount
  const totalAllocated = rows.reduce((sum: number, allocation: any) => sum + allocation.amount, 0)
  if (totalAllocated > Number((payment as any).amount) + 0.01) {
    return NextResponse.json({
      error: `El total asignado ($${totalAllocated.toFixed(2)}) supera el monto del pago ($${(payment as any).amount})`,
    }, { status: 400 })
  }

  // Delete existing allocations for this payment
  const { error: deleteError } = await (supabase.from("payment_passenger_allocations") as any)
    .delete()
    .eq("payment_id", paymentId)

  if (deleteError) {
    console.error("[Allocations] Delete error:", deleteError)
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  // Insert new allocations
  if (rows.length > 0) {
    const allocationRows = rows
      .map((allocation: any) => ({
        payment_id: paymentId,
        operation_customer_id: allocation.operationCustomerId,
        amount: allocation.amount,
        currency: (payment as any).currency || "ARS",
        notes: allocation.notes,
        created_by: user.id,
      }))

    if (allocationRows.length > 0) {
      const { error: insertError } = await (supabase.from("payment_passenger_allocations") as any)
        .insert(allocationRows)

      if (insertError) {
        console.error("[Allocations] Insert error:", insertError)
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }
    }
  }

  return NextResponse.json({ success: true })
}

/**
 * DELETE /api/payments/allocations?paymentId=xxx
 * Delete all allocations for a payment
 */
export async function DELETE(request: Request) {
  const { user } = await getCurrentUser()
  const userRole = user.role as any

  if (!hasPermission(userRole, "cash", "write")) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const paymentId = searchParams.get("paymentId")

  if (!paymentId) {
    return NextResponse.json({ error: "paymentId requerido" }, { status: 400 })
  }

  const supabase = await createServerClient()

  await (supabase.from("payment_passenger_allocations") as any)
    .delete()
    .eq("payment_id", paymentId)

  return NextResponse.json({ success: true })
}
