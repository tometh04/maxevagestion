import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { id } = await params
    const quotaId = id

    const { data: quota, error } = await (supabase.from("quotas") as any)
      .select(`
        *,
        operators:operator_id(id, name),
        tariffs:tariff_id(id, name, destination),
        quota_reservations(
          *,
          quotations:quotation_id(id, quotation_number, status),
          operations:operation_id(id, destination, status)
        )
      `)
      .eq("id", quotaId)
      .single()

    if (error || !quota) {
      return NextResponse.json({ error: "Cupo no encontrado" }, { status: 404 })
    }

    return NextResponse.json({ quota })
  } catch (error: any) {
    console.error("Error in GET /api/quotas/[id]:", error)
    return NextResponse.json({ error: error.message || "Error al obtener cupo" }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()

    if (!canPerformAction(user, "operations", "write")) {
      return NextResponse.json({ error: "No tiene permiso para actualizar cupos" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const { id } = await params
    const quotaId = id
    const body = await request.json()

    // Prepare update data
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    const allowedFields = [
      "tariff_id",
      "destination",
      "accommodation_name",
      "room_type",
      "date_from",
      "date_to",
      "total_quota",
      "is_active",
      "notes",
    ]

    allowedFields.forEach((field) => {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    })

    const { data: quota, error } = await (supabase.from("quotas") as any)
      .update(updateData)
      .eq("id", quotaId)
      .select()
      .single()

    if (error) {
      console.error("Error updating quota:", error)
      return NextResponse.json({ error: "Error al actualizar cupo" }, { status: 500 })
    }

    return NextResponse.json({ quota })
  } catch (error: any) {
    console.error("Error in PATCH /api/quotas/[id]:", error)
    return NextResponse.json({ error: error.message || "Error al actualizar cupo" }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()

    if (!canPerformAction(user, "operations", "write")) {
      return NextResponse.json({ error: "No tiene permiso para eliminar cupos" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const { id } = await params
    const quotaId = id

    // Check if quota has active reservations
    const { data: reservations } = await (supabase.from("quota_reservations") as any)
      .select("id")
      .eq("quota_id", quotaId)
      .in("status", ["RESERVED", "CONFIRMED"])
      .limit(1)

    if (reservations && reservations.length > 0) {
      return NextResponse.json(
        { error: "No se puede eliminar un cupo con reservas activas" },
        { status: 400 }
      )
    }

    // Delete quota
    const { error } = await (supabase.from("quotas") as any).delete().eq("id", quotaId)

    if (error) {
      console.error("Error deleting quota:", error)
      return NextResponse.json({ error: "Error al eliminar cupo" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error in DELETE /api/quotas/[id]:", error)
    return NextResponse.json({ error: error.message || "Error al eliminar cupo" }, { status: 500 })
  }
}

