import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

/**
 * POST /api/leads/claim
 * Permite a un vendedor "agarrar" un lead sin asignar.
 *
 * Cleanup 2026-05-08: removida sincronización con Trello (integración deprecada,
 * reemplazada por Manychat). El claim ahora actualiza solo BD local; para leads
 * de Manychat, además mueve el lead a la lista personal del vendedor.
 */
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()

    // Solo vendedores y admins pueden "agarrar" leads
    if (user.role !== "SELLER" && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const { leadId } = await request.json()

    if (!leadId) {
      return NextResponse.json({ error: "Falta el ID del lead" }, { status: 400 })
    }

    const supabase = await createServerClient()

    // 1. Obtener el lead
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, agency_id, assigned_seller_id, external_id, source")
      .eq("id", leadId)
      .single()

    if (leadError || !lead) {
      console.error("❌ Error getting lead:", leadError)
      return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 })
    }

    const leadData = lead as any

    // 2. Cualquier vendedor puede tomar un lead, incluso si ya está asignado a otro
    // (Opción A: reasignación libre entre vendedores)

    // 3. Si el lead es de Manychat, asignar en DB y mover a la lista personal del vendedor
    if (leadData.source === "Manychat") {
      // Buscar la lista personal del vendedor en manychat_list_order
      const { data: sellerListData } = await (supabase
        .from("manychat_list_order") as any)
        .select("list_name")
        .eq("agency_id", leadData.agency_id)
        .eq("seller_id", user.id)
        .limit(1)
        .single()

      const sellerListName = (sellerListData as any)?.list_name as string | undefined

      const updateData: Record<string, any> = {
        assigned_seller_id: user.id,
        updated_at: new Date().toISOString(),
      }

      // Si el vendedor tiene lista personal, mover el lead ahí
      if (sellerListName) {
        updateData.list_name = sellerListName
      }

      const { error: updateError } = await (supabase
        .from("leads") as any)
        .update(updateData)
        .eq("id", leadId)

      if (updateError) {
        console.error("❌ Error updating lead:", updateError)
        return NextResponse.json({ error: "Error al asignar el lead" }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        message: "Lead asignado correctamente",
        newListName: sellerListName || null,
      })
    }

    // 4. Lead de cualquier otro origen — solo actualizar assigned_seller_id en BD
    const { error: updateError } = await (supabase
      .from("leads") as any)
      .update({
        assigned_seller_id: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId)

    if (updateError) {
      console.error("❌ Error updating lead:", updateError)
      return NextResponse.json({ error: "Error al asignar el lead" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: "Lead asignado correctamente",
    })

  } catch (error: any) {
    console.error("❌ Error in claim lead:", error)
    return NextResponse.json({
      error: error.message || "Error al agarrar el lead"
    }, { status: 500 })
  }
}
