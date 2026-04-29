import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { normalizeDestinationName, toTitleCase, findBestMatch } from "@/lib/destination-utils"

/**
 * GET /api/destinations?q=punta
 * Search destinations with fuzzy matching
 */
export async function GET(request: Request) {
  try {
    await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    const query = searchParams.get("q") || ""

    let dbQuery = (supabase.from("destinations") as any)
      .select("id, name, name_normalized, country")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(50)

    if (query.length > 0) {
      dbQuery = dbQuery.ilike("name", `%${query}%`)
    }

    const { data: destinations, error } = await dbQuery

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ destinations: destinations || [] })
  } catch (error: any) {
    return NextResponse.json({ error: "Error al buscar destinos" }, { status: 500 })
  }
}

/**
 * POST /api/destinations
 * Create a new destination (normalizes automatically)
 */
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const body = await request.json()
    const { name, country } = body

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 })
    }

    const normalized = normalizeDestinationName(name)
    const titleCased = toTitleCase(name)

    // Check if already exists (fuzzy)
    const { data: existing } = await (supabase.from("destinations") as any)
      .select("id, name, name_normalized")
      .eq("is_active", true)

    if (existing && existing.length > 0) {
      const match = findBestMatch(normalized, existing)
      if (match) {
        return NextResponse.json({ destination: match, existed: true })
      }
    }

    // Create new
    const { data: newDest, error } = await (supabase.from("destinations") as any)
      .insert({
        name: titleCased,
        name_normalized: normalized,
        country: country || null,
      })
      .select("id, name")
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ destination: newDest, existed: false })
  } catch (error: any) {
    return NextResponse.json({ error: "Error al crear destino" }, { status: 500 })
  }
}
