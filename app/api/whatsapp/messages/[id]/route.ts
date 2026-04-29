import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canUserAccessMessage } from "@/lib/whatsapp/message-access"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { id } = await params
    const body = await request.json()
    const { data: existingMessage, error: fetchError } = await (supabase.from("whatsapp_messages") as any)
      .select("id, agency_id, operation_id, recipient_user_id")
      .eq("id", id)
      .maybeSingle()

    if (fetchError || !existingMessage) {
      return NextResponse.json({ error: "Mensaje no encontrado" }, { status: 404 })
    }

    const canAccess = await canUserAccessMessage(supabase, user, existingMessage)
    if (!canAccess) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const updateData: any = {}

    // Marcar como enviado
    if (body.status === "SENT") {
      updateData.status = "SENT"
      updateData.sent_at = new Date().toISOString()
      updateData.sent_by = user.id
    }
    // Marcar como omitido
    else if (body.status === "SKIPPED") {
      updateData.status = "SKIPPED"
    }
    // Actualizar mensaje
    else if (body.message) {
      updateData.message = body.message
      // Regenerar link
      const cleanPhone = body.phone?.replace(/\D/g, "") || ""
      if (cleanPhone) {
        updateData.whatsapp_link = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(body.message)}`
      }
    }

    const { data: message, error } = await (supabase.from("whatsapp_messages") as any)
      .update(updateData)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("Error updating message:", error)
      return NextResponse.json({ error: "Error al actualizar mensaje" }, { status: 500 })
    }

    return NextResponse.json({ success: true, message })
  } catch (error: any) {
    console.error("Error in PATCH /api/whatsapp/messages/[id]:", error)
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
    const { data: existingMessage, error: fetchError } = await (supabase.from("whatsapp_messages") as any)
      .select("id, agency_id, operation_id, recipient_user_id")
      .eq("id", id)
      .maybeSingle()

    if (fetchError || !existingMessage) {
      return NextResponse.json({ error: "Mensaje no encontrado" }, { status: 404 })
    }

    const canAccess = await canUserAccessMessage(supabase, user, existingMessage)
    if (!canAccess) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const { error } = await (supabase.from("whatsapp_messages") as any)
      .delete()
      .eq("id", id)

    if (error) {
      console.error("Error deleting message:", error)
      return NextResponse.json({ error: "Error al eliminar mensaje" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error in DELETE /api/whatsapp/messages/[id]:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

