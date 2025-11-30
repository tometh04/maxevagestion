import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { syncTrelloCardToLead, fetchTrelloCard } from "@/lib/trello/sync"

/**
 * Sincronizar una tarjeta específica de Trello
 * Útil para sincronización manual o cuando el webhook falla
 */
export async function POST(request: Request) {
  try {
    const { user } = await getCurrentUser()
    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const supabase = await createServerClient()
    const body = await request.json()
    const { cardId, agencyId } = body

    if (!cardId || !agencyId) {
      return NextResponse.json({ error: "Faltan cardId o agencyId" }, { status: 400 })
    }

    // Get Trello settings
    const { data: trelloSettings } = await supabase
      .from("settings_trello")
      .select("*")
      .eq("agency_id", agencyId)
      .single()

    if (!trelloSettings) {
      return NextResponse.json({ error: "No hay configuración de Trello para esta agencia" }, { status: 400 })
    }

    const settings = trelloSettings as any

    const trelloSettingsObj = {
      agency_id: settings.agency_id,
      trello_api_key: settings.trello_api_key,
      trello_token: settings.trello_token,
      board_id: settings.board_id,
      list_status_mapping: settings.list_status_mapping || {},
      list_region_mapping: settings.list_region_mapping || {},
    }

    // Fetch and sync the card
    const card = await fetchTrelloCard(cardId, trelloSettingsObj.trello_api_key, trelloSettingsObj.trello_token)
    
    if (!card) {
      return NextResponse.json({ error: "Tarjeta no encontrada en Trello" }, { status: 404 })
    }

    const result = await syncTrelloCardToLead(card, trelloSettingsObj, supabase)

    return NextResponse.json({
      success: true,
      created: result.created,
      leadId: result.leadId,
      cardName: card.name,
    })
  } catch (error: any) {
    console.error("Error syncing Trello card:", error)
    return NextResponse.json({ error: "Error al sincronizar tarjeta", message: error.message }, { status: 500 })
  }
}

