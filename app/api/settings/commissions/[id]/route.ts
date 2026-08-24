import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { hasAdminRole } from "@/lib/permissions"

/**
 * Edición y borrado de una regla de comisión (VIB-124).
 *
 * Dos cuidados que no estaban:
 *   - `.eq("org_id", ...)` en el update y el delete. RLS ya aísla, pero el id
 *     venía de la URL y no se validaba contra el tenant del que lo manda.
 *   - `hasAdminRole` en vez del string literal, que dejaba afuera a ORG_OWNER.
 *
 * `seller_id` se sigue preservando cuando no viene en el body: la pantalla
 * mandaba un PATCH sin ese campo y hay 13 reglas por vendedor en producción que
 * no pueden perder su dueño al editarles el porcentaje.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await getCurrentUser()

    if (!hasAdminRole((user as any).roles ?? [user.role])) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    if (!user.org_id) {
      return NextResponse.json(
        { error: "Usuario sin organizacion asociada" },
        { status: 400 }
      )
    }

    const supabase = await createServerClient()
    const body = await request.json()
    const { id: ruleId } = await params

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    if (body.type !== undefined) updateData.type = body.type
    if (body.basis !== undefined) updateData.basis = body.basis
    if (body.value !== undefined) updateData.value = Number(body.value)
    if (body.destination_region !== undefined) updateData.destination_region = body.destination_region || null
    if (body.agency_id !== undefined) updateData.agency_id = body.agency_id || null
    if (body.valid_from !== undefined) updateData.valid_from = body.valid_from
    if (body.valid_to !== undefined) updateData.valid_to = body.valid_to || null

    // seller_id solo se toca si el cliente lo manda explícitamente. Si además
    // la regla pasa a ser de agencia, se limpia para no dejarla ambigua.
    if (body.seller_id !== undefined) {
      const sellerId = body.seller_id || null

      if (sellerId) {
        const { data: seller } = await supabase
          .from("users")
          .select("id")
          .eq("id", sellerId)
          .eq("org_id", user.org_id)
          .maybeSingle()

        if (!seller) {
          return NextResponse.json(
            { error: "El vendedor no pertenece a esta organización" },
            { status: 400 }
          )
        }
      }

      updateData.seller_id = sellerId
    }

    if (updateData.type === "AGENCY") {
      updateData.seller_id = null
    }

    const { data: rule, error } = await (supabase.from("commission_rules") as any)
      .update(updateData)
      .eq("id", ruleId)
      .eq("org_id", user.org_id)
      .select()
      .maybeSingle()

    if (error) {
      console.error("Error updating commission rule:", error)
      return NextResponse.json({ error: "Error al actualizar regla de comisión" }, { status: 500 })
    }

    // maybeSingle + null = la regla no existe o es de otro tenant. Antes esto
    // reventaba como 500 por el .single().
    if (!rule) {
      return NextResponse.json({ error: "Regla no encontrada" }, { status: 404 })
    }

    return NextResponse.json({ rule })
  } catch (error) {
    console.error("Error in PATCH /api/settings/commissions/[id]:", error)
    return NextResponse.json({ error: "Error al actualizar regla de comisión" }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await getCurrentUser()

    if (!hasAdminRole((user as any).roles ?? [user.role])) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    if (!user.org_id) {
      return NextResponse.json(
        { error: "Usuario sin organizacion asociada" },
        { status: 400 }
      )
    }

    const supabase = await createServerClient()
    const { id: ruleId } = await params

    const { error } = await supabase
      .from("commission_rules")
      .delete()
      .eq("id", ruleId)
      .eq("org_id", user.org_id)

    if (error) {
      console.error("Error deleting commission rule:", error)
      return NextResponse.json({ error: "Error al eliminar regla de comisión" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in DELETE /api/settings/commissions/[id]:", error)
    return NextResponse.json({ error: "Error al eliminar regla de comisión" }, { status: 500 })
  }
}
