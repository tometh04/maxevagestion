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
      return NextResponse.json({ users: [], debug: "Error getting agencies" })
    }

    const agencyIds = (userAgenciesData || []).map((ua: any) => ua.agency_id)

    // Si no hay agencias, retornar vacío
    if (!agencyIds || agencyIds.length === 0) {
      return NextResponse.json({ users: [], debug: "No agencies found" })
    }

    // Obtener IDs de usuarios de las agencias
    const { data: allUserAgencies, error: userAgenciesError } = await (supabase.from("user_agencies") as any)
      .select("user_id")
      .in("agency_id", agencyIds)

    if (userAgenciesError) {
      console.error("Error fetching user_agencies:", userAgenciesError)
      return NextResponse.json({ users: [], debug: "Error fetching user_agencies" })
    }

    const allUserIds = (allUserAgencies || []).map((ua: any) => ua.user_id)
    const userIds = Array.from(new Set(allUserIds)) as string[]

    if (userIds.length === 0) {
      return NextResponse.json({ users: [], debug: "No users in agencies" })
    }

    // Query de usuarios simplificada
    let query = (supabase.from("users") as any)
      .select("id, first_name, last_name, email, avatar_url, role, phone, created_at")
      .in("id", userIds)

    // Filtros opcionales
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
        { error: "Error al obtener usuarios", debug: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ users: users || [] })
  } catch (error: any) {
    console.error("Error in GET /api/users:", error)
    return NextResponse.json(
      { error: error.message || "Error al obtener usuarios", debug: "catch block" },
      { status: 500 }
    )
  }
}
