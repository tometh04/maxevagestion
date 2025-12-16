import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"

/**
 * GET /api/manychat/lists?agencyId=xxx
 * Obtiene todas las listas (nombres únicos) que tienen leads para esta agencia
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

    // Obtener todos los list_name únicos que tienen leads
    const { data: leads, error } = await (supabase
      .from("leads") as any)
      .select("list_name")
      .eq("agency_id", agencyId)
      .not("list_name", "is", null)

    if (error) {
      console.error("Error fetching lists:", error)
      return NextResponse.json({ error: "Error al obtener listas" }, { status: 500 })
    }

    // Obtener nombres únicos
    const uniqueListNames = Array.from(new Set((leads || []).map((l: any) => l.list_name).filter(Boolean)))

    return NextResponse.json({ lists: uniqueListNames })
  } catch (error: any) {
    console.error("Error in GET /api/manychat/lists:", error)
    return NextResponse.json({ error: error.message || "Error al obtener listas" }, { status: 500 })
  }
}

/**
 * POST /api/manychat/lists
 * Crea una nueva lista (agregando al orden)
 * Body: { agencyId: string, listName: string }
 */
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const body = await request.json()
    const { agencyId, listName } = body

    if (!agencyId || !listName || !listName.trim()) {
      return NextResponse.json(
        { error: "Falta agencyId o listName" },
        { status: 400 }
      )
    }

    // Verificar permisos (solo admins pueden crear)
    if (!canPerformAction(user, "settings", "write")) {
      return NextResponse.json(
        { error: "No tiene permiso para crear listas" },
        { status: 403 }
      )
    }

    const trimmedListName = listName.trim()

    // Verificar si ya existe
    const { data: existing } = await (supabase
      .from("manychat_list_order") as any)
      .select("id")
      .eq("agency_id", agencyId)
      .eq("list_name", trimmedListName)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: "Esta lista ya existe" },
        { status: 400 }
      )
    }

    // Obtener la última posición
    const { data: lastOrder } = await (supabase
      .from("manychat_list_order") as any)
      .select("position")
      .eq("agency_id", agencyId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextPosition = lastOrder ? (lastOrder.position as number) + 1 : 0

    // Insertar nueva lista
    const { error: insertError } = await (supabase
      .from("manychat_list_order") as any)
      .insert({
        agency_id: agencyId,
        list_name: trimmedListName,
        position: nextPosition,
      })

    if (insertError) {
      console.error("Error creating list:", insertError)
      return NextResponse.json(
        { error: "Error al crear lista" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "Lista creada correctamente",
      listName: trimmedListName,
    })
  } catch (error: any) {
    console.error("Error in POST /api/manychat/lists:", error)
    return NextResponse.json(
      { error: error.message || "Error al crear lista" },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/manychat/lists
 * Actualiza el nombre de una lista
 * Body: { agencyId: string, oldListName: string, newListName: string }
 */
export async function PUT(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const body = await request.json()
    const { agencyId, oldListName, newListName } = body

    if (!agencyId || !oldListName || !newListName || !newListName.trim()) {
      return NextResponse.json(
        { error: "Faltan campos requeridos" },
        { status: 400 }
      )
    }

    // Verificar permisos (solo admins pueden editar)
    if (!canPerformAction(user, "settings", "write")) {
      return NextResponse.json(
        { error: "No tiene permiso para editar listas" },
        { status: 403 }
      )
    }

    const trimmedNewName = newListName.trim()

    // Verificar si el nuevo nombre ya existe
    const { data: existing } = await (supabase
      .from("manychat_list_order") as any)
      .select("id")
      .eq("agency_id", agencyId)
      .eq("list_name", trimmedNewName)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: "Ya existe una lista con ese nombre" },
        { status: 400 }
      )
    }

    // Actualizar el nombre en manychat_list_order
    const { error: updateOrderError } = await (supabase
      .from("manychat_list_order") as any)
      .update({ list_name: trimmedNewName })
      .eq("agency_id", agencyId)
      .eq("list_name", oldListName)

    if (updateOrderError) {
      console.error("Error updating list name in order:", updateOrderError)
      return NextResponse.json(
        { error: "Error al actualizar nombre de lista" },
        { status: 500 }
      )
    }

    // Actualizar todos los leads que tienen este list_name
    const { error: updateLeadsError } = await (supabase
      .from("leads") as any)
      .update({ list_name: trimmedNewName })
      .eq("agency_id", agencyId)
      .eq("list_name", oldListName)
      .eq("source", "Manychat") // Solo leads de Manychat

    if (updateLeadsError) {
      console.error("Error updating leads list_name:", updateLeadsError)
      // No fallar, pero loguear el error
    }

    return NextResponse.json({
      success: true,
      message: "Lista actualizada correctamente",
      oldListName,
      newListName: trimmedNewName,
    })
  } catch (error: any) {
    console.error("Error in PUT /api/manychat/lists:", error)
    return NextResponse.json(
      { error: error.message || "Error al actualizar lista" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/manychat/lists
 * Elimina una lista
 * Body: { agencyId: string, listName: string }
 */
export async function DELETE(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    const agencyId = searchParams.get("agencyId")
    const listName = searchParams.get("listName")

    if (!agencyId || !listName) {
      return NextResponse.json(
        { error: "Faltan agencyId o listName" },
        { status: 400 }
      )
    }

    // Verificar permisos (solo admins pueden eliminar)
    if (!canPerformAction(user, "settings", "write")) {
      return NextResponse.json(
        { error: "No tiene permiso para eliminar listas" },
        { status: 403 }
      )
    }

    // Verificar si hay leads en esta lista
    const { data: leadsInList } = await (supabase
      .from("leads") as any)
      .select("id")
      .eq("agency_id", agencyId)
      .eq("list_name", listName)
      .limit(1)

    if (leadsInList && leadsInList.length > 0) {
      return NextResponse.json(
        { error: "No se puede eliminar una lista que tiene leads. Mueve los leads primero." },
        { status: 400 }
      )
    }

    // Eliminar de manychat_list_order
    const { error: deleteError } = await (supabase
      .from("manychat_list_order") as any)
      .delete()
      .eq("agency_id", agencyId)
      .eq("list_name", listName)

    if (deleteError) {
      console.error("Error deleting list:", deleteError)
      return NextResponse.json(
        { error: "Error al eliminar lista" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "Lista eliminada correctamente",
    })
  } catch (error: any) {
    console.error("Error in DELETE /api/manychat/lists:", error)
    return NextResponse.json(
      { error: error.message || "Error al eliminar lista" },
      { status: 500 }
    )
  }
}

