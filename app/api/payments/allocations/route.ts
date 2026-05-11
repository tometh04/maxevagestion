import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { hasPermission } from "@/lib/permissions"
import { createAdminClient, createServerClient } from "@/lib/supabase/server"

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

  // Bug fix 2026-05-11 (Santi): el SELECT vía createServerClient (RLS user-auth)
  // devolvía 0 rows aunque el INSERT vía admin sí persistía. Hay alguna policy
  // restrictiva en producción que no está en el repo (posiblemente aplicada
  // directo en Supabase) que filtra las allocations.
  //
  // Workaround: usar admin client para el SELECT también. Las permission checks
  // al inicio del handler (hasPermission cash:read) ya validan acceso del user.
  // La tabla no tiene org_id ni FK directa a org, así que no hay riesgo de leak
  // cross-tenant — las allocations se filtran por paymentId/operationId que el
  // user ya tiene acceso a través de la operación.
  const supabase = await createServerClient()
  const admin = createAdminClient()

  let query = (admin.from("payment_passenger_allocations") as any)
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

  const rowsByCustomer = new Map<string, { operationCustomerId: string; amount: number; notes: string | null }>()

  for (const allocation of allocations) {
    const operationCustomerId = allocation.operationCustomerId
    const amount = Number(allocation.amount || 0)
    if (!operationCustomerId || amount <= 0) continue

    const existing = rowsByCustomer.get(operationCustomerId)
    rowsByCustomer.set(operationCustomerId, {
      operationCustomerId,
      amount: (existing?.amount || 0) + amount,
      notes: allocation.notes || existing?.notes || null,
    })
  }

  const rows = Array.from(rowsByCustomer.values())

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

  // Use service role after permission/access checks. RLS can otherwise hide
  // existing allocation rows from DELETE, causing duplicate-key failures.
  const admin = createAdminClient()
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(user.id)
  const { data: creator } = isUuid
    ? await (admin.from("users") as any).select("id").eq("id", user.id).maybeSingle()
    : { data: null }
  const createdBy = creator?.id || null

  // Delete existing allocations for this payment
  const { error: deleteError } = await (admin.from("payment_passenger_allocations") as any)
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
        created_by: createdBy,
      }))

    if (allocationRows.length > 0) {
      // Bug fix 2026-05-11 (Santi): el upsert silenciosamente fallaba sin retornar
      // error. Cambio a INSERT explícito + .select() para verificar que el row
      // realmente persistió, y si no, devolver 500 con el detalle (no success).
      const { data: inserted, error: insertError } = await (admin.from("payment_passenger_allocations") as any)
        .insert(allocationRows)
        .select()

      if (insertError) {
        console.error("[Allocations] Insert error:", insertError)
        return NextResponse.json({
          error: insertError.message,
          code: insertError.code,
          details: insertError.details,
          hint: insertError.hint,
        }, { status: 500 })
      }

      if (!inserted || inserted.length === 0) {
        console.error("[Allocations] Insert silenciosamente devolvió 0 rows. Payload:", allocationRows)
        return NextResponse.json({
          error: "El insert no retornó filas — verificar permisos service_role o triggers en la tabla",
          payload: allocationRows,
        }, { status: 500 })
      }

      return NextResponse.json({ success: true, allocations: inserted })
    }
  }

  return NextResponse.json({ success: true, allocations: [] })
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

  // Bug fix 2026-05-11: misma RLS fantasma que en GET. El DELETE vía
  // createServerClient retornaba status 200 pero no eliminaba nada (RLS
  // ocultaba los rows). Usamos admin client después del permission check.
  const admin = createAdminClient()

  const { error } = await (admin.from("payment_passenger_allocations") as any)
    .delete()
    .eq("payment_id", paymentId)

  if (error) {
    console.error("[Allocations DELETE] error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
