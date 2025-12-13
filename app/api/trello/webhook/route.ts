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
  const startTime = Date.now()
  let cardId: string | null = null
  let boardId: string | null = null
  
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
        console.warn(`⚠️ Rate limit exceeded for IP: ${ip}`)
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
      console.error("❌ Error parsing webhook body:", error)
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }

    // Extract card ID early for logging
    // CRÍTICO: Para createCard, el cardId puede estar en action.data.card.id o action.data.card.shortLink
    // También puede estar en webhook.model.id si el modelo es una card
    // Para deleteCard, puede estar en action.data.card.id, action.data.cardId, o action.data.old.id
    cardId = webhook.action?.data?.card?.id || 
             webhook.action?.data?.card?.shortLink ||
             webhook.action?.data?.cardId || // Algunos webhooks lo envían aquí
             webhook.action?.data?.old?.id || // Para deleteCard, puede estar en old.id
             webhook.model?.id || 
             null
    
    // Extract board ID from multiple possible locations
    boardId = webhook.model?.idBoard || 
              webhook.action?.data?.board?.id || 
              webhook.action?.data?.board?.shortLink ||
              webhook.action?.data?.list?.idBoard ||
              webhook.action?.data?.card?.idBoard ||
              webhook.action?.data?.card?.board?.id ||
              null

    console.log("📥 ========== TRELLO WEBHOOK RECEIVED ==========")
    console.log("📋 Action Type:", webhook.action?.type || "N/A")
    console.log("📋 Model Type:", webhook.model?.type || "N/A")
    console.log("🆔 Card ID:", cardId || "N/A")
    console.log("🆔 Board ID:", boardId || "N/A")
    console.log("📦 Full payload keys:", {
      action: webhook.action ? Object.keys(webhook.action) : null,
      model: webhook.model ? Object.keys(webhook.model) : null,
      actionData: webhook.action?.data ? Object.keys(webhook.action.data) : null,
    })

    // Get the action type
    const actionType = webhook.action?.type
    const modelType = webhook.model?.type || webhook.action?.data?.card?.type

    // Log action details
    console.log("🔍 Processing action:", actionType)
    console.log("🔍 Model type:", modelType)

    // Only process card-related actions
    // Para createCard, el card puede estar en action.data.card
    // Para otros eventos, puede estar en webhook.model
    const hasCard = webhook.action?.data?.card !== undefined || 
                    modelType === "card" || 
                    webhook.action?.type?.includes("Card") ||
                    webhook.action?.type === "createCard"
    
    // Si no hay card ID pero la acción es relacionada con cards, intentar obtenerlo de la card
    if (!cardId && hasCard && webhook.action?.data?.card) {
      cardId = webhook.action.data.card.id || webhook.action.data.card.shortLink
    }
    
    if (!hasCard && !cardId) {
      console.log("⏭️ Skipping non-card action (no card data found)")
      return NextResponse.json({ received: true, skipped: true, reason: "Not a card action" })
    }

    if (!cardId) {
      console.log("⏭️ No card ID found in webhook")
      console.log("📦 Webhook structure:", JSON.stringify({
        actionType: webhook.action?.type,
        modelType: modelType,
        hasActionDataCard: !!webhook.action?.data?.card,
        actionDataKeys: webhook.action?.data ? Object.keys(webhook.action.data) : [],
        modelKeys: webhook.model ? Object.keys(webhook.model) : [],
      }, null, 2))
      return NextResponse.json({ received: true, skipped: true, reason: "No card ID" })
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
    if (!boardId) {
      boardId = webhook.model?.idBoard || 
                webhook.action?.data?.board?.id || 
                webhook.action?.data?.list?.idBoard ||
                webhook.action?.data?.card?.idBoard ||
                webhook.model?.id ||
                null
    }
    
    console.log("🔍 Looking for board:", boardId, "in", allSettings.length, "settings")
    console.log("📋 Available board IDs in settings:", allSettings.map((s: any) => s.board_id))
    
    // Helper function to normalize board IDs (Trello can use short or long IDs)
    const normalizeBoardId = (id: string): string => {
      if (!id) return ""
      // Trello IDs can be in different formats, try to normalize
      return id.trim()
    }
    
    // Helper function to check if two board IDs match (handles short/long ID variations)
    const boardIdsMatch = (id1: string, id2: string): boolean => {
      if (!id1 || !id2) return false
      // Exact match
      if (id1 === id2) return true
      // Check if one is contained in the other (for short/long ID variations)
      if (id1.includes(id2) || id2.includes(id1)) return true
      // Check first 8 characters (common short ID length)
      if (id1.length >= 8 && id2.length >= 8) {
        if (id1.substring(0, 8) === id2.substring(0, 8)) return true
      }
      return false
    }
    
    // Try exact match first
    let settings = (allSettings as any[]).find((s) => boardIdsMatch(s.board_id, boardId || ""))
    
    // If not found, try to fetch the board info from Trello to get the full ID
    if (!settings && boardId) {
      console.log("🔍 Board not found with exact match, trying to fetch board info from Trello:", boardId)
      try {
        // Try with ALL available settings to fetch the board (to get full ID)
        for (const testSettings of allSettings as any[]) {
          if (testSettings?.trello_api_key && testSettings?.trello_token) {
            try {
              const boardResponse = await fetch(
                `https://api.trello.com/1/boards/${boardId}?key=${testSettings.trello_api_key}&token=${testSettings.trello_token}&fields=id,shortLink`
              )
              if (boardResponse.ok) {
                const boardData = await boardResponse.json()
                const fullBoardId = boardData.id
                const shortLink = boardData.shortLink
                console.log("✅ Fetched board info:", { fullBoardId, shortLink, originalId: boardId })
                
                // Now try to match with the full ID
                settings = (allSettings as any[]).find((s) => 
                  boardIdsMatch(s.board_id, fullBoardId) || 
                  boardIdsMatch(s.board_id, shortLink) ||
                  (boardId ? boardIdsMatch(s.board_id, boardId) : false)
                )
                if (settings) {
                  console.log("✅ Found matching settings using fetched board info")
                  break
                }
              }
            } catch (fetchError: any) {
              // Continue to next settings
              console.log("⚠️ Could not fetch board with these settings:", fetchError.message)
              continue
            }
          }
        }
      } catch (error) {
        console.error("❌ Error fetching board info:", error)
      }
    }

    // If still not found, try to fetch the card and get its board ID
    if (!settings && cardId) {
      console.log("🔍 Board still not found, fetching card to get board ID:", cardId)
      try {
        // Try with ALL available settings to fetch the card (maybe the card is from a different board)
        for (const testSettings of allSettings as any[]) {
          if (testSettings?.trello_api_key && testSettings?.trello_token) {
            try {
              const cardResponse = await fetch(
                `https://api.trello.com/1/cards/${cardId}?key=${testSettings.trello_api_key}&token=${testSettings.trello_token}&fields=idBoard,idBoardShort`
              )
              if (cardResponse.ok) {
                const cardData = await cardResponse.json()
                const cardBoardId = cardData.idBoard
                const cardBoardShort = cardData.idBoardShort
                console.log("✅ Found board ID from card:", { cardBoardId, cardBoardShort, originalBoardId: boardId })
                
                // Now find settings for this board
                settings = (allSettings as any[]).find((s) => 
                  boardIdsMatch(s.board_id, cardBoardId) || 
                  boardIdsMatch(s.board_id, cardBoardShort) ||
                  boardIdsMatch(s.board_id, boardId || "")
                )
                if (settings) {
                  console.log("✅ Found matching settings for board from card data")
                  break
                }
              }
            } catch (fetchError: any) {
              // Continue to next settings
              console.log("⚠️ Could not fetch card with these settings:", fetchError.message)
              continue
            }
          }
        }
      } catch (error) {
        console.error("❌ Error fetching card:", error)
      }
    }

    if (!settings) {
      // This is not a fatal error - just log it and skip
      // The webhook might be from a board that's not configured in our system
      console.warn("⚠️ No settings found for board:", boardId)
      console.warn("⚠️ Available boards:", allSettings.map((s: any) => s.board_id))
      console.warn("⚠️ This webhook will be ignored (board not configured)")
      // Return 200 to prevent Trello from retrying
      return NextResponse.json({ 
        received: true, 
        skipped: true, 
        reason: "Board not configured in system", 
        boardId, 
        availableBoards: allSettings.map((s: any) => s.board_id) 
      })
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
    // IMPORTANTE: Procesar TODOS los eventos relacionados con cards
    // CRÍTICO: Incluir todas las variaciones de creación de cards
    const cardActions = [
      "createCard",
      "addCardToBoard", // Variante de createCard
      "copyCard", // Cuando se copia una card
      "updateCard",
      "moveCardFromList",
      "moveCardToList",
      "updateCard:closed",
      "updateCard:name",
      "updateCard:desc",
      "addMemberToCard",
      "removeMemberFromCard",
      "addAttachmentToCard",
      "addLabelToCard",
      "removeLabelFromCard",
      "updateCheckItemStateOnCard", // Cambios en checklists
      "addChecklistToCard",
      "removeChecklistFromCard",
    ]

    if (cardActions.includes(actionType || "")) {
      // Sync the card
      try {
        console.log("🔄 Syncing card:", cardId, "for action:", actionType)
        
        // MEJORADO: Usar retry logic (fetchTrelloCard ya tiene retry integrado)
        const card = await fetchTrelloCard(
          cardId, 
          trelloSettings.trello_api_key, 
          trelloSettings.trello_token
        )
        
        if (card) {
          console.log("✅ Card fetched successfully:", card.name)
          console.log("📋 Card details:", {
            id: card.id,
            name: card.name,
            listId: card.idList,
            members: card.idMembers?.length || 0,
            labels: card.labels?.length || 0,
          })
          
          const result = await syncTrelloCardToLead(card, trelloSettings, supabase)
          const duration = Date.now() - startTime
          console.log("✅ Card synced successfully:", {
            created: result.created,
            leadId: result.leadId,
            duration: `${duration}ms`,
          })
          console.log("📥 ========== WEBHOOK PROCESSED SUCCESSFULLY ==========")
          
          return NextResponse.json({ 
            received: true, 
            synced: true, 
            cardId, 
            created: result.created, 
            leadId: result.leadId,
            action: actionType,
            duration: `${duration}ms`,
          })
        } else {
          console.log("⚠️ Card not found or deleted in Trello")
          // Return 200 to prevent Trello from retrying
          return NextResponse.json({ received: true, skipped: true, reason: "Card not found in Trello" })
        }
      } catch (error: any) {
        const duration = Date.now() - startTime
        console.error("❌ Error syncing card:", {
          error: error.message,
          stack: error.stack,
          cardId,
          action: actionType,
          duration: `${duration}ms`,
        })
        
        // MEJORADO: Mensajes de error más específicos
        let errorMessage = error.message || "Error desconocido"
        if (error.message?.includes("429") || error.message?.includes("Rate limit")) {
          errorMessage = "Rate limit de Trello API. El webhook será procesado más tarde."
        } else if (error.message?.includes("401") || error.message?.includes("Invalid")) {
          errorMessage = "Credenciales de Trello inválidas. Verifica la configuración."
        }
        
        // Return 200 to prevent Trello from retrying failed webhooks
        // Log the error but don't fail the webhook
        return NextResponse.json({ 
          received: true,
          error: "Error syncing card", 
          message: errorMessage,
          cardId,
          action: actionType,
        })
      }
    } else if (actionType === "deleteCard") {
      // Delete the lead
      // MEJORADO: Para deleteCard, intentar obtener cardId de múltiples ubicaciones
      let deleteCardId = cardId || 
                        webhook.action?.data?.card?.id ||
                        webhook.action?.data?.cardId ||
                        webhook.action?.data?.old?.id ||
                        webhook.model?.id ||
                        null
      
      if (!deleteCardId) {
        console.warn("⚠️ deleteCard received but no cardId found in webhook")
        console.log("📦 Webhook structure for deleteCard:", JSON.stringify({
          actionType: webhook.action?.type,
          actionData: webhook.action?.data,
          model: webhook.model,
        }, null, 2))
        return NextResponse.json({ received: true, skipped: true, reason: "No cardId found in deleteCard webhook" })
      }
      
      try {
        console.log("🗑️ Deleting lead for card:", deleteCardId)
        const deleted = await deleteLeadByExternalId(deleteCardId, supabase)
        const duration = Date.now() - startTime
        if (deleted) {
          console.log("✅ Lead deleted successfully:", deleteCardId, `(${duration}ms)`)
        } else {
          console.log("⚠️ Lead not found or already deleted:", deleteCardId, `(${duration}ms)`)
        }
        return NextResponse.json({ received: true, deleted: deleted, cardId: deleteCardId })
      } catch (error: any) {
        console.error("❌ Error deleting lead:", error)
        // Return 200 to prevent Trello from retrying
        return NextResponse.json({ received: true, error: "Error deleting lead", message: error.message, cardId: deleteCardId })
      }
    } else {
      // Log ignored actions for debugging
      console.log("⏭️ Ignoring action type:", actionType)
      return NextResponse.json({ received: true, skipped: true, actionType, reason: "Action type not processed" })
    }
  } catch (error: any) {
    const duration = Date.now() - startTime
    console.error("❌ ========== WEBHOOK ERROR ==========")
    console.error("❌ Error:", error.message)
    console.error("❌ Stack:", error.stack)
    console.error("❌ Card ID:", cardId)
    console.error("❌ Board ID:", boardId)
    console.error("❌ Duration:", `${duration}ms`)
    console.error("❌ ====================================")
    // Always return 200 to prevent Trello from marking webhook as failed
    // This allows us to log errors without breaking the webhook
    return NextResponse.json({ 
      received: true,
      error: "Error processing webhook", 
      message: error.message,
      cardId,
      boardId,
    })
  }
}

// Trello webhooks need to verify the endpoint with a HEAD request
// This is called by Trello to verify the webhook URL is valid
export async function HEAD(request: Request) {
  console.log("✅ Trello HEAD request received - endpoint verified")
  return new NextResponse(null, { status: 200 })
}

