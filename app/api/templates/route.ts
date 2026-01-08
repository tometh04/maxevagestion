import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { z } from "zod"

export const dynamic = 'force-dynamic'

// Schema de validación
const createTemplateSchema = z.object({
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

// GET - Obtener templates
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Parámetros de filtro
    const templateType = searchParams.get("type")

    // Query base
    let query = (supabase.from("pdf_templates") as any)
      .select(`
        *,
        created_by_user:users!pdf_templates_created_by_fkey (id, first_name, last_name)
      `)
      .in("agency_id", agencyIds)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("name", { ascending: true })

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
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Verificar permisos (solo admins)
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: "No tiene permiso para crear templates" },
        { status: 403 }
      )
    }

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)
    
    if (agencyIds.length === 0) {
      return NextResponse.json(
        { error: "No tiene agencias asignadas" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const validatedData = createTemplateSchema.parse(body)

    // Si es template por defecto, quitar default de otros del mismo tipo
    if (validatedData.is_default) {
      await (supabase.from("pdf_templates") as any)
        .update({ is_default: false })
        .eq("agency_id", agencyIds[0])
        .eq("template_type", validatedData.template_type)
    }

    // Crear template
    const { data: template, error } = await (supabase.from("pdf_templates") as any)
      .insert({
        agency_id: agencyIds[0],
        ...validatedData,
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
