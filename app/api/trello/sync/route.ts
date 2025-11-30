import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { fetchTrelloCard, syncTrelloCardToLead } from "@/lib/trello/sync"

export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const body = await request.json()
    const { agencyId } = body

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
      return NextResponse.json({ error: "No hay configuración de Trello" }, { status: 400 })
    }

    // Get all cards from board (basic info first, then fetch full details)
    const settings = trelloSettings as any
    const cardsResponse = await fetch(
      `https://api.trello.com/1/boards/${settings.board_id}/cards?key=${settings.trello_api_key}&token=${settings.trello_token}&fields=id,name`
    )

    if (!cardsResponse.ok) {
      return NextResponse.json({ error: "Error al obtener tarjetas de Trello" }, { status: 400 })
    }

    const cards = await cardsResponse.json()
    
    const trelloSettingsForSync = {
      agency_id: agencyId,
      trello_api_key: settings.trello_api_key,
      trello_token: settings.trello_token,
      board_id: settings.board_id,
      list_status_mapping: settings.list_status_mapping || {},
      list_region_mapping: settings.list_region_mapping || {},
    }

    let synced = 0
    let created = 0
    let updated = 0
    let errors = 0

    // Sync each card using the proper function that fetches ALL information
    for (const card of cards) {
      try {
        // Fetch full card details with ALL information
        const fullCard = await fetchTrelloCard(
          card.id,
          trelloSettingsForSync.trello_api_key,
          trelloSettingsForSync.trello_token
        )

        if (!fullCard) {
          console.error(`Card ${card.id} not found or deleted`)
          errors++
          continue
        }

        // Sync using the proper function that handles everything correctly
        const result = await syncTrelloCardToLead(fullCard, trelloSettingsForSync, supabase)
        
        if (result.created) {
          created++
        } else {
          updated++
        }
        synced++

        // Log progress every 50 cards
        if (synced % 50 === 0) {
          console.log(`Procesadas ${synced}/${cards.length} tarjetas...`)
        }
      } catch (error: any) {
        console.error(`Error sincronizando tarjeta ${card.id}:`, error.message)
        errors++
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        total: synced,
        created,
        updated,
        errors,
      },
    })
  } catch (error) {
    console.error("Trello sync error:", error)
    return NextResponse.json({ error: "Error al sincronizar" }, { status: 500 })
  }
}

