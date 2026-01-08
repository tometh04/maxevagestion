import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export const dynamic = 'force-dynamic'

// GET - Obtener usuarios de las agencias del usuario actual
export async function GET(request: Request) {
  try {
    // Obtener usuario actual
    let user: any
    try {
      const currentUserResult = await getCurrentUser()
      user = currentUserResult.user
    } catch (authError: any) {
      console.error("Auth error:", authError)
      return NextResponse.json(
        { error: "No autenticado", users: [] },
        { status: 401 }
      )
    }

    if (!user || !user.id) {
      return NextResponse.json({ users: [] })
    }

    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Obtener agencias del usuario directamente (sin caché)
    const { data: directAgencies, error: agencyError } = await (supabase.from("user_agencies") as any)
      .select("agency_id")
      .eq("user_id", user.id)

    if (agencyError) {
      console.error("Error getting user agencies:", agencyError)
    }

    const agencyIds = (directAgencies || []).map((ua: any) => ua.agency_id)

    // Si no hay agencias, retornar vacío
    if (!agencyIds || agencyIds.length === 0) {
      return NextResponse.json({ users: [] })
    }

    // Parámetros de filtro
    const role = searchParams.get("role")
    const search = searchParams.get("search")
    const excludeUserId = searchParams.get("exclude")

    // Obtener IDs de usuarios de las agencias
    const { data: userAgencies, error: userAgenciesError } = await (supabase.from("user_agencies") as any)
      .select("user_id")
      .in("agency_id", agencyIds)

    if (userAgenciesError) {
      console.error("Error fetching user_agencies:", userAgenciesError)
      return NextResponse.json({ users: [] })
    }

    const allUserIds = (userAgencies || []).map((ua: any) => ua.user_id)
    const userIds = Array.from(new Set(allUserIds)) as string[]

    if (userIds.length === 0) {
      return NextResponse.json({ users: [] })
    }

    // Query de usuarios
    let query = (supabase.from("users") as any)
      .select(`
        id,
        first_name,
        last_name,
        email,
        avatar_url,
        role,
        phone,
        created_at
      `)
      .in("id", userIds)
      .order("first_name", { ascending: true })

    // Filtros
    if (role) {
      query = query.eq("role", role)
    }
    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`)
    }
    if (excludeUserId) {
      query = query.neq("id", excludeUserId)
    }

    const { data: users, error } = await query

    if (error) {
      console.error("Error fetching users:", error)
      return NextResponse.json(
        { error: "Error al obtener usuarios" },
        { status: 500 }
      )
    }

    return NextResponse.json({ users: users || [] })
  } catch (error: any) {
    console.error("Error in GET /api/users:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener usuarios" },
      { status: 500 }
    )
  }
}
