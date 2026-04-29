import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { syncTrelloCardToLead, fetchTrelloCard } from "@/lib/trello/sync"

/**
 * Endpoint de test para verificar que la integración de Trello funciona
 * 
 * Uso:
 * POST /api/trello/webhook/test
 * Body: { cardId: "trello_card_id", agencyId: "agency_id" }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { cardId, agencyId } = body

    if (!cardId) {
      return NextResponse.json({ error: "cardId is required" }, { status: 400 })
    }

    const supabase = await createServerClient()

    // Get Trello settings
    let settingsQuery = supabase.from("settings_trello").select("*")
    if (agencyId) {
      settingsQuery = settingsQuery.eq("agency_id", agencyId)
    }

    const { data: allSettings, error: settingsError } = await settingsQuery

    if (settingsError || !allSettings || allSettings.length === 0) {
      return NextResponse.json({ 
        error: "No Trello settings found",
        details: settingsError?.message 
      }, { status: 400 })
    }

    const results = []

    // Try with each agency's settings
    for (const setting of allSettings as any[]) {
      try {
        // Fetch card
        const card = await fetchTrelloCard(
          cardId,
          setting.trello_api_key,
          setting.trello_token
        )

        if (!card) {
          results.push({
            agency_id: setting.agency_id,
            board_id: setting.board_id,
            success: false,
            error: "Card not found in Trello",
          })
          continue
        }

        // Sync card
        const trelloSettings = {
          agency_id: setting.agency_id,
          trello_api_key: setting.trello_api_key,
          trello_token: setting.trello_token,
          board_id: setting.board_id,
          list_status_mapping: setting.list_status_mapping || {},
          list_region_mapping: setting.list_region_mapping || {},
        }

        const result = await syncTrelloCardToLead(card, trelloSettings, supabase)

        results.push({
          agency_id: setting.agency_id,
          board_id: setting.board_id,
          success: true,
          created: result.created,
          leadId: result.leadId,
          cardName: card.name,
        })
      } catch (error: any) {
        results.push({
          agency_id: setting.agency_id,
          board_id: setting.board_id,
          success: false,
          error: error.message,
        })
      }
    }

    return NextResponse.json({
      success: true,
      cardId,
      results,
    })
  } catch (error: any) {
    console.error("❌ Test error:", error)
    return NextResponse.json(
      { error: "Test failed", message: error.message },
      { status: 500 }
    )
  }
}

