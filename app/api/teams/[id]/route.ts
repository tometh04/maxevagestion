import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { z } from "zod"

export const dynamic = 'force-dynamic'

// Schema de validación
const updateTeamSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  color: z.string().optional(),
  leader_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().optional(),
})

// GET - Obtener equipo por ID
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

    // Obtener equipo con miembros y metas - simplificada
    const { data: team, error } = await (supabase.from("teams") as any)
      .select(`
        *,
        members:team_members (
          id,
          user_id,
          role,
          joined_at
        ),
        goals:team_goals (
          id,
          period_type,
          period_start,
          period_end,
          target_operations,
          target_revenue,
          current_operations,
          current_revenue,
          status
        )
      `)
      .eq("id", id)
      .in("agency_id", agencyIds)
      .single()

    if (error || !team) {
      return NextResponse.json(
        { error: "Equipo no encontrado" },
        { status: 404 }
      )
    }

    return NextResponse.json({ team })
  } catch (error: any) {
    console.error("Error in GET /api/teams/[id]:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener equipo" },
      { status: 500 }
    )
  }
}

// PUT - Actualizar equipo
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

    // Verificar que el equipo existe y el usuario tiene permiso
    const { data: existing, error: fetchError } = await (supabase.from("teams") as any)
      .select("id, leader_id")
      .eq("id", id)
      .in("agency_id", agencyIds)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Equipo no encontrado" },
        { status: 404 }
      )
    }

    // Verificar permisos (admin o líder del equipo)
    const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'
    const isLeader = existing.leader_id === user.id

    if (!isAdmin && !isLeader) {
      return NextResponse.json(
        { error: "No tiene permiso para editar este equipo" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const validatedData = updateTeamSchema.parse(body)

    // Actualizar equipo
    const { data: team, error } = await (supabase.from("teams") as any)
      .update(validatedData)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("Error updating team:", error)
      return NextResponse.json(
        { error: "Error al actualizar equipo" },
        { status: 500 }
      )
    }

    return NextResponse.json({ team })
  } catch (error: any) {
    console.error("Error in PUT /api/teams/[id]:", error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error.message || "Error al actualizar equipo" },
      { status: 500 }
    )
  }
}

// DELETE - Eliminar equipo (soft delete)
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
        { error: "No tiene permiso para eliminar equipos" },
        { status: 403 }
      )
    }

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Soft delete
    const { error } = await (supabase.from("teams") as any)
      .update({ is_active: false })
      .eq("id", id)
      .in("agency_id", agencyIds)

    if (error) {
      console.error("Error deleting team:", error)
      return NextResponse.json(
        { error: "Error al eliminar equipo" },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error in DELETE /api/teams/[id]:", error)
    return NextResponse.json(
      { error: error.message || "Error al eliminar equipo" },
      { status: 500 }
    )
  }
}
