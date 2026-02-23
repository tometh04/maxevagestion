import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { z } from "zod"

export const dynamic = 'force-dynamic'

// Schema de validación para configuración de herramientas
const toolsSettingsSchema = z.object({
  // Emilia
  emilia_enabled: z.boolean().optional(),
  emilia_model: z.string().optional(),
  emilia_temperature: z.number().min(0).max(2).optional(),
  emilia_max_tokens: z.number().min(100).max(8000).optional(),
  emilia_system_prompt: z.string().optional(),
  emilia_allowed_actions: z.array(z.string()).optional(),
  
  // Email
  email_enabled: z.boolean().optional(),
  email_provider: z.string().optional(),
  email_from_name: z.string().optional(),
  email_from_address: z.string().email().optional().nullable(),
  email_reply_to: z.string().email().optional().nullable(),
  email_signature: z.string().optional(),
  email_templates: z.record(z.any()).optional(),
  
  // WhatsApp
  whatsapp_enabled: z.boolean().optional(),
  whatsapp_provider: z.enum(['manual', 'api', 'manychat']).optional(),
  whatsapp_api_key: z.string().optional(),
  whatsapp_default_country_code: z.string().optional(),
  whatsapp_templates: z.record(z.any()).optional(),
  
  // Notificaciones
  notifications_enabled: z.boolean().optional(),
  notifications_sound: z.boolean().optional(),
  notifications_desktop: z.boolean().optional(),
  notifications_email_digest: z.boolean().optional(),
  notifications_digest_frequency: z.enum(['daily', 'weekly', 'never']).optional(),
  
  // Exportaciones
  export_default_format: z.enum(['xlsx', 'csv', 'pdf']).optional(),
  export_include_headers: z.boolean().optional(),
  export_date_format: z.string().optional(),
  export_currency_format: z.enum(['symbol', 'code', 'both']).optional(),
  export_logo_url: z.string().url().optional().nullable(),
  export_company_info: z.record(z.any()).optional(),
  
  // UI
  ui_theme: z.enum(['light', 'dark', 'system']).optional(),
  ui_sidebar_collapsed: z.boolean().optional(),
  ui_compact_mode: z.boolean().optional(),
  ui_show_tooltips: z.boolean().optional(),
  ui_default_currency_display: z.string().optional(),
  ui_date_format: z.string().optional(),
  ui_time_format: z.enum(['12h', '24h']).optional(),
  ui_language: z.string().optional(),
  
  // Backups
  backups_enabled: z.boolean().optional(),
  backups_frequency: z.enum(['daily', 'weekly', 'monthly']).optional(),
  backups_retention_days: z.number().min(1).max(365).optional(),
  backups_include_attachments: z.boolean().optional(),
})

// GET - Obtener configuración de herramientas
export async function GET() {
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

    // Obtener configuración existente
    const { data: existing, error } = await supabase
      .from("tools_settings")
      .select("*")
      .eq("agency_id", agencyIds[0])
      .maybeSingle()

    if (error && error.code !== 'PGRST116') {
      console.error("Error fetching tools settings:", error)
      return NextResponse.json(
        { error: "Error al obtener configuración" },
        { status: 500 }
      )
    }

    // Si no existe, crear configuración por defecto
    if (!existing) {
      const defaultSettings = {
        agency_id: agencyIds[0],
        emilia_enabled: true,
        emilia_model: 'gpt-4',
        emilia_temperature: 0.7,
        emilia_max_tokens: 2000,
        emilia_allowed_actions: ['search', 'summarize', 'suggest'],
        email_enabled: true,
        email_provider: 'resend',
        email_from_name: 'MAXEVA Gestión',
        whatsapp_enabled: true,
        whatsapp_provider: 'manual',
        whatsapp_default_country_code: '+54',
        notifications_enabled: true,
        notifications_sound: true,
        notifications_desktop: true,
        notifications_email_digest: false,
        notifications_digest_frequency: 'daily',
        export_default_format: 'xlsx',
        export_include_headers: true,
        export_date_format: 'DD/MM/YYYY',
        export_currency_format: 'symbol',
        ui_theme: 'system',
        ui_sidebar_collapsed: false,
        ui_compact_mode: false,
        ui_show_tooltips: true,
        ui_default_currency_display: 'ARS',
        ui_date_format: 'DD/MM/YYYY',
        ui_time_format: '24h',
        ui_language: 'es',
        backups_enabled: false,
        backups_frequency: 'weekly',
        backups_retention_days: 30,
        backups_include_attachments: false,
        created_by: user.id,
      }

      const { data: newData, error: insertError } = await (supabase.from("tools_settings") as any)
        .insert(defaultSettings)
        .select()
        .single()

      if (insertError) {
        console.error("Error creating default tools settings:", insertError)
        return NextResponse.json(
          { error: "Error al crear configuración por defecto" },
          { status: 500 }
        )
      }

      return NextResponse.json(newData)
    }

    return NextResponse.json(existing)
  } catch (error: any) {
    console.error("Error in GET /api/tools/settings:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener configuración" },
      { status: 500 }
    )
  }
}

// PUT - Actualizar configuración de herramientas
export async function PUT(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Verificar permiso de acceso (solo ADMIN y SUPER_ADMIN)
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "No tiene permiso para editar la configuración" },
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
    
    // Validar datos
    const validatedData = toolsSettingsSchema.parse(body)

    // Verificar si existe configuración
    const { data: existing } = await supabase
      .from("tools_settings")
      .select("id")
      .eq("agency_id", agencyIds[0])
      .single()

    const updateData = {
      ...validatedData,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    }

    let result

    if (existing) {
      // Actualizar existente
      const existingData = existing as any
      const { data, error } = await (supabase.from("tools_settings") as any)
        .update(updateData)
        .eq("id", existingData.id)
        .select()
        .single()

      if (error) {
        console.error("Error updating tools settings:", error)
        return NextResponse.json(
          { error: "Error al actualizar configuración" },
          { status: 500 }
        )
      }

      result = data
    } else {
      // Crear nueva
      const { data, error } = await (supabase.from("tools_settings") as any)
        .insert({
          agency_id: agencyIds[0],
          ...updateData,
          created_by: user.id,
        })
        .select()
        .single()

      if (error) {
        console.error("Error creating tools settings:", error)
        return NextResponse.json(
          { error: "Error al crear configuración" },
          { status: 500 }
        )
      }

      result = data
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("Error in PUT /api/tools/settings:", error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error.message || "Error al actualizar configuración" },
      { status: 500 }
    )
  }
}
