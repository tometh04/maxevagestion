import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { user } = await getCurrentUser()

    if (!canPerformAction(user, "operations", "write")) {
      return NextResponse.json({ error: "No tiene permiso para modificar itinerarios" }, { status: 403 })
    }

    const { itemId } = await params
    const body = await request.json()
    const adminDb = createAdminClient() as any

    // Remove fields that shouldn't be updated directly
    const { id, operation_id, created_at, ...updateData } = body
    updateData.updated_at = new Date().toISOString()

    const { data: item, error } = await adminDb
      .from("itinerary_items")
      .update(updateData)
      .eq("id", itemId)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ item })
  } catch (error: any) {
    return NextResponse.json({ error: "Error al actualizar item" }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { user } = await getCurrentUser()

    if (!canPerformAction(user, "operations", "write")) {
      return NextResponse.json({ error: "No tiene permiso para eliminar items de itinerario" }, { status: 403 })
    }

    const { itemId } = await params
    const adminDb = createAdminClient() as any

    const { error } = await adminDb
      .from("itinerary_items")
      .delete()
      .eq("id", itemId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: "Error al eliminar item" }, { status: 500 })
  }
}
