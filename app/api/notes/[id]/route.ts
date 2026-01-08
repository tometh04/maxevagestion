import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { z } from "zod"

export const dynamic = 'force-dynamic'

// Schema de validación para actualizar nota
const updateNoteSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().optional(),
  visibility: z.enum(['private', 'team', 'agency']).optional(),
  tags: z.array(z.string()).optional(),
  color: z.string().optional().nullable(),
  is_pinned: z.boolean().optional(),
  status: z.enum(['active', 'archived', 'deleted']).optional(),
})

// GET - Obtener nota por ID
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Obtener nota con relaciones
    const { data: note, error } = await (supabase.from("notes") as any)
      .select(`
        *,
        comments:note_comments (
          id,
          content,
          parent_id,
          created_by,
          created_at,
          updated_at
        ),
        attachments:note_attachments (
          id,
          file_name,
          file_type,
          file_size,
          file_url,
          uploaded_by,
          created_at
        )
      `)
      .eq("id", id)
      .in("agency_id", agencyIds)
      .single()

    if (error || !note) {
      return NextResponse.json(
        { error: "Nota no encontrada" },
        { status: 404 }
      )
    }

    return NextResponse.json({ note })
  } catch (error: any) {
    console.error("Error in GET /api/notes/[id]:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener nota" },
      { status: 500 }
    )
  }
}

// PUT - Actualizar nota
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Verificar que la nota existe y pertenece a las agencias del usuario
    const { data: existingNote, error: fetchError } = await (supabase.from("notes") as any)
      .select("id, created_by")
      .eq("id", id)
      .in("agency_id", agencyIds)
      .single()

    if (fetchError || !existingNote) {
      return NextResponse.json(
        { error: "Nota no encontrada" },
        { status: 404 }
      )
    }

    // Verificar permisos (solo el creador o admins)
    const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'
    if (existingNote.created_by !== user.id && !isAdmin) {
      return NextResponse.json(
        { error: "No tiene permiso para editar esta nota" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const validatedData = updateNoteSchema.parse(body)

    // Actualizar nota
    const { data: note, error } = await (supabase.from("notes") as any)
      .update(validatedData)
      .eq("id", id)
      .select(`*`)
      .single()

    if (error) {
      console.error("Error updating note:", error)
      return NextResponse.json(
        { error: "Error al actualizar nota" },
        { status: 500 }
      )
    }

    return NextResponse.json({ note })
  } catch (error: any) {
    console.error("Error in PUT /api/notes/[id]:", error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error.message || "Error al actualizar nota" },
      { status: 500 }
    )
  }
}

// DELETE - Eliminar nota (soft delete)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Verificar que la nota existe y pertenece a las agencias del usuario
    const { data: existingNote, error: fetchError } = await (supabase.from("notes") as any)
      .select("id, created_by")
      .eq("id", id)
      .in("agency_id", agencyIds)
      .single()

    if (fetchError || !existingNote) {
      return NextResponse.json(
        { error: "Nota no encontrada" },
        { status: 404 }
      )
    }

    // Verificar permisos (solo el creador o admins)
    const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'
    if (existingNote.created_by !== user.id && !isAdmin) {
      return NextResponse.json(
        { error: "No tiene permiso para eliminar esta nota" },
        { status: 403 }
      )
    }

    // Soft delete
    const { error } = await (supabase.from("notes") as any)
      .update({ status: 'deleted' })
      .eq("id", id)

    if (error) {
      console.error("Error deleting note:", error)
      return NextResponse.json(
        { error: "Error al eliminar nota" },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error in DELETE /api/notes/[id]:", error)
    return NextResponse.json(
      { error: error.message || "Error al eliminar nota" },
      { status: 500 }
    )
  }
}
