import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"

/**
 * GET /api/manychat/list-order?agencyId=xxx
 * Obtiene el orden de listas para CRM Manychat (INDEPENDIENTE de Trello)
 */
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    const agencyId = searchParams.get("agencyId")

    if (!agencyId) {
      return NextResponse.json({ error: "Falta agencyId" }, { status: 400 })
    }

    // Obtener orden de listas ordenado por posición, incluyendo seller info
    let listQuery = (supabase
      .from("manychat_list_order") as any)
      .select("list_name, position, seller_id, seller:seller_id(id, name)")
      .eq("agency_id", agencyId)
      .order("position", { ascending: true })

    // SELLER solo ve sus listas + listas compartidas (sin seller)
    if (user.role === "SELLER") {
      listQuery = listQuery.or(`seller_id.eq.${user.id},seller_id.is.null`)
    }

    const { data: listOrder, error } = await listQuery

    if (error) {
      console.error("Error fetching manychat list order:", error)
      return NextResponse.json({ error: "Error al obtener orden de listas" }, { status: 500 })
    }

    // Retornar nombres de listas en orden + info de seller
    const orderedListNames = ((listOrder || []) as Array<{ list_name: string; position: number }>).map(item => item.list_name)

    // Mapear info completa con seller
    const orderWithSeller = ((listOrder || []) as any[]).map(item => ({
      list_name: item.list_name,
      position: item.position,
      seller_id: item.seller_id || null,
      seller_name: item.seller?.name || null,
    }))

    return NextResponse.json({
      listNames: orderedListNames,
      order: orderWithSeller
    })
  } catch (error: any) {
    console.error("Error in GET /api/manychat/list-order:", error)
    return NextResponse.json({ error: error.message || "Error al obtener orden de listas" }, { status: 500 })
  }
}

/**
 * PUT /api/manychat/list-order
 * Actualiza el orden de listas para CRM Manychat
 * Body: { agencyId: string, listNames: string[] }
 */
export async function PUT(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const body = await request.json()
    const { agencyId, listNames } = body

    if (!agencyId || !Array.isArray(listNames)) {
      return NextResponse.json(
        { error: "Falta agencyId o listNames (array)" },
        { status: 400 }
      )
    }

    // Verificar permisos (solo admins pueden editar)
    if (!canPerformAction(user, "settings", "write")) {
      return NextResponse.json(
        { error: "No tiene permiso para editar el orden de listas" },
        { status: 403 }
      )
    }

    // Actualizar posiciones sin perder seller_id
    // Obtener listas actuales para preservar seller_id
    const { data: currentLists } = await (supabase
      .from("manychat_list_order") as any)
      .select("list_name, seller_id")
      .eq("agency_id", agencyId)

    const sellerMap: Record<string, string | null> = {}
    if (currentLists) {
      for (const list of currentLists) {
        sellerMap[list.list_name] = list.seller_id || null
      }
    }

    // Eliminar orden anterior
    const { error: deleteError } = await (supabase
      .from("manychat_list_order") as any)
      .delete()
      .eq("agency_id", agencyId)

    if (deleteError) {
      console.error("Error deleting old order:", deleteError)
      return NextResponse.json(
        { error: "Error al actualizar orden de listas" },
        { status: 500 }
      )
    }

    // Insertar nuevo orden preservando seller_id
    const orderData = listNames.map((listName: string, index: number) => ({
      agency_id: agencyId,
      list_name: listName.trim(),
      position: index,
      seller_id: sellerMap[listName.trim()] || null,
    }))

    const { error: insertError } = await (supabase
      .from("manychat_list_order") as any)
      .insert(orderData)

    if (insertError) {
      console.error("Error inserting new order:", insertError)
      return NextResponse.json(
        { error: "Error al actualizar orden de listas" },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      success: true,
      message: "Orden de listas actualizado correctamente"
    })
  } catch (error: any) {
    console.error("Error in PUT /api/manychat/list-order:", error)
    return NextResponse.json(
      { error: error.message || "Error al actualizar orden de listas" },
      { status: 500 }
    )
  }
}

