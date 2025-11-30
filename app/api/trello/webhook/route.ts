import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { syncTrelloCardToLead, fetchTrelloCard, deleteLeadByExternalId } from "@/lib/trello/sync"
import { withRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit"
import crypto from "crypto"

/**
 * Verify Trello webhook signature
 * Trello sends a header with the signature
 */
function verifyTrelloWebhook(body: string, signature: string, secret: string): boolean {
  if (!secret) {
    // If no secret configured, skip verification (not recommended for production)
    return true
  }

  const hash = crypto.createHmac("sha1", secret).update(body).digest("base64")
  return hash === signature
}

export async function POST(request: Request) {
  try {
    // Rate limiting: 100 requests por minuto por IP
    // Obtener IP del request
    const forwardedFor = request.headers.get("x-forwarded-for")
    const realIp = request.headers.get("x-real-ip")
    const ip = forwardedFor?.split(",")[0] || realIp || "unknown"

    try {
      withRateLimit(ip, "/api/trello/webhook", RATE_LIMIT_CONFIGS.TRELLO_WEBHOOK)
    } catch (error: any) {
      if (error.statusCode === 429) {
        console.warn(`Rate limit exceeded for IP: ${ip}`)
        return NextResponse.json(
          { error: "Too many requests" },
          {
            status: 429,
            headers: {
              "Retry-After": "60",
            },
          }
        )
      }
      throw error
    }

    const body = await request.text()
    const signature = request.headers.get("x-trello-webhook") || ""

    // Parse the webhook payload
    let webhook: any
    try {
      webhook = JSON.parse(body)
    } catch (error) {
      console.error("Error parsing webhook body:", error)
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }

    console.log("📥 Trello webhook received:", {
      actionType: webhook.action?.type,
      modelType: webhook.model?.type,
      cardId: webhook.action?.data?.card?.id || webhook.model?.id,
    })

    // Get the action type
    const actionType = webhook.action?.type
    const modelType = webhook.model?.type || webhook.action?.data?.card?.type

    // Only process card-related actions
    if (modelType !== "card" && webhook.action?.data?.card === undefined) {
      console.log("⏭️ Skipping non-card action")
      return NextResponse.json({ received: true, skipped: true })
    }

    const cardId = webhook.action?.data?.card?.id || webhook.model?.id

    if (!cardId) {
      console.log("⏭️ No card ID found")
      return NextResponse.json({ received: true, skipped: true })
    }

    // Find which agency this board belongs to
    const supabase = await createServerClient()
    const { data: allSettings } = await supabase.from("settings_trello").select("*")

    if (!allSettings || allSettings.length === 0) {
      console.error("❌ No Trello settings found")
      return NextResponse.json({ error: "No Trello settings found" }, { status: 400 })
    }

    // Find the settings for this board
    // Try to get board ID from different places in the webhook payload
    const boardId = webhook.model?.idBoard || 
                    webhook.action?.data?.board?.id || 
                    webhook.action?.data?.list?.idBoard ||
                    webhook.model?.id
    
    console.log("🔍 Looking for board:", boardId, "in", allSettings.length, "settings")
    
    // Try exact match first
    let settings = (allSettings as any[]).find((s) => s.board_id === boardId)
    
    // If not found, try matching with short ID (first 8 chars)
    if (!settings && boardId) {
      settings = (allSettings as any[]).find((s) => {
        const shortBoardId = boardId.substring(0, 8)
        return s.board_id?.startsWith(shortBoardId) || s.board_id?.includes(shortBoardId)
      })
    }

    if (!settings) {
      console.error("❌ No settings found for board:", boardId, "Available boards:", allSettings.map((s: any) => s.board_id))
      return NextResponse.json({ received: true, skipped: true, reason: "Board not found" })
    }
    
    console.log("✅ Found settings for board:", settings.board_id)

    const trelloSettings = {
      agency_id: settings.agency_id,
      trello_api_key: settings.trello_api_key,
      trello_token: settings.trello_token,
      board_id: settings.board_id,
      list_status_mapping: settings.list_status_mapping || {},
      list_region_mapping: settings.list_region_mapping || {},
    }

    // Process different action types
    switch (actionType) {
      case "createCard":
      case "updateCard":
      case "moveCardFromList":
      case "moveCardToList":
      case "updateCard:closed":
      case "updateCard:name":
      case "updateCard:desc":
        // Sync the card
        try {
          console.log("🔄 Syncing card:", cardId)
          const card = await fetchTrelloCard(cardId, trelloSettings.trello_api_key, trelloSettings.trello_token)
          if (card) {
            console.log("✅ Card fetched:", card.name)
            const result = await syncTrelloCardToLead(card, trelloSettings, supabase)
            console.log("✅ Card synced:", result.created ? "created" : "updated", result.leadId)
            return NextResponse.json({ received: true, synced: true, cardId, created: result.created, leadId: result.leadId })
          } else {
            console.log("⚠️ Card not found or deleted")
            return NextResponse.json({ received: true, skipped: true, reason: "Card not found" })
          }
        } catch (error: any) {
          console.error("❌ Error syncing card:", error)
          return NextResponse.json({ error: "Error syncing card", message: error.message }, { status: 500 })
        }
        break

      case "deleteCard":
        // Delete the lead
        try {
          await deleteLeadByExternalId(cardId, supabase)
          return NextResponse.json({ received: true, deleted: true, cardId })
        } catch (error) {
          console.error("Error deleting lead:", error)
          return NextResponse.json({ error: "Error deleting lead" }, { status: 500 })
        }
        break

      default:
        // Ignore other action types
        return NextResponse.json({ received: true, skipped: true, actionType })
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error("Webhook error:", error)
    return NextResponse.json({ error: "Error processing webhook" }, { status: 500 })
  }
}

// Trello webhooks need to verify the endpoint with a HEAD request
export async function HEAD(request: Request) {
  return NextResponse.json({}, { status: 200 })
}

