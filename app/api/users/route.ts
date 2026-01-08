import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export const dynamic = 'force-dynamic'

// GET - Obtener usuarios de las agencias del usuario actual
export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    // Parámetros de filtro
    const role = searchParams.get("role")
    const search = searchParams.get("search")
    const excludeUserId = searchParams.get("exclude")

    // Obtener agencias del usuario directamente
    const { data: userAgenciesData, error: agencyError } = await (supabase.from("user_agencies") as any)
      .select("agency_id")
      .eq("user_id", user.id)

    if (agencyError) {
      console.error("Error getting user agencies:", agencyError)
      return NextResponse.json({ users: [] })
    }

    const agencyIds = (userAgenciesData || []).map((ua: any) => ua.agency_id)

    // Si no hay agencias, retornar vacío
    if (!agencyIds || agencyIds.length === 0) {
      return NextResponse.json({ users: [] })
    }

    // Obtener IDs de usuarios de las agencias
    const { data: allUserAgencies, error: userAgenciesError } = await (supabase.from("user_agencies") as any)
      .select("user_id")
      .in("agency_id", agencyIds)

    if (userAgenciesError) {
      console.error("Error fetching user_agencies:", userAgenciesError)
      return NextResponse.json({ users: [] })
    }

    const allUserIds = (allUserAgencies || []).map((ua: any) => ua.user_id)
    const userIds = Array.from(new Set(allUserIds)) as string[]

    if (userIds.length === 0) {
      return NextResponse.json({ users: [] })
    }

    // Query de usuarios - columnas reales: id, auth_id, name, email, role, is_active, created_at, updated_at
    let query = (supabase.from("users") as any)
      .select("id, name, email, role, is_active, created_at")
      .in("id", userIds)
      .eq("is_active", true)

    // Filtros opcionales
    if (role) {
      query = query.eq("role", role)
    }
    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`)
    }
    if (excludeUserId) {
      query = query.neq("id", excludeUserId)
    }

    const { data: usersData, error } = await query

    if (error) {
      console.error("Error fetching users:", error)
      return NextResponse.json(
        { error: "Error al obtener usuarios", detail: error.message, code: error.code },
        { status: 500 }
      )
    }
    
    // Transformar los datos para compatibilidad con el frontend
    const users = (usersData || []).map((u: any) => {
      const nameParts = (u.name || '').split(' ')
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        is_active: u.is_active,
        created_at: u.created_at,
        // Campos derivados para compatibilidad
        first_name: nameParts[0] || '',
        last_name: nameParts.slice(1).join(' ') || '',
        avatar_url: null,
        phone: null,
      }
    })

    return NextResponse.json({ users })
  } catch (error: any) {
    console.error("Error in GET /api/users:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener usuarios", stack: error.stack?.slice(0, 200) },
      { status: 500 }
    )
  }
}
