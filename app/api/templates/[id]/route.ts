import { NextResponse } from "next/server"
import { createAdminClient, createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { resolveAgencyPermissionScope } from "@/lib/permissions/agency-scope-server"
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

async function templateAccess(permission: "read" | "write") {
  const { user } = await getCurrentUser()
  if (!user.org_id) return null
  const supabase = await createServerClient()
  const scope = await resolveAgencyPermissionScope(supabase, user, "settings", permission)
  if (scope.agencyIds.length === 0) return null
  return { user, supabase, scope }
}

// GET - Obtener template por ID
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const access = await templateAccess("read")
    if (!access) return NextResponse.json({ error: "No tiene permiso para ver templates" }, { status: 403 })
    const { scope, user } = access
    const admin = createAdminClient()

    // Obtener agencias del usuario
    // Obtener template - simplificada
    const { data: template, error } = await (admin.from("pdf_templates") as any)
      .select(`*`)
      .eq("id", id)
      .eq("org_id", user.org_id)
      .in("agency_id", scope.agencyIds)
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
    const access = await templateAccess("write")
    if (!access) {
      return NextResponse.json(
        { error: "No tiene permiso para editar templates" },
        { status: 403 }
      )
    }
    const { user, scope } = access
    const admin = createAdminClient()

    // Obtener agencias del usuario
    // Verificar que el template existe
    const { data: existing, error: fetchError } = await (admin.from("pdf_templates") as any)
      .select("id, agency_id, template_type")
      .eq("id", id)
      .eq("org_id", user.org_id)
      .in("agency_id", scope.agencyIds)
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
      await (admin.from("pdf_templates") as any)
        .update({ is_default: false })
        .eq("org_id", user.org_id)
        .eq("agency_id", existing.agency_id)
        .eq("template_type", existing.template_type)
        .neq("id", id)
    }

    // Actualizar template
    const { data: template, error } = await (admin.from("pdf_templates") as any)
      .update(validatedData)
      .eq("id", id)
      .eq("org_id", user.org_id)
      .eq("agency_id", existing.agency_id)
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
    const access = await templateAccess("write")
    if (!access) {
      return NextResponse.json(
        { error: "No tiene permiso para eliminar templates" },
        { status: 403 }
      )
    }
    const { user, scope } = access
    const admin = createAdminClient()

    // Obtener agencias del usuario
    // Soft delete
    const { error } = await (admin.from("pdf_templates") as any)
      .update({ is_active: false })
      .eq("id", id)
      .eq("org_id", user.org_id)
      .in("agency_id", scope.agencyIds)

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
