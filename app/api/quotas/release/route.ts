import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"

/**
 * Libera cupos reservados
 * Sincroniza con: Quotas (actualiza reserved_quota automáticamente)
 */
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()

    if (!canPerformAction(user, "leads", "write")) {
      return NextResponse.json({ error: "No tiene permiso para liberar cupos" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const body = await request.json()

    const { reservation_id, quotation_id, operation_id } = body

    // Validate
    if (!reservation_id && !quotation_id && !operation_id) {
      return NextResponse.json(
        { error: "Debe proporcionar reservation_id, quotation_id o operation_id" },
        { status: 400 }
      )
    }

    let query = (supabase.from("quota_reservations") as any).update({
      status: "RELEASED",
      released_at: new Date().toISOString(),
    })

    if (reservation_id) {
      query = query.eq("id", reservation_id)
    } else if (quotation_id) {
      query = query.eq("quotation_id", quotation_id).eq("status", "RESERVED")
    } else if (operation_id) {
      query = query.eq("operation_id", operation_id).eq("status", "RESERVED")
    }

    const { data: reservations, error } = await query.select()

    if (error) {
      console.error("Error releasing quota reservations:", error)
      return NextResponse.json({ error: "Error al liberar cupos" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      released_count: reservations?.length || 0,
      reservations: reservations || [],
    })
  } catch (error: any) {
    console.error("Error in POST /api/quotas/release:", error)
    return NextResponse.json({ error: error.message || "Error al liberar cupos" }, { status: 500 })
  }
}

