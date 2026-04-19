import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

/**
 * GET /api/agencies
 * Lista las agencias de la org del usuario autenticado.
 * Multi-tenant: filtra por user.org_id.
 */
export async function GET() {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()

    let query = supabase.from("agencies").select("id, name").order("name")
    if (user.org_id) {
      query = query.eq("org_id", user.org_id)
    }

    const { data, error } = await query

    if (error) {
      console.error("❌ Error fetching agencies:", error.message)
      return NextResponse.json({ agencies: [] })
    }

    return NextResponse.json({ agencies: data || [] })
  } catch (error: any) {
    console.error("❌ Exception in GET agencies:", error)
    return NextResponse.json({ agencies: [], error: error.message })
  }
}
