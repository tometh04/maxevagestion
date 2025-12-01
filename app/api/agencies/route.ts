import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"

/**
 * GET /api/agencies
 * Lista todas las agencias
 */
export async function GET() {
  try {
    const supabase = await createServerClient()

    // Obtener todas las agencias directamente
    const { data: agencies, error } = await supabase
      .from("agencies")
      .select("id, name")
      .order("name")

    if (error) {
      console.error("❌ Error fetching agencies:", error.message, error.details)
      // Devolver array vacío en lugar de error para no bloquear el UI
      return NextResponse.json({ agencies: [], error: error.message })
    }

    console.log("✅ Agencies loaded:", agencies?.length || 0)
    return NextResponse.json({ agencies: agencies || [] })
  } catch (error: any) {
    console.error("❌ Exception in GET agencies:", error)
    return NextResponse.json({ agencies: [], error: error.message })
  }
}
