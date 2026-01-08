import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { z } from "zod"

export const dynamic = 'force-dynamic'

// Schema de validación
const createCommentSchema = z.object({
  content: z.string().min(1, "El comentario no puede estar vacío"),
  parent_id: z.string().uuid().optional().nullable(),
})

// GET - Obtener comentarios de una nota
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: noteId } = await params
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Verificar acceso a la nota
    const { data: note, error: noteError } = await (supabase.from("notes") as any)
      .select("id")
      .eq("id", noteId)
      .in("agency_id", agencyIds)
      .single()

    if (noteError || !note) {
      return NextResponse.json(
        { error: "Nota no encontrada" },
        { status: 404 }
      )
    }

    // Obtener comentarios
    const { data: comments, error } = await (supabase.from("note_comments") as any)
      .select(`
        *,
        created_by_user:users!note_comments_created_by_fkey (id, first_name, last_name, avatar_url)
      `)
      .eq("note_id", noteId)
      .order("created_at", { ascending: true })

    if (error) {
      console.error("Error fetching comments:", error)
      return NextResponse.json(
        { error: "Error al obtener comentarios" },
        { status: 500 }
      )
    }

    // Organizar en árbol (threading)
    const rootComments = comments.filter((c: any) => !c.parent_id)
    const childComments = comments.filter((c: any) => c.parent_id)

    const buildTree = (comment: any): any => {
      const children = childComments.filter((c: any) => c.parent_id === comment.id)
      return {
        ...comment,
        replies: children.map(buildTree),
      }
    }

    const threaded = rootComments.map(buildTree)

    return NextResponse.json({ comments: threaded })
  } catch (error: any) {
    console.error("Error in GET /api/notes/[id]/comments:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener comentarios" },
      { status: 500 }
    )
  }
}

// POST - Crear comentario
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: noteId } = await params
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Verificar acceso a la nota
    const { data: note, error: noteError } = await (supabase.from("notes") as any)
      .select("id, created_by, visibility")
      .eq("id", noteId)
      .in("agency_id", agencyIds)
      .single()

    if (noteError || !note) {
      return NextResponse.json(
        { error: "Nota no encontrada" },
        { status: 404 }
      )
    }

    const body = await request.json()
    const validatedData = createCommentSchema.parse(body)

    // Si es respuesta, verificar que el comentario padre existe
    if (validatedData.parent_id) {
      const { data: parent } = await (supabase.from("note_comments") as any)
        .select("id")
        .eq("id", validatedData.parent_id)
        .eq("note_id", noteId)
        .single()

      if (!parent) {
        return NextResponse.json(
          { error: "Comentario padre no encontrado" },
          { status: 404 }
        )
      }
    }

    // Crear comentario
    const { data: comment, error } = await (supabase.from("note_comments") as any)
      .insert({
        note_id: noteId,
        content: validatedData.content,
        parent_id: validatedData.parent_id,
        created_by: user.id,
      })
      .select(`
        *,
        created_by_user:users!note_comments_created_by_fkey (id, first_name, last_name, avatar_url)
      `)
      .single()

    if (error) {
      console.error("Error creating comment:", error)
      return NextResponse.json(
        { error: "Error al crear comentario" },
        { status: 500 }
      )
    }

    return NextResponse.json({ comment })
  } catch (error: any) {
    console.error("Error in POST /api/notes/[id]/comments:", error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error.message || "Error al crear comentario" },
      { status: 500 }
    )
  }
}
