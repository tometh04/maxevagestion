import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction, getUserAgencyIds } from "@/lib/permissions-api"

/**
 * Valida que el item de itinerario pertenece a una operacion de la agencia del user.
 * Retorna null si OK, o NextResponse con 404 si el item no es accesible para el user.
 */
async function verifyItemBelongsToUserOrg(
  adminDb: any,
  itemId: string,
  user: any
): Promise<NextResponse | null> {
  const { data: item } = await adminDb
    .from("itinerary_items")
    .select("id, operation_id, operations:operation_id(agency_id)")
    .eq("id", itemId)
    .maybeSingle()
  if (!item) {
    return NextResponse.json({ error: "Item no encontrado" }, { status: 404 })
  }
  const itemAgencyId = (item as any).operations?.agency_id
  const userAgencyIds = await getUserAgencyIds(adminDb, user.id, user.role as any)
  if (userAgencyIds.length > 0 && itemAgencyId && !userAgencyIds.includes(itemAgencyId)) {
    return NextResponse.json({ error: "Item no encontrado" }, { status: 404 })
  }
  return null
}

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

    const ownershipError = await verifyItemBelongsToUserOrg(adminDb, itemId, user)
    if (ownershipError) return ownershipError

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

    const ownershipError = await verifyItemBelongsToUserOrg(adminDb, itemId, user)
    if (ownershipError) return ownershipError

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
