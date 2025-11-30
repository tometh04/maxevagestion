import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)
    const agencyId = searchParams.get("agencyId")

    if (!agencyId) {
      return NextResponse.json({ error: "Falta agencyId" }, { status: 400 })
    }

    // Get Trello settings
    const { data: trelloSettings } = await supabase
      .from("settings_trello")
      .select("*")
      .eq("agency_id", agencyId)
      .single()

    if (!trelloSettings) {
      return NextResponse.json({ lists: [] })
    }

    // Get lists from Trello - obtener SOLO las listas activas (no archivadas)
    const settings = trelloSettings as any
    const response = await fetch(
      `https://api.trello.com/1/boards/${settings.board_id}/lists?key=${settings.trello_api_key}&token=${settings.trello_token}&filter=open`
    )

    if (!response.ok) {
      return NextResponse.json({ lists: [] })
    }

    const lists = await response.json()

    // Filtrar solo listas activas (closed: false) por si acaso
    const activeLists = lists.filter((list: any) => !list.closed)

    // Trello ya devuelve las listas en el orden visual correcto
    // Solo necesitamos ordenar por posición (pos) para asegurar el orden exacto
    const sortedLists = activeLists.sort((a: any, b: any) => {
      const posA = a.pos || 0
      const posB = b.pos || 0
      // Ordenar por posición numérica
      return posA - posB
    })

    return NextResponse.json({ lists: sortedLists })
  } catch (error) {
    return NextResponse.json({ lists: [] })
  }
}

