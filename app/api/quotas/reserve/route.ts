import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"

/**
 * Reserva cupos temporalmente para una cotización
 * Sincroniza con: Quotas (actualiza reserved_quota automáticamente)
 */
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()

    if (!canPerformAction(user, "leads", "write")) {
      return NextResponse.json({ error: "No tiene permiso para reservar cupos" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const body = await request.json()

    const { quotation_id, operation_id, quota_id, quantity, reserved_until } = body

    // Validate required fields
    if (!quota_id || !quantity || quantity <= 0) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    if (!quotation_id && !operation_id) {
      return NextResponse.json(
        { error: "Debe proporcionar quotation_id o operation_id" },
        { status: 400 }
      )
    }

    // Check quota availability
    const { data: quota } = await (supabase.from("quotas") as any).select("*").eq("id", quota_id).single()

    if (!quota) {
      return NextResponse.json({ error: "Cupo no encontrado" }, { status: 404 })
    }

    const quot = quota as any

    if (quot.available_quota < quantity) {
      return NextResponse.json(
        { error: `No hay suficientes cupos disponibles. Disponibles: ${quot.available_quota}, Solicitados: ${quantity}` },
        { status: 400 }
      )
    }

    // Create reservation
    const reservationData: Record<string, any> = {
      quota_id,
      quotation_id: quotation_id || null,
      operation_id: operation_id || null,
      quantity,
      status: "RESERVED",
      reserved_until: reserved_until || null,
      created_by: user.id,
    }

    const { data: reservation, error } = await (supabase.from("quota_reservations") as any)
      .insert(reservationData)
      .select()
      .single()

    if (error) {
      console.error("Error creating quota reservation:", error)
      return NextResponse.json({ error: "Error al reservar cupo" }, { status: 500 })
    }

    // Fetch updated quota (reserved_quota should be updated by trigger)
    const { data: updatedQuota } = await (supabase.from("quotas") as any)
      .select("*")
      .eq("id", quota_id)
      .single()

    return NextResponse.json(
      {
        reservation,
        quota: updatedQuota,
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error("Error in POST /api/quotas/reserve:", error)
    return NextResponse.json({ error: error.message || "Error al reservar cupo" }, { status: 500 })
  }
}

