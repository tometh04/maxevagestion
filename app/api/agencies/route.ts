import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

/**
 * GET /api/agencies
 * Lista todas las agencias
 */
export async function GET() {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    let query = supabase.from("agencies").select("id, name, address, phone, email").order("name")

    // Si no es SUPER_ADMIN, solo mostrar las agencias del usuario
    if (user.role !== "SUPER_ADMIN") {
      const { data: userAgencies } = await supabase
        .from("user_agencies")
        .select("agency_id")
        .eq("user_id", user.id)

      const agencyIds = (userAgencies || []).map((ua: any) => ua.agency_id)
      
      if (agencyIds.length > 0) {
        query = query.in("id", agencyIds)
      } else {
        // No tiene agencias asignadas
        return NextResponse.json({ agencies: [] })
      }
    }

    const { data: agencies, error } = await query

    if (error) {
      console.error("Error fetching agencies:", error)
      return NextResponse.json({ error: "Error al obtener agencias" }, { status: 500 })
    }

    return NextResponse.json({ agencies: agencies || [] })
  } catch (error: any) {
    console.error("Error in GET agencies:", error)
    return NextResponse.json({ error: error.message || "Error al obtener agencias" }, { status: 500 })
  }
}

