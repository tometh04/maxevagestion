import { getCurrentUser } from "@/lib/auth"
import { createServerClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// GET /api/emilia/conversations - Listar conversaciones del usuario
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const state = searchParams.get("state") || "active"
    const limit = parseInt(searchParams.get("limit") || "50")

    const supabase = await createServerClient()

    // Query para obtener conversaciones
    const { data: conversations, error } = await supabase
      .from("conversations")
      .select("*")
      .eq("user_id", user.id)
      .eq("state", state)
      .order("last_message_at", { ascending: false })
      .limit(limit)

    if (error) {
      console.error("Error fetching conversations:", error)
      console.error("Error details:", JSON.stringify(error, null, 2))
      return NextResponse.json(
        { error: `Error al cargar conversaciones: ${error.message || JSON.stringify(error)}` },
        { status: 500 }
      )
    }

    // Para cada conversación, obtener el último mensaje
    const formattedConversations = await Promise.all(
      (conversations || []).map(async (conv: any) => {
        // Obtener último mensaje
        const { data: lastMessage } = await supabase
          .from("messages")
          .select("content, created_at")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single()

        const lastMessagePreview = (lastMessage as any)?.content?.text
          ? (lastMessage as any).content.text.substring(0, 100)
          : "[Búsqueda de viaje]"

        return {
          id: conv.id,
          title: conv.title,
          state: conv.state,
          channel: conv.channel,
          lastMessageAt: conv.last_message_at,
          lastMessagePreview,
          createdAt: conv.created_at,
        }
      })
    )

    return NextResponse.json({ conversations: formattedConversations })
  } catch (error: any) {
    console.error("Error in GET /api/emilia/conversations:", error)
    return NextResponse.json(
      { error: error?.message || "Error interno del servidor" },
      { status: 500 }
    )
  }
}

// POST /api/emilia/conversations - Crear nueva conversación
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const supabase = await createServerClient()

    // Crear nueva conversación con título temporal
    const now = new Date()
    const dateStr = now.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })

    const { data: conversation, error } = await (supabase.from("conversations") as any)
      .insert({
        user_id: user.id,
        title: `Chat ${dateStr}`,
        state: "active",
        channel: "web",
        last_search_context: null,
        last_message_at: now.toISOString(),
      })
      .select('id, title, state, created_at')
      .single()

    if (error) {
      console.error("Error creating conversation:", error)
      return NextResponse.json(
        { error: "Error al crear conversación" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      id: (conversation as any).id,
      title: (conversation as any).title,
      state: (conversation as any).state,
      createdAt: (conversation as any).created_at,
    })
  } catch (error: any) {
    console.error("Error in POST /api/emilia/conversations:", error)
    return NextResponse.json(
      { error: error?.message || "Error interno del servidor" },
      { status: 500 }
    )
  }
}

