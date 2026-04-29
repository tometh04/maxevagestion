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

  // Validate total allocations don't exceed payment amount
  const totalAllocated = allocations.reduce((sum: number, a: any) => sum + Number(a.amount || 0), 0)
  if (totalAllocated > Number((payment as any).amount) * 1.01) { // 1% tolerance for rounding
    return NextResponse.json({
      error: `El total asignado ($${totalAllocated.toFixed(2)}) supera el monto del pago ($${(payment as any).amount})`,
    }, { status: 400 })
  }

  // Delete existing allocations for this payment
  await (supabase.from("payment_passenger_allocations") as any)
    .delete()
    .eq("payment_id", paymentId)

  // Insert new allocations
  if (allocations.length > 0) {
    const rows = allocations
      .filter((a: any) => Number(a.amount) > 0)
      .map((a: any) => ({
        payment_id: paymentId,
        operation_customer_id: a.operationCustomerId,
        amount: Number(a.amount),
        currency: (payment as any).currency || "ARS",
        notes: a.notes || null,
        created_by: user.id,
      }))

    if (rows.length > 0) {
      const { error: insertError } = await (supabase.from("payment_passenger_allocations") as any)
        .insert(rows)

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
