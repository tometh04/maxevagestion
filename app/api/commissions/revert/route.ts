/**
 * API Route: Revertir pago de comisión
 * 
 * Elimina el ledger_movement de tipo COMMISSION y marca la comisión como PENDING
 */

import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()

    // Cross-tenant fix (2026-05-18): no confiar en RLS; scopear explícito.
    if (!(user as any).org_id) {
      return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
    }

    const supabase = await createServerClient()
    const body = await request.json()

    const { commissionId } = body

    if (!commissionId) {
      return NextResponse.json(
        { error: "commissionId es requerido" },
        { status: 400 }
      )
    }

    // Solo ADMIN y SUPER_ADMIN pueden revertir comisiones
    const userRole = user.role as string
    if (!["ADMIN", "SUPER_ADMIN"].includes(userRole)) {
      return NextResponse.json(
        { error: "Solo administradores pueden revertir pagos de comisiones" },
        { status: 403 }
      )
    }

    // Obtener la comisión (scopeado por org)
    const { data: commission, error: commissionError } = await (supabase.from("commission_records") as any)
      .select("*, operations:operation_id(id)")
      .eq("id", commissionId)
      .eq("org_id", (user as any).org_id)
      .single()

    if (commissionError || !commission) {
      return NextResponse.json({ error: "Comisión no encontrada" }, { status: 404 })
    }

    // Verificar que la comisión esté en estado PAID
    if (commission.status !== "PAID") {
      return NextResponse.json(
        { error: "La comisión no está pagada, no hay nada que revertir" },
        { status: 400 }
      )
    }

    // Buscar y eliminar el ledger_movement de tipo COMMISSION para esta operación/vendedor (scopeado por org)
    try {
      const { data: ledgerMovements } = await (supabase.from("ledger_movements") as any)
        .select("id")
        .eq("operation_id", commission.operation_id)
        .eq("type", "COMMISSION")
        .eq("seller_id", commission.seller_id)
        .eq("org_id", (user as any).org_id)

      if (ledgerMovements && ledgerMovements.length > 0) {
        // Eliminar todos los ledger_movements de comisión para esta comisión (scopeado por org)
        for (const lm of ledgerMovements) {
          await (supabase.from("ledger_movements") as any)
            .delete()
            .eq("id", lm.id)
            .eq("org_id", (user as any).org_id)
        }
      }
    } catch (ledgerError) {
      console.warn("Warning: Error deleting ledger movements:", ledgerError)
    }

    // Marcar la comisión como PENDING nuevamente (scopeado por org)
    const { error: updateError } = await (supabase.from("commission_records") as any)
      .update({
        status: "PENDING",
        date_paid: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", commissionId)
      .eq("org_id", (user as any).org_id)

    if (updateError) {
      console.error("Error updating commission status:", updateError)
      return NextResponse.json({ error: "Error al revertir comisión" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: "Pago de comisión revertido exitosamente. La comisión vuelve a estado PENDING.",
    })
  } catch (error: any) {
    console.error("Error in POST /api/commissions/revert:", error)
    return NextResponse.json(
      { error: error.message || "Error al revertir comisión" },
      { status: 500 }
    )
  }
}

