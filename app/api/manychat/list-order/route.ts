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

    // Obtener orden de listas ordenado por posición
    const { data: listOrder, error } = await supabase
      .from("manychat_list_order")
      .select("list_name, position")
      .eq("agency_id", agencyId)
      .order("position", { ascending: true })

    if (error) {
      console.error("Error fetching manychat list order:", error)
      return NextResponse.json({ error: "Error al obtener orden de listas" }, { status: 500 })
    }

    // Retornar solo los nombres de las listas en orden
    const orderedListNames = (listOrder || []).map(item => item.list_name)

    return NextResponse.json({ 
      listNames: orderedListNames,
      order: listOrder || []
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

    // Eliminar orden anterior
    const { error: deleteError } = await supabase
      .from("manychat_list_order")
      .delete()
      .eq("agency_id", agencyId)

    if (deleteError) {
      console.error("Error deleting old order:", deleteError)
      return NextResponse.json(
        { error: "Error al actualizar orden de listas" },
        { status: 500 }
      )
    }

    // Insertar nuevo orden
    const orderData = listNames.map((listName: string, index: number) => ({
      agency_id: agencyId,
      list_name: listName.trim(),
      position: index,
    }))

    const { error: insertError } = await supabase
      .from("manychat_list_order")
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

