import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const body = await request.json()

    const { quota_id, operation_id, quotation_id, quantity } = body

    if (!quota_id || !quantity) {
      return NextResponse.json({ error: "Faltan parámetros requeridos" }, { status: 400 })
    }

    // Verificar que el cupo existe y tiene disponibilidad
    const { data: quota, error: quotaError } = await (supabase.from("quotas") as any)
      .select("*")
      .eq("id", quota_id)
      .single()

    if (quotaError || !quota) {
      return NextResponse.json({ error: "Cupo no encontrado" }, { status: 404 })
    }

    if (quota.available_quota < quantity) {
      return NextResponse.json({ 
        error: `Solo hay ${quota.available_quota} cupos disponibles` 
      }, { status: 400 })
    }

    // Crear la reserva
    const reservationData: any = {
      quota_id,
      quantity,
      status: operation_id ? "CONFIRMED" : "RESERVED",
      created_by: user.id,
    }

    if (operation_id) {
      reservationData.operation_id = operation_id
    }
    
    if (quotation_id) {
      reservationData.quotation_id = quotation_id
      // Para cotizaciones, poner fecha de expiración (7 días)
      const expirationDate = new Date()
      expirationDate.setDate(expirationDate.getDate() + 7)
      reservationData.reserved_until = expirationDate.toISOString()
    }

    const { data: reservation, error: reservationError } = await (supabase.from("quota_reservations") as any)
      .insert(reservationData)
      .select()
      .single()

    if (reservationError) {
      console.error("Error creating reservation:", reservationError)
      return NextResponse.json({ error: "Error al crear reserva" }, { status: 500 })
    }

    return NextResponse.json({ success: true, reservation })
  } catch (error: any) {
    console.error("Error in POST /api/quotas/reserve:", error)
    return NextResponse.json({ error: error.message || "Error al reservar cupo" }, { status: 500 })
  }
}

// Liberar cupo
export async function DELETE(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    const reservationId = searchParams.get("reservationId")

    if (!reservationId) {
      return NextResponse.json({ error: "ID de reserva requerido" }, { status: 400 })
    }

    // Actualizar estado a RELEASED
    const { error } = await (supabase.from("quota_reservations") as any)
      .update({
        status: "RELEASED",
        released_at: new Date().toISOString(),
      })
      .eq("id", reservationId)

    if (error) {
      console.error("Error releasing reservation:", error)
      return NextResponse.json({ error: "Error al liberar reserva" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error in DELETE /api/quotas/reserve:", error)
    return NextResponse.json({ error: error.message || "Error al liberar cupo" }, { status: 500 })
  }
}
