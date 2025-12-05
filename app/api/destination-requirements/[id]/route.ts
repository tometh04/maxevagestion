import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"

// GET - Obtener un requisito específico
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const { id } = await params
    const supabase = await createServerClient()

    const { data, error } = await (supabase.from("destination_requirements") as any)
      .select("*")
      .eq("id", id)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: "Requisito no encontrado" }, { status: 404 })
    }

    return NextResponse.json({ requirement: data })
  } catch (error: any) {
    console.error("Error in GET /api/destination-requirements/[id]:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT - Actualizar requisito
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    
    if (!canPerformAction(user, "settings", "write")) {
      return NextResponse.json({ error: "No tiene permiso para editar requisitos" }, { status: 403 })
    }

    const { id } = await params
    const supabase = await createServerClient()
    const body = await request.json()

    const {
      destination_code,
      destination_name,
      requirement_type,
      requirement_name,
      is_required,
      description,
      url,
      days_before_trip,
      valid_from,
      valid_to,
      is_active,
    } = body

    const updateData: any = {}
    if (destination_code !== undefined) updateData.destination_code = destination_code.toUpperCase()
    if (destination_name !== undefined) updateData.destination_name = destination_name
    if (requirement_type !== undefined) updateData.requirement_type = requirement_type
    if (requirement_name !== undefined) updateData.requirement_name = requirement_name
    if (is_required !== undefined) updateData.is_required = is_required
    if (description !== undefined) updateData.description = description
    if (url !== undefined) updateData.url = url
    if (days_before_trip !== undefined) updateData.days_before_trip = days_before_trip
    if (valid_from !== undefined) updateData.valid_from = valid_from
    if (valid_to !== undefined) updateData.valid_to = valid_to
    if (is_active !== undefined) updateData.is_active = is_active

    const { data, error } = await (supabase.from("destination_requirements") as any)
      .update(updateData)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("Error updating requirement:", error)
      return NextResponse.json({ error: "Error al actualizar requisito" }, { status: 500 })
    }

    return NextResponse.json({ requirement: data })
  } catch (error: any) {
    console.error("Error in PUT /api/destination-requirements/[id]:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - Eliminar requisito
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    
    if (!canPerformAction(user, "settings", "write")) {
      return NextResponse.json({ error: "No tiene permiso para eliminar requisitos" }, { status: 403 })
    }

    const { id } = await params
    const supabase = await createServerClient()

    const { error } = await (supabase.from("destination_requirements") as any)
      .delete()
      .eq("id", id)

    if (error) {
      console.error("Error deleting requirement:", error)
      return NextResponse.json({ error: "Error al eliminar requisito" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error in DELETE /api/destination-requirements/[id]:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

