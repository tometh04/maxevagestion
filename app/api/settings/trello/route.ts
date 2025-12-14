import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getCachedTrelloConfig, revalidateTag, CACHE_TAGS } from "@/lib/cache"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const agencyId = searchParams.get("agencyId")

    if (!agencyId) {
      return NextResponse.json({ error: "Falta agencyId" }, { status: 400 })
    }

    // Intentar usar caché, pero si falla, obtener directamente
    let result
    try {
      result = await getCachedTrelloConfig(async () => {
        const supabase = await createServerClient()

        const { data: trelloSettings, error } = await supabase
          .from("settings_trello")
          .select("*")
          .eq("agency_id", agencyId)
          .maybeSingle()

        if (error) {
          console.error("Error obteniendo settings de Trello:", error)
          throw new Error(`Error al cargar configuración: ${error.message}`)
        }

        return trelloSettings || null
      })
    } catch (cacheError: any) {
      // Si falla el caché, obtener directamente
      console.warn("Error en caché, obteniendo directamente:", cacheError)
      const supabase = await createServerClient()
      const { data: trelloSettings, error } = await supabase
        .from("settings_trello")
        .select("*")
        .eq("agency_id", agencyId)
        .maybeSingle()

      if (error) {
        console.error("Error obteniendo settings de Trello (directo):", error)
        throw new Error(`Error al cargar configuración: ${error.message}`)
      }

      result = trelloSettings || null
    }

    return NextResponse.json({ settings: result })
  } catch (error: any) {
    console.error("Error en GET /api/settings/trello:", error)
    return NextResponse.json({ 
      error: error.message || "Error al cargar configuración",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined
    }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const body = await request.json()
    const { agencyId, trello_api_key, trello_token, board_id, list_status_mapping, list_region_mapping } = body

    if (!agencyId || !trello_api_key || !trello_token || !board_id) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    // Check if settings exist
    const { data: existing } = await supabase
      .from("settings_trello")
      .select("id")
      .eq("agency_id", agencyId)
      .maybeSingle()

    const settingsData: any = {
      agency_id: agencyId,
      trello_api_key,
      trello_token,
      board_id,
      list_status_mapping: list_status_mapping || {},
      list_region_mapping: list_region_mapping || {},
      updated_at: new Date().toISOString(),
    }

    let result
    if (existing) {
      // Update
      const trelloSettingsTable = supabase.from("settings_trello") as any
      const { data, error } = await trelloSettingsTable
        .update(settingsData)
        .eq("id", (existing as any).id)
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: "Error al actualizar configuración" }, { status: 400 })
      }
      result = data
    } else {
      // Insert
      const { data, error } = await supabase
        .from("settings_trello")
        .insert(settingsData)
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: "Error al crear configuración" }, { status: 400 })
      }
      result = data
    }

    // Invalidar caché de configuración de Trello
    revalidateTag(CACHE_TAGS.TRELLO)

    return NextResponse.json({ success: true, settings: result })
  } catch (error) {
    return NextResponse.json({ error: "Error al guardar configuración" }, { status: 500 })
  }
}

