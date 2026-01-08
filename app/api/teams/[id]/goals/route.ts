import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getUserAgencyIds } from "@/lib/permissions-api"
import { z } from "zod"

export const dynamic = 'force-dynamic'

// Schema de validación
const createGoalSchema = z.object({
  period_type: z.enum(['monthly', 'quarterly', 'yearly', 'custom']),
  period_start: z.string(),
  period_end: z.string(),
  target_operations: z.number().optional(),
  target_revenue: z.number().optional(),
  target_margin: z.number().optional(),
  target_new_customers: z.number().optional(),
  notes: z.string().optional(),
})

// GET - Obtener metas del equipo
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: teamId } = await params
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Verificar acceso al equipo
    const { data: team } = await (supabase.from("teams") as any)
      .select("id")
      .eq("id", teamId)
      .in("agency_id", agencyIds)
      .single()

    if (!team) {
      return NextResponse.json(
        { error: "Equipo no encontrado" },
        { status: 404 }
      )
    }

    // Parámetros de filtro
    const status = searchParams.get("status") || "active"

    // Query
    let query = (supabase.from("team_goals") as any)
      .select(`
        *,
        created_by_user:users!team_goals_created_by_fkey (id, first_name, last_name)
      `)
      .eq("team_id", teamId)
      .order("period_start", { ascending: false })

    if (status !== "ALL") {
      query = query.eq("status", status)
    }

    const { data: goals, error } = await query

    if (error) {
      console.error("Error fetching goals:", error)
      return NextResponse.json(
        { error: "Error al obtener metas" },
        { status: 500 }
      )
    }

    // Calcular porcentajes de progreso
    const goalsWithProgress = goals.map((goal: any) => {
      const operationsProgress = goal.target_operations 
        ? Math.round((goal.current_operations / goal.target_operations) * 100) 
        : null
      const revenueProgress = goal.target_revenue 
        ? Math.round((goal.current_revenue / goal.target_revenue) * 100) 
        : null

      return {
        ...goal,
        operations_progress: operationsProgress,
        revenue_progress: revenueProgress,
      }
    })

    return NextResponse.json({ goals: goalsWithProgress })
  } catch (error: any) {
    console.error("Error in GET /api/teams/[id]/goals:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener metas" },
      { status: 500 }
    )
  }
}

// POST - Crear meta para el equipo
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: teamId } = await params
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    // Obtener agencias del usuario
    const agencyIds = await getUserAgencyIds(supabase, user.id, user.role as any)

    // Verificar acceso al equipo y permisos
    const { data: team } = await (supabase.from("teams") as any)
      .select("id, leader_id")
      .eq("id", teamId)
      .in("agency_id", agencyIds)
      .single()

    if (!team) {
      return NextResponse.json(
        { error: "Equipo no encontrado" },
        { status: 404 }
      )
    }

    // Verificar permisos (admin o líder)
    const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'
    const isLeader = team.leader_id === user.id

    if (!isAdmin && !isLeader) {
      return NextResponse.json(
        { error: "No tiene permiso para crear metas en este equipo" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const validatedData = createGoalSchema.parse(body)

    // Crear meta
    const { data: goal, error } = await (supabase.from("team_goals") as any)
      .insert({
        team_id: teamId,
        ...validatedData,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating goal:", error)
      return NextResponse.json(
        { error: "Error al crear meta" },
        { status: 500 }
      )
    }

    return NextResponse.json({ goal })
  } catch (error: any) {
    console.error("Error in POST /api/teams/[id]/goals:", error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: error.message || "Error al crear meta" },
      { status: 500 }
    )
  }
}
