import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { z } from "zod"

export const dynamic = 'force-dynamic'

// Schema de validación para actualizar
const updateIntegrationSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  config: z.record(z.any()).optional(),
  status: z.enum(['active', 'inactive', 'error', 'pending']).optional(),
  sync_enabled: z.boolean().optional(),
  sync_frequency: z.enum(['realtime', 'hourly', 'daily', 'weekly', 'manual']).optional(),
  permissions: z.record(z.boolean()).optional(),
  webhook_url: z.string().url().optional().nullable(),
})

// GET - Obtener integración por ID
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

    // Obtener integración
    const { data: integration, error } = await (supabase.from("integrations") as any)
      .select(`*`)
      .eq("id", id)
      .in("agency_id", agencyIds)
      .single()

    if (error || !integration) {
      return NextResponse.json(
        { error: "Integración no encontrada" },
        { status: 404 }
      )
    }

    // Obtener últimos logs
    const { data: logs } = await (supabase.from("integration_logs") as any)
      .select(`*`)
      .eq("integration_id", id)
      .order("created_at", { ascending: false })
      .limit(50)

    return NextResponse.json({ integration, logs: logs || [] })
  } catch (error: any) {
    console.error("Error in GET /api/integrations/[id]:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener integración" },
      { status: 500 }
    )
  }
}

// PUT - Actualizar integración
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Verificar permisos
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: "No tiene permiso para editar integraciones" },
        { status: 403 }
      )
    }

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Verificar que la integración existe
    const { data: existing, error: fetchError } = await (supabase.from("integrations") as any)
      .select("id, name, status")
      .eq("id", id)
      .in("agency_id", agencyIds)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Integración no encontrada" },
        { status: 404 }
      )
    }

    const body = await request.json()
    const validatedData = updateIntegrationSchema.parse(body)

    // Actualizar integración
    const { data: integration, error } = await (supabase.from("integrations") as any)
      .update(validatedData)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("Error updating integration:", error)
      return NextResponse.json(
        { error: "Error al actualizar integración" },
        { status: 500 }
      )
    }

    // Crear log de actualización
    await (supabase.from("integration_logs") as any).insert({
      integration_id: id,
      log_type: 'info',
      action: 'update',
      message: `Integración "${existing.name}" actualizada`,
      details: { changes: Object.keys(validatedData) },
    })

    return NextResponse.json({ integration })
  } catch (error: any) {
    console.error("Error in PUT /api/integrations/[id]:", error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error.message || "Error al actualizar integración" },
      { status: 500 }
    )
  }
}

// DELETE - Eliminar integración
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Verificar permisos
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: "No tiene permiso para eliminar integraciones" },
        { status: 403 }
      )
    }

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Hard delete (también elimina logs por CASCADE)
    const { error } = await (supabase.from("integrations") as any)
      .delete()
      .eq("id", id)
      .in("agency_id", agencyIds)

    if (error) {
      console.error("Error deleting integration:", error)
      return NextResponse.json(
        { error: "Error al eliminar integración" },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error in DELETE /api/integrations/[id]:", error)
    return NextResponse.json(
      { error: error.message || "Error al eliminar integración" },
      { status: 500 }
    )
  }
}
