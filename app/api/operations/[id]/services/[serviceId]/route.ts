import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"

// Campos editables del servicio (whitelist)
const EDITABLE_FIELDS = [
  "service_type", "description", "operator_id",
  "sale_amount", "sale_currency", "cost_amount", "cost_currency",
  // Hotel
  "hotel_name", "hotel_stars", "hotel_address", "hotel_phone",
  "room_type", "meal_plan", "checkin_date", "checkout_date", "nights", "rooms",
  // Flight
  "airline", "flight_route", "flight_date", "flight_return_date", "flight_stops", "flight_class",
]

// ─────────────────────────────────────────────
// PATCH: Editar un servicio de una operación
// Actualiza campos del servicio y recalcula
// registros contables si cambian los montos
// ─────────────────────────────────────────────
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; serviceId: string }> }
) {
  try {
    const { user } = await getCurrentUser()

    if (!canPerformAction(user, "operations", "write")) {
      return NextResponse.json({ error: "No tiene permiso para editar servicios" }, { status: 403 })
    }

    const { id: operationId, serviceId } = await params
    const supabase = await createServerClient()

    // Verificar operación
    const { data: operation, error: opError } = await (supabase.from("operations") as any)
      .select("id, seller_id, status, agency_id, file_code, destination, departure_date")
      .eq("id", operationId)
      .single()

    if (opError || !operation) {
      return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 })
    }

    if (user.role === "SELLER" && operation.seller_id !== user.id) {
      return NextResponse.json({ error: "No tiene acceso a esta operación" }, { status: 403 })
    }

    if (operation.status === "CANCELLED") {
      return NextResponse.json({ error: "No se puede editar servicios de una operación cancelada" }, { status: 400 })
    }

    // Obtener servicio actual
    const { data: currentService, error: serviceError } = await (supabase.from("operation_services") as any)
      .select("*")
      .eq("id", serviceId)
      .eq("operation_id", operationId)
      .single()

    if (serviceError || !currentService) {
      return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 })
    }

    const body = await request.json()

    // Filtrar solo campos editables
    const updateData: Record<string, any> = {}
    for (const field of EDITABLE_FIELDS) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No se proporcionaron campos para actualizar" }, { status: 400 })
    }

    // Validaciones
    if (updateData.sale_amount !== undefined && Number(updateData.sale_amount) < 0) {
      return NextResponse.json({ error: "El precio de venta debe ser >= 0" }, { status: 400 })
    }
    if (updateData.cost_amount !== undefined && Number(updateData.cost_amount) < 0) {
      return NextResponse.json({ error: "El costo debe ser >= 0" }, { status: 400 })
    }
    if (updateData.sale_currency && !["ARS", "USD"].includes(updateData.sale_currency)) {
      return NextResponse.json({ error: "Moneda de venta inválida" }, { status: 400 })
    }
    if (updateData.cost_currency && !["ARS", "USD"].includes(updateData.cost_currency)) {
      return NextResponse.json({ error: "Moneda de costo inválida" }, { status: 400 })
    }

    // Convertir tipos numéricos
    if (updateData.sale_amount !== undefined) updateData.sale_amount = Number(updateData.sale_amount)
    if (updateData.cost_amount !== undefined) updateData.cost_amount = Number(updateData.cost_amount)
    if (updateData.hotel_stars !== undefined) updateData.hotel_stars = updateData.hotel_stars ? Number(updateData.hotel_stars) : null
    if (updateData.nights !== undefined) updateData.nights = updateData.nights ? Number(updateData.nights) : null
    if (updateData.rooms !== undefined) updateData.rooms = updateData.rooms ? Number(updateData.rooms) : null
    if (updateData.flight_stops !== undefined) updateData.flight_stops = updateData.flight_stops != null ? Number(updateData.flight_stops) : 0

    updateData.updated_at = new Date().toISOString()

    // Actualizar servicio
    const { data: updatedService, error: updateError } = await (supabase.from("operation_services") as any)
      .update(updateData)
      .eq("id", serviceId)
      .select("*, operators:operator_id(id, name)")
      .single()

    if (updateError) {
      console.error("[Services PATCH] Error actualizando servicio:", updateError)
      return NextResponse.json({ error: "Error al actualizar el servicio" }, { status: 500 })
    }

    const warnings: string[] = []

    // ── Actualizar registros contables si cambiaron los montos ──
    const saleChanged = updateData.sale_amount !== undefined && updateData.sale_amount !== Number(currentService.sale_amount)
    const costChanged = updateData.cost_amount !== undefined && updateData.cost_amount !== Number(currentService.cost_amount)

    // Actualizar ledger INCOME si cambió sale_amount
    if (saleChanged && currentService.ledger_income_id) {
      const { error: ledgerErr } = await (supabase.from("ledger_movements") as any)
        .update({ amount_original: updateData.sale_amount, updated_at: new Date().toISOString() })
        .eq("id", currentService.ledger_income_id)
      if (ledgerErr) warnings.push("No se pudo actualizar el movimiento contable de ingreso")
    }

    // Actualizar ledger EXPENSE si cambió cost_amount
    if (costChanged && currentService.ledger_expense_id) {
      const { error: ledgerErr } = await (supabase.from("ledger_movements") as any)
        .update({ amount_original: updateData.cost_amount, updated_at: new Date().toISOString() })
        .eq("id", currentService.ledger_expense_id)
      if (ledgerErr) warnings.push("No se pudo actualizar el movimiento contable de gasto")
    }

    // Actualizar operator_payment si cambió cost_amount
    if (costChanged && currentService.operator_payment_id) {
      const { data: opPayment } = await (supabase.from("operator_payments") as any)
        .select("id, status")
        .eq("id", currentService.operator_payment_id)
        .single()

      if (opPayment?.status === "PAID") {
        warnings.push("El pago al operador ya fue registrado como pagado. El monto no se actualizó automáticamente.")
      } else if (opPayment) {
        await (supabase.from("operator_payments") as any)
          .update({ amount: updateData.cost_amount, updated_at: new Date().toISOString() })
          .eq("id", currentService.operator_payment_id)
      }
    }

    return NextResponse.json({
      service: updatedService,
      warnings: warnings.length > 0 ? warnings : undefined,
    })
  } catch (error: any) {
    if (error?.digest?.startsWith("NEXT_REDIRECT")) throw error
    console.error("[Services PATCH] Error inesperado:", error)
    return NextResponse.json({ error: error.message || "Error al editar servicio" }, { status: 500 })
  }
}

