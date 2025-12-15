import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { canPerformAction } from "@/lib/permissions-api"

// GET: Obtener todos los comentarios de un lead
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const { id: leadId } = await params

    if (!canPerformAction(user, "leads", "read")) {
      return NextResponse.json({ error: "No tiene permiso para ver comentarios" }, { status: 403 })
    }

    const supabase = await createServerClient()

    // Verificar que el lead existe
    const { data: lead } = await supabase
      .from("leads")
      .select("id")
      .eq("id", leadId)
      .maybeSingle()

    if (!lead) {
      return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 })
    }

    // Obtener comentarios con información del usuario
    const { data: comments, error } = await (supabase.from("lead_comments") as any)
      .select(`
        id,
        comment,
        created_at,
        updated_at,
        user_id,
        users:user_id (
          id,
          name,
          email
        )
      `)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching comments:", error)
      return NextResponse.json({ error: "Error al obtener comentarios" }, { status: 500 })
    }

    return NextResponse.json({ comments: comments || [] })
  } catch (error: any) {
    console.error("Error in GET /api/leads/[id]/comments:", error)
    return NextResponse.json({ error: error.message || "Error al obtener comentarios" }, { status: 500 })
  }
}

// POST: Crear un nuevo comentario
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await getCurrentUser()
    const { id: leadId } = await params
    const body = await request.json()
    const { comment } = body

    if (!canPerformAction(user, "leads", "write")) {
      return NextResponse.json({ error: "No tiene permiso para crear comentarios" }, { status: 403 })
    }

    if (!comment || !comment.trim()) {
      return NextResponse.json({ error: "El comentario no puede estar vacío" }, { status: 400 })
    }

    const supabase = await createServerClient()

    // Verificar que el lead existe
    const { data: lead } = await supabase
      .from("leads")
      .select("id")
      .eq("id", leadId)
      .maybeSingle()

    if (!lead) {
      return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 })
    }

    // Crear el comentario
    const { data: newComment, error } = await (supabase.from("lead_comments") as any)
      .insert({
        lead_id: leadId,
        user_id: user.id,
        comment: comment.trim(),
      })
      .select(`
        id,
        comment,
        created_at,
        updated_at,
        user_id,
        users:user_id (
          id,
          name,
          email
        )
      `)
      .single()

    if (error) {
      console.error("Error creating comment:", error)
      return NextResponse.json({ error: "Error al crear comentario" }, { status: 500 })
    }

    return NextResponse.json({ comment: newComment }, { status: 201 })
  } catch (error: any) {
    console.error("Error in POST /api/leads/[id]/comments:", error)
    return NextResponse.json({ error: error.message || "Error al crear comentario" }, { status: 500 })
  }
}

