import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { z } from "zod"

export const dynamic = 'force-dynamic'

// Schema de validación
const createTeamSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  description: z.string().optional(),
  color: z.string().optional().default('#6366f1'),
  leader_id: z.string().uuid().optional().nullable(),
  member_ids: z.array(z.string().uuid()).optional().default([]),
})

// GET - Obtener equipos
export async function GET() {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Query - simplificada sin FK names
    const { data: teams, error } = await (supabase.from("teams") as any)
      .select(`
        *,
        members:team_members (
          id,
          user_id,
          role,
          joined_at
        )
      `)
      .in("agency_id", agencyIds)
      .eq("is_active", true)
      .order("name", { ascending: true })

    if (error) {
      console.error("Error fetching teams:", error)
      return NextResponse.json(
        { error: "Error al obtener equipos" },
        { status: 500 }
      )
    }

    // Calcular estadísticas de cada equipo
    const teamsWithStats = teams.map((team: any) => ({
      ...team,
      member_count: team.members?.length || 0,
    }))

    return NextResponse.json({ teams: teamsWithStats })
  } catch (error: any) {
    console.error("Error in GET /api/teams:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener equipos" },
      { status: 500 }
    )
  }
}

// POST - Crear equipo
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Verificar permisos
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: "No tiene permiso para crear equipos" },
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
    const validatedData = createTeamSchema.parse(body)

    // Crear equipo
    const { data: team, error } = await (supabase.from("teams") as any)
      .insert({
        agency_id: agencyIds[0],
        name: validatedData.name,
        description: validatedData.description,
        color: validatedData.color,
        leader_id: validatedData.leader_id,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating team:", error)
      return NextResponse.json(
        { error: "Error al crear equipo" },
        { status: 500 }
      )
    }

    // Agregar miembros si se proporcionaron
    if (validatedData.member_ids.length > 0) {
      const memberships = validatedData.member_ids.map(userId => ({
        team_id: team.id,
        user_id: userId,
        role: userId === validatedData.leader_id ? 'leader' : 'member',
      }))

      await (supabase.from("team_members") as any).insert(memberships)
    }

    // Si hay líder y no está en la lista de miembros, agregarlo
    if (validatedData.leader_id && !validatedData.member_ids.includes(validatedData.leader_id)) {
      await (supabase.from("team_members") as any).insert({
        team_id: team.id,
        user_id: validatedData.leader_id,
        role: 'leader',
      })
    }

    return NextResponse.json({ team })
  } catch (error: any) {
    console.error("Error in POST /api/teams:", error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error.message || "Error al crear equipo" },
      { status: 500 }
    )
  }
}