// ─────────────────────────────────────────────
// DELETE: Eliminar un servicio de una operación
// Reversa los registros contables asociados
// solo si aún están PENDING (no pagados)
// ─────────────────────────────────────────────
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; serviceId: string }> }
) {
  try {
    const { user } = await getCurrentUser()

    if (!canPerformAction(user, "operations", "write")) {
      return NextResponse.json({ error: "No tiene permiso para eliminar servicios" }, { status: 403 })
    }

    const { id: operationId, serviceId } = await params
    const supabase = await createServerClient()

    // Verificar que la operación existe y el usuario tiene acceso
    const { data: operation, error: opError } = await (supabase.from("operations") as any)
      .select("id, seller_id, status")
      .eq("id", operationId)
      .single()

    if (opError || !operation) {
      return NextResponse.json({ error: "Operación no encontrada" }, { status: 404 })
    }

    if (user.role === "SELLER" && operation.seller_id !== user.id) {
      return NextResponse.json({ error: "No tiene acceso a esta operación" }, { status: 403 })
    }

    // Obtener el servicio con sus IDs contables
    const { data: service, error: serviceError } = await (supabase.from("operation_services") as any)
      .select("*")
      .eq("id", serviceId)
      .eq("operation_id", operationId)
      .single()

    if (serviceError || !service) {
      return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 })
    }

    const warnings: string[] = []

    // ── Eliminar payment (deuda cliente) si está PENDING ──
    if (service.payment_id) {
      const { data: payment } = await (supabase.from("payments") as any)
        .select("id, status")
        .eq("id", service.payment_id)
        .single()

      if (payment?.status === "PAID") {
        warnings.push("El pago del cliente ya fue registrado como pagado y no se puede revertir automáticamente.")
      } else if (payment) {
        await (supabase.from("payments") as any)
          .delete()
          .eq("id", service.payment_id)
      }
    }

    // ── Eliminar operator_payment si está PENDING ──
    if (service.operator_payment_id) {
      const { data: opPayment } = await (supabase.from("operator_payments") as any)
        .select("id, status")
        .eq("id", service.operator_payment_id)
        .single()

      if (opPayment?.status === "PAID") {
        warnings.push("El pago al proveedor ya fue registrado como pagado y no se puede revertir automáticamente.")
      } else if (opPayment) {
        await (supabase.from("operator_payments") as any)
          .delete()
          .eq("id", service.operator_payment_id)
      }
    }

    // ── Eliminar ledger movements ──
    // Solo si existen (si el pago ya está hecho el ledger igual se borra,
    // ya que el pago real genera su propio ledger movement al marcarse PAID)
    if (service.ledger_income_id) {
      await (supabase.from("ledger_movements") as any)
        .delete()
        .eq("id", service.ledger_income_id)
    }

    if (service.ledger_expense_id) {
      await (supabase.from("ledger_movements") as any)
        .delete()
        .eq("id", service.ledger_expense_id)
    }

    // ── Revertir comisión si existe y está PENDING ──
    if (service.commission_record_id && service.generates_commission) {
      const { data: commRecord } = await (supabase.from("commission_records") as any)
        .select("id, status, amount")
        .eq("id", service.commission_record_id)
        .single()

      if (commRecord?.status === "PAID") {
        warnings.push("La comisión del vendedor ya fue pagada y no se puede revertir automáticamente.")
      } else if (commRecord) {
        // Si la comisión tiene monto acumulado de otros servicios,
        // lo más seguro es eliminar el registro (se recalculará si hay otros)
        await (supabase.from("commission_records") as any)
          .delete()
          .eq("id", service.commission_record_id)
      }
    }

    // ── Eliminar el servicio ──
    const { error: deleteError } = await (supabase.from("operation_services") as any)
      .delete()
      .eq("id", serviceId)

    if (deleteError) {
      console.error("[Services DELETE] Error eliminando servicio:", deleteError)
      return NextResponse.json({ error: "Error al eliminar el servicio" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      warnings: warnings.length > 0 ? warnings : undefined,
    })
  } catch (error: any) {
    if (error?.digest?.startsWith("NEXT_REDIRECT")) throw error
    console.error("[Services DELETE] Error inesperado:", error)
    return NextResponse.json({ error: error.message || "Error al eliminar servicio" }, { status: 500 })
  }
}
