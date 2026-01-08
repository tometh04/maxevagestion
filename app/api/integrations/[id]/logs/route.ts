import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"

export const dynamic = 'force-dynamic'

// GET - Obtener logs de una integración
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Verificar acceso a la integración
    const { data: integration, error: intError } = await (supabase.from("integrations") as any)
      .select("id")
      .eq("id", id)
      .in("agency_id", agencyIds)
      .single()

    if (intError || !integration) {
      return NextResponse.json(
        { error: "Integración no encontrada" },
        { status: 404 }
      )
    }

    // Parámetros de filtro
    const logType = searchParams.get("type")
    const action = searchParams.get("action")
    const limit = parseInt(searchParams.get("limit") || "100", 10)
    const offset = parseInt(searchParams.get("offset") || "0", 10)

    // Query base
    let query = (supabase.from("integration_logs") as any)
      .select(`*`)
      .eq("integration_id", id)
      .order("created_at", { ascending: false })

    // Filtros
    if (logType) {
      query = query.eq("log_type", logType)
    }
    if (action) {
      query = query.eq("action", action)
    }

    // Paginación
    query = query.range(offset, offset + limit - 1)

    const { data: logs, error } = await query

    if (error) {
      console.error("Error fetching logs:", error)
      return NextResponse.json(
        { error: "Error al obtener logs" },
        { status: 500 }
      )
    }

    // Estadísticas de logs
    const { data: stats } = await (supabase.from("integration_logs") as any)
      .select("log_type")
      .eq("integration_id", id)

    const statsByType: Record<string, number> = {
      info: 0,
      success: 0,
      warning: 0,
      error: 0,
      debug: 0,
    }

    ;(stats || []).forEach((s: any) => {
      if (statsByType[s.log_type] !== undefined) {
        statsByType[s.log_type]++
      }
    })

    return NextResponse.json({ 
      logs, 
      stats: {
        total: stats?.length || 0,
        byType: statsByType,
      }
    })
  } catch (error: any) {
    console.error("Error in GET /api/integrations/[id]/logs:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener logs" },
      { status: 500 }
    )
  }
}

// DELETE - Limpiar logs antiguos
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Verificar permisos
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: "No tiene permiso para limpiar logs" },
        { status: 403 }
      )
    }

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Verificar acceso a la integración
    const { data: integration, error: intError } = await (supabase.from("integrations") as any)
      .select("id")
      .eq("id", id)
      .in("agency_id", agencyIds)
      .single()

    if (intError || !integration) {
      return NextResponse.json(
        { error: "Integración no encontrada" },
        { status: 404 }
      )
    }

    // Días a mantener (por defecto 30)
    const daysToKeep = parseInt(searchParams.get("days") || "30", 10)
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)

    // Eliminar logs antiguos
    const { error } = await (supabase.from("integration_logs") as any)
      .delete()
      .eq("integration_id", id)
      .lt("created_at", cutoffDate.toISOString())

    if (error) {
      console.error("Error cleaning logs:", error)
      return NextResponse.json(
        { error: "Error al limpiar logs" },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      success: true, 
      message: `Logs anteriores a ${daysToKeep} días eliminados` 
    })
  } catch (error: any) {
    console.error("Error in DELETE /api/integrations/[id]/logs:", error)
    return NextResponse.json(
      { error: error.message || "Error al limpiar logs" },
      { status: 500 }
    )
  }
}
