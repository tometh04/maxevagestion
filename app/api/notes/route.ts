import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { z } from "zod"

export const dynamic = 'force-dynamic'

// Schema de validación para crear nota
const createNoteSchema = z.object({
  title: z.string().min(1, "El título es requerido"),
  content: z.string().optional(),
  note_type: z.enum(['general', 'operation', 'customer']).default('general'),
  operation_id: z.string().uuid().optional().nullable(),
  customer_id: z.string().uuid().optional().nullable(),
  visibility: z.enum(['private', 'team', 'agency']).default('private'),
  tags: z.array(z.string()).optional().default([]),
  color: z.string().optional().nullable(),
  is_pinned: z.boolean().optional().default(false),
})

// GET - Obtener notas
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Parámetros de filtro
    const noteType = searchParams.get("type")
    const operationId = searchParams.get("operationId")
    const customerId = searchParams.get("customerId")
    const status = searchParams.get("status") || "active"
    const search = searchParams.get("search")
    const tag = searchParams.get("tag")
    const limit = parseInt(searchParams.get("limit") || "50", 10)
    const offset = parseInt(searchParams.get("offset") || "0", 10)

    // Query base
    let query = (supabase.from("notes") as any)
      .select(`
        *,
        created_by_user:users!notes_created_by_fkey (id, first_name, last_name, avatar_url),
        operation:operations (id, file_code, destination),
        customer:customers (id, first_name, last_name),
        comments:note_comments (count),
        attachments:note_attachments (count)
      `)
      .in("agency_id", agencyIds)
      .eq("status", status)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })

    // Filtros
    if (noteType) {
      query = query.eq("note_type", noteType)
    }
    if (operationId) {
      query = query.eq("operation_id", operationId)
    }
    if (customerId) {
      query = query.eq("customer_id", customerId)
    }
    if (tag) {
      query = query.contains("tags", [tag])
    }
    if (search) {
      query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`)
    }

    // Paginación
    query = query.range(offset, offset + limit - 1)

    const { data: notes, error } = await query

    if (error) {
      console.error("Error fetching notes:", error)
      return NextResponse.json(
        { error: "Error al obtener notas" },
        { status: 500 }
      )
    }

    // Obtener todos los tags únicos
    const { data: allNotes } = await (supabase.from("notes") as any)
      .select("tags")
      .in("agency_id", agencyIds)
      .eq("status", "active")

    const allTags = Array.from(new Set((allNotes || []).flatMap((n: any) => n.tags || [])))

    return NextResponse.json({ notes, tags: allTags })
  } catch (error: any) {
    console.error("Error in GET /api/notes:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener notas" },
      { status: 500 }
    )
  }
}

// POST - Crear nota
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
    
    if (agencyIds.length === 0) {
      return NextResponse.json(
        { error: "No tiene agencias asignadas" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const validatedData = createNoteSchema.parse(body)

    // Validar relaciones según tipo
    if (validatedData.note_type === 'operation' && !validatedData.operation_id) {
      return NextResponse.json(
        { error: "Debe seleccionar una operación para notas de tipo operación" },
        { status: 400 }
      )
    }
    if (validatedData.note_type === 'customer' && !validatedData.customer_id) {
      return NextResponse.json(
        { error: "Debe seleccionar un cliente para notas de tipo cliente" },
        { status: 400 }
      )
    }

    // Crear nota
    const { data: note, error } = await (supabase.from("notes") as any)
      .insert({
        agency_id: agencyIds[0],
        title: validatedData.title,
        content: validatedData.content,
        note_type: validatedData.note_type,
        operation_id: validatedData.operation_id,
        customer_id: validatedData.customer_id,
        visibility: validatedData.visibility,
        tags: validatedData.tags,
        color: validatedData.color,
        is_pinned: validatedData.is_pinned,
        created_by: user.id,
      })
      .select(`
        *,
        created_by_user:users!notes_created_by_fkey (id, first_name, last_name, avatar_url)
      `)
      .single()

    if (error) {
      console.error("Error creating note:", error)
      return NextResponse.json(
        { error: "Error al crear nota" },
        { status: 500 }
      )
    }

    return NextResponse.json({ note })
  } catch (error: any) {
    console.error("Error in POST /api/notes:", error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error.message || "Error al crear nota" },
      { status: 500 }
    )
  }
}
