import { NextResponse } from "next/server"
import { createServerClient, createAdminClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"

/**
 * SaaS Pilar 2: itinerary_items tiene RLS permisiva (USING true) y no tiene
 * org_id (gap de Pilar 1 — ver Pilar 2c). La defensa va por código: al
 * recibir itemId, leemos el item (sin RLS útil), luego verificamos que la
 * operation parent esté en la org del user (operations sí tiene RLS).
 * Si la operation no es visible con el server client → item no es del user.
 */
async function verifyItemBelongsToUser(
  supabase: any,
  adminDb: any,
  itemId: string
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const { data: item } = await adminDb
    .from("itinerary_items")
    .select("id, operation_id")
    .eq("id", itemId)
    .maybeSingle()

  if (!item) {
    return { ok: false, response: NextResponse.json({ error: "Item no encontrado" }, { status: 404 }) }
  }

  const { data: operation } = await supabase
    .from("operations")
    .select("id")
    .eq("id", item.operation_id)
    .maybeSingle()

  if (!operation) {
    return { ok: false, response: NextResponse.json({ error: "Item no encontrado" }, { status: 404 }) }
  }

  return { ok: true }
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
    const supabase = await createServerClient()
    const adminDb = createAdminClient() as any

    const check = await verifyItemBelongsToUser(supabase, adminDb, itemId)
    if (!check.ok) return check.response

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
    const supabase = await createServerClient()
    const adminDb = createAdminClient() as any

    const check = await verifyItemBelongsToUser(supabase, adminDb, itemId)
    if (!check.ok) return check.response

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
