import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCachedAgencies, revalidateTag, CACHE_TAGS } from "@/lib/cache"

/**
 * GET /api/agencies
 * Lista todas las agencias (con caché de 1 hora)
 */
export async function GET() {
  try {
    const agencies = await getCachedAgencies(async () => {
      const supabase = await createServerClient()

      // Obtener todas las agencias directamente
      const { data, error } = await supabase
        .from("agencies")
        .select("id, name")
        .order("name")

      if (error) {
        console.error("❌ Error fetching agencies:", error.message, error.details)
        // Devolver array vacío en lugar de error para no bloquear el UI
        return []
      }

      console.log("✅ Agencies loaded:", data?.length || 0)
      return data || []
    })

    return NextResponse.json({ agencies })
  } catch (error: any) {
    console.error("❌ Exception in GET agencies:", error)
    return NextResponse.json({ agencies: [], error: error.message })
  }
}
