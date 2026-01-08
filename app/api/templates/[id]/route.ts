import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { z } from "zod"

export const dynamic = 'force-dynamic'

// Schema de validación para actualizar
const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  html_content: z.string().optional(),
  css_styles: z.string().optional(),
  page_size: z.string().optional(),
  page_orientation: z.enum(['portrait', 'landscape']).optional(),
  page_margins: z.object({
    top: z.number(),
    right: z.number(),
    bottom: z.number(),
    left: z.number(),
  }).optional(),
  header_html: z.string().optional(),
  footer_html: z.string().optional(),
  show_page_numbers: z.boolean().optional(),
  available_variables: z.array(z.any()).optional(),
  is_default: z.boolean().optional(),
  is_active: z.boolean().optional(),
  logo_url: z.string().optional(),
  primary_color: z.string().optional(),
  secondary_color: z.string().optional(),
})

// GET - Obtener template por ID
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

    // Obtener template
    const { data: template, error } = await (supabase.from("pdf_templates") as any)
      .select(`
        *,
        created_by_user:users!pdf_templates_created_by_fkey (id, first_name, last_name)
      `)
      .eq("id", id)
      .in("agency_id", agencyIds)
      .single()

    if (error || !template) {
      return NextResponse.json(
        { error: "Template no encontrado" },
        { status: 404 }
      )
    }

    return NextResponse.json({ template })
  } catch (error: any) {
    console.error("Error in GET /api/templates/[id]:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener template" },
      { status: 500 }
    )
  }
}

// PUT - Actualizar template
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Verificar permisos (solo admins)
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: "No tiene permiso para editar templates" },
        { status: 403 }
      )
    }

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Verificar que el template existe
    const { data: existing, error: fetchError } = await (supabase.from("pdf_templates") as any)
      .select("id, agency_id, template_type")
      .eq("id", id)
      .in("agency_id", agencyIds)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Template no encontrado" },
        { status: 404 }
      )
    }

    const body = await request.json()
    const validatedData = updateTemplateSchema.parse(body)

    // Si se establece como default, quitar default de otros
    if (validatedData.is_default) {
      await (supabase.from("pdf_templates") as any)
        .update({ is_default: false })
        .eq("agency_id", existing.agency_id)
        .eq("template_type", existing.template_type)
        .neq("id", id)
    }

    // Actualizar template
    const { data: template, error } = await (supabase.from("pdf_templates") as any)
      .update(validatedData)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("Error updating template:", error)
      return NextResponse.json(
        { error: "Error al actualizar template" },
        { status: 500 }
      )
    }

    return NextResponse.json({ template })
  } catch (error: any) {
    console.error("Error in PUT /api/templates/[id]:", error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error.message || "Error al actualizar template" },
      { status: 500 }
    )
  }
}

// DELETE - Eliminar template (soft delete)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Verificar permisos (solo admins)
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: "No tiene permiso para eliminar templates" },
        { status: 403 }
      )
    }

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Soft delete
    const { error } = await (supabase.from("pdf_templates") as any)
      .update({ is_active: false })
      .eq("id", id)
      .in("agency_id", agencyIds)

    if (error) {
      console.error("Error deleting template:", error)
      return NextResponse.json(
        { error: "Error al eliminar template" },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error in DELETE /api/templates/[id]:", error)
    return NextResponse.json(
      { error: error.message || "Error al eliminar template" },
      { status: 500 }
    )
  }
}
