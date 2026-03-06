import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"

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
