import { NextResponse } from "next/server"
import { createAdminClient, createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { resolveAgencyPermissionScope } from "@/lib/permissions/agency-scope-server"
import { z } from "zod"

export const dynamic = 'force-dynamic'

// Schema de validación
const createTemplateSchema = z.object({
  agency_id: z.string().uuid(),
  name: z.string().min(1, "El nombre es requerido"),
  description: z.string().optional(),
  template_type: z.enum(['invoice', 'budget', 'voucher', 'itinerary', 'receipt', 'contract', 'general']),
  html_content: z.string().min(1, "El contenido HTML es requerido"),
  css_styles: z.string().optional(),
  page_size: z.string().default('A4'),
  page_orientation: z.enum(['portrait', 'landscape']).default('portrait'),
  page_margins: z.object({
    top: z.number(),
    right: z.number(),
    bottom: z.number(),
    left: z.number(),
  }).optional(),
  header_html: z.string().optional(),
  footer_html: z.string().optional(),
  show_page_numbers: z.boolean().default(true),
  available_variables: z.array(z.object({
    name: z.string(),
    description: z.string(),
    example: z.string().optional(),
  })).optional(),
  is_default: z.boolean().default(false),
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

// GET - Obtener templates
export async function GET(request: Request) {
  try {
    const access = await templateAccess("read")
    if (!access) return NextResponse.json({ error: "No tiene permiso para ver templates" }, { status: 403 })
    const { user, scope } = access
    const admin = createAdminClient()
    const { searchParams } = new URL(request.url)

    // Obtener agencias del usuario
    // Parámetros de filtro
    const templateType = searchParams.get("type")

    // Query base - scope por org_id (NOT NULL post-migration 133).
    // Si agencyIds tiene data, tambien por ahi (preserva comportamiento anterior).
    let query = (admin.from("pdf_templates") as any)
      .select(`*`)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("name", { ascending: true })

    if (user.org_id) {
      query = query.eq("org_id", user.org_id)
    }
    query = query.in("agency_id", scope.agencyIds)

    // Filtros
    if (templateType) {
      query = query.eq("template_type", templateType)
    }

    const { data: templates, error } = await query

    if (error) {
      console.error("Error fetching templates:", error)
      return NextResponse.json(
        { error: "Error al obtener templates" },
        { status: 500 }
      )
    }

    return NextResponse.json({ templates })
  } catch (error: any) {
    console.error("Error in GET /api/templates:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener templates" },
      { status: 500 }
    )
  }
}

// POST - Crear template
export async function POST(request: Request) {
  try {
    const access = await templateAccess("write")
    if (!access) {
      return NextResponse.json(
        { error: "No tiene permiso para crear templates" },
        { status: 403 }
      )
    }
    const { user, scope } = access
    const admin = createAdminClient()

    const body = await request.json()
    const validatedData = createTemplateSchema.parse(body)
    if (!scope.agencyIds.includes(validatedData.agency_id)) {
      return NextResponse.json({ error: "Agencia no encontrada" }, { status: 404 })
    }
    const { agency_id: agencyId, ...templateData } = validatedData

    // Si es template por defecto, quitar default de otros del mismo tipo
    if (validatedData.is_default) {
      await (admin.from("pdf_templates") as any)
        .update({ is_default: false })
        .eq("org_id", user.org_id)
        .eq("agency_id", agencyId)
        .eq("template_type", validatedData.template_type)
    }

    // Multi-tenant: org_id requerido (NOT NULL post-migration 133).
    if (!user.org_id) {
      return NextResponse.json(
        { error: "Tu usuario no tiene organización asociada" },
        { status: 400 }
      )
    }

    // Crear template
    const { data: template, error } = await (admin.from("pdf_templates") as any)
      .insert({
        agency_id: agencyId,
        org_id: user.org_id,
        ...templateData,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating template:", error)
      return NextResponse.json(
        { error: "Error al crear template" },
        { status: 500 }
      )
    }

    return NextResponse.json({ template })
  } catch (error: any) {
    console.error("Error in POST /api/templates:", error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error.message || "Error al crear template" },
      { status: 500 }
    )
  }
}
