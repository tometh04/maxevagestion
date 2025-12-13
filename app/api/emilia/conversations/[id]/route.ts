import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// GET /api/emilia/conversations/[id] - Obtener conversación con mensajes
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const { id: conversationId } = await params
    const supabase = await createServerClient()

    // Obtener conversación
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .single()

    if (convError || !conversation) {
      return NextResponse.json(
        { error: "Conversación no encontrada" },
        { status: 404 }
      )
    }

    // Obtener mensajes de la conversación
    const { data: messages, error: messagesError } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })

    if (messagesError) {
      console.error("Error fetching messages:", messagesError)
      return NextResponse.json(
        { error: "Error al cargar mensajes" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      conversation: {
        id: (conversation as any).id,
        title: (conversation as any).title,
        state: (conversation as any).state,
        channel: (conversation as any).channel,
        last_search_context: (conversation as any).last_search_context,
        last_message_at: (conversation as any).last_message_at,
        created_at: (conversation as any).created_at,
      },
      messages: messages.map((msg: any) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        created_at: msg.created_at,
      })),
    })
  } catch (error: any) {
    console.error("Error in GET /api/emilia/conversations/[id]:", error)
    return NextResponse.json(
      { error: error?.message || "Error interno del servidor" },
      { status: 500 }
    )
  }
}

// DELETE /api/emilia/conversations/[id] - Cerrar conversación (soft delete)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const { id: conversationId } = await params
    const supabase = await createServerClient()

    // Verificar que la conversación pertenece al usuario
    const { data: conversation, error: checkError } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .single()

    if (checkError || !conversation) {
      return NextResponse.json(
        { error: "Conversación no encontrada" },
        { status: 404 }
      )
    }

    // Soft delete: cambiar estado a 'closed'
    const { error: updateError } = await (supabase.from("conversations") as any)
      .update({ state: "closed" })
      .eq("id", conversationId)

    if (updateError) {
      console.error("Error closing conversation:", updateError)
      return NextResponse.json(
        { error: "Error al cerrar conversación" },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error in DELETE /api/emilia/conversations/[id]:", error)
    return NextResponse.json(
      { error: error?.message || "Error interno del servidor" },
      { status: 500 }
    )
  }
}

