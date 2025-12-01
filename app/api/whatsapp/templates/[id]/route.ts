import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { id } = await params
    const body = await request.json()

    // Solo ADMIN o SUPER_ADMIN pueden editar templates
    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const allowedFields = [
      "name",
      "description",
      "category",
      "trigger_type",
      "template",
      "emoji_prefix",
      "is_active",
      "send_hour_from",
      "send_hour_to",
    ]

    const updateData: Record<string, any> = {}
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    const { data: template, error } = await (supabase.from("message_templates") as any)
      .update(updateData)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("Error updating template:", error)
      return NextResponse.json({ error: "Error al actualizar template" }, { status: 500 })
    }

    return NextResponse.json({ success: true, template })
  } catch (error: any) {
    console.error("Error in PATCH /api/whatsapp/templates/[id]:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { id } = await params

    // Solo SUPER_ADMIN puede eliminar templates
    if (user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const { error } = await (supabase.from("message_templates") as any)
      .delete()
      .eq("id", id)

    if (error) {
      console.error("Error deleting template:", error)
      return NextResponse.json({ error: "Error al eliminar template" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error in DELETE /api/whatsapp/templates/[id]:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

