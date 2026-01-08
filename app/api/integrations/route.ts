import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { z } from "zod"

export const dynamic = 'force-dynamic'

// Schema de validación
const createIntegrationSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  integration_type: z.enum([
    'trello', 'manychat', 'whatsapp', 'afip', 'email', 
    'calendar', 'slack', 'webhook', 'zapier', 'other'
  ]),
  description: z.string().optional(),
  config: z.record(z.any()).optional().default({}),
  sync_enabled: z.boolean().optional().default(false),
  sync_frequency: z.enum(['realtime', 'hourly', 'daily', 'weekly', 'manual']).optional(),
  permissions: z.record(z.boolean()).optional().default({}),
  webhook_url: z.string().url().optional().nullable(),
})

// GET - Obtener integraciones
export async function GET() {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Query
    const { data: integrations, error } = await (supabase.from("integrations") as any)
      .select(`*`)
      .in("agency_id", agencyIds)
      .order("name", { ascending: true })

    if (error) {
      console.error("Error fetching integrations:", error)
      return NextResponse.json(
        { error: "Error al obtener integraciones" },
        { status: 500 }
      )
    }

    // Contar por tipo y estado
    const stats = {
      total: integrations?.length || 0,
      active: integrations?.filter((i: any) => i.status === 'active').length || 0,
      inactive: integrations?.filter((i: any) => i.status === 'inactive').length || 0,
      error: integrations?.filter((i: any) => i.status === 'error').length || 0,
    }

    return NextResponse.json({ integrations, stats })
  } catch (error: any) {
    console.error("Error in GET /api/integrations:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener integraciones" },
      { status: 500 }
    )
  }
}

// POST - Crear integración
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Verificar permisos
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: "No tiene permiso para crear integraciones" },
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
    const validatedData = createIntegrationSchema.parse(body)

    // Generar webhook secret si se proporciona webhook_url
    const webhookSecret = validatedData.webhook_url 
      ? crypto.randomUUID().replace(/-/g, '')
      : null

    // Crear integración
    const { data: integration, error } = await (supabase.from("integrations") as any)
      .insert({
        agency_id: agencyIds[0],
        ...validatedData,
        webhook_secret: webhookSecret,
        status: 'inactive', // Inicialmente inactiva hasta que se configure
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating integration:", error)
      return NextResponse.json(
        { error: "Error al crear integración" },
        { status: 500 }
      )
    }

    // Crear log inicial
    await (supabase.from("integration_logs") as any).insert({
      integration_id: integration.id,
      log_type: 'info',
      action: 'create',
      message: `Integración "${validatedData.name}" creada`,
      details: { type: validatedData.integration_type },
    })

    return NextResponse.json({ integration })
  } catch (error: any) {
    console.error("Error in POST /api/integrations:", error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error.message || "Error al crear integración" },
      { status: 500 }
    )
  }
}
