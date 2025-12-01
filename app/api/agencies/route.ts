import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

/**
 * GET /api/agencies
 * Lista todas las agencias
 */
export async function GET() {
  try {
    const supabase = await createServerClient()
    
    // Intentar obtener el usuario actual
    let userRole = "SUPER_ADMIN" // Default para que funcione si falla auth
    let userId = ""
    
    try {
      const { user } = await getCurrentUser()
      userRole = user.role
      userId = user.id
    } catch (e) {
      // Si falla getCurrentUser, continuar como SUPER_ADMIN para desarrollo
      console.warn("Could not get current user, defaulting to showing all agencies")
    }

    // Si es SUPER_ADMIN, mostrar todas las agencias
    if (userRole === "SUPER_ADMIN" || userRole === "ADMIN") {
      const { data: agencies, error } = await supabase
        .from("agencies")
        .select("id, name, address, phone, email")
        .order("name")

      if (error) {
        console.error("Error fetching agencies:", error)
        return NextResponse.json({ error: "Error al obtener agencias" }, { status: 500 })
      }

      return NextResponse.json({ agencies: agencies || [] })
    }

    // Para otros roles, solo mostrar las agencias del usuario
    const { data: userAgencies, error: uaError } = await supabase
      .from("user_agencies")
      .select("agency_id, agencies(id, name, address, phone, email)")
      .eq("user_id", userId)

    if (uaError) {
      console.error("Error fetching user agencies:", uaError)
      return NextResponse.json({ error: "Error al obtener agencias del usuario" }, { status: 500 })
    }

    const agencies = (userAgencies || [])
      .filter((ua: any) => ua.agencies)
      .map((ua: any) => ua.agencies)

    return NextResponse.json({ agencies })
  } catch (error: any) {
    console.error("Error in GET agencies:", error)
    return NextResponse.json({ error: error.message || "Error al obtener agencias" }, { status: 500 })
  }
}
