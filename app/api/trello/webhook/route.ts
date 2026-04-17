import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { syncTrelloCardToLead, fetchTrelloCard, deleteLeadByExternalId } from "@/lib/trello/sync"
import { withRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit"
import crypto from "crypto"

/**
 * Verify Trello webhook signature.
 * Trello manda HMAC-SHA1(body, secret) base64 en el header x-trello-webhook.
 *
 * Seguridad: en producción NO se permite skippear la verificación.
 * Antes, si `secret` era falsy la función devolvía `true` y aceptaba
 * cualquier webhook — potencial vector de impersonation.
 */
function verifyTrelloWebhook(body: string, signature: string, secret: string): boolean {
  if (!secret) {
    // En development puede que todavía no se haya configurado el secret;
    // solo entonces toleramos la ausencia.
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[trello-webhook] TRELLO_WEBHOOK_SECRET no configurado en prod — rechazo por seguridad"
      )
      return false
    }
    return true
  }

  // timingSafeEqual para evitar timing attacks al comparar HMAC
  const expected = crypto.createHmac("sha1", secret).update(body).digest("base64")
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
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

    // Get the action type
    const actionType = webhook.action?.type
    const modelType = webhook.model?.type || webhook.action?.data?.card?.type

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
      return NextResponse.json({ received: true, skipped: true, reason: "Not a card action" })
    }

    if (!cardId) {
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
                // Now try to match with the full ID
                settings = (allSettings as any[]).find((s) => 
                  boardIdsMatch(s.board_id, fullBoardId) || 
                  boardIdsMatch(s.board_id, shortLink) ||
                  (boardId ? boardIdsMatch(s.board_id, boardId) : false)
                )
                if (settings) {
                  break
                }
              }
            } catch (fetchError: any) {
              // Continue to next settings
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
                // Now find settings for this board
                settings = (allSettings as any[]).find((s) => 
                  boardIdsMatch(s.board_id, cardBoardId) || 
                  boardIdsMatch(s.board_id, cardBoardShort) ||
                  boardIdsMatch(s.board_id, boardId || "")
                )
                if (settings) {
                  break
                }
              }
            } catch (fetchError: any) {
              // Continue to next settings
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

    // NUEVO: Procesar eventos de listas
    const listActions = [
      "updateList",
      "createList",
      "updateList:closed",
      "updateList:name",
    ]

    // Si es un evento de card archivada, eliminar el lead
    let processedActionType = actionType
    if (actionType === "updateCard:closed") {
      const isClosed = webhook.action?.data?.card?.closed || webhook.action?.data?.old?.closed === false
      if (isClosed) {
        // Card fue archivada, eliminar lead
        try {
          const deleted = await deleteLeadByExternalId(cardId || "", supabase)
          const duration = Date.now() - startTime
          return NextResponse.json({ received: true, deleted: deleted, cardId, action: actionType })
        } catch (error: any) {
          console.error("❌ Error deleting lead (archived card):", error)
          return NextResponse.json({ received: true, error: "Error deleting lead", message: error.message, cardId })
        }
      } else {
        // Card fue desarchivada, sincronizar como update normal
        processedActionType = "updateCard"
      }
    }

    // Si es un evento de lista archivada/eliminada, eliminar leads de esa lista
    if (listActions.includes(actionType || "")) {
      const listId = webhook.action?.data?.list?.id || webhook.model?.id || null
      const isListClosed = webhook.action?.data?.list?.closed || webhook.action?.data?.old?.closed === false
      
      if (isListClosed && listId) {
        try {
          // Eliminar todos los leads de esta lista
          const { error } = await (supabase.from("leads") as any)
            .delete()
            .eq("trello_list_id", listId)
            .eq("source", "Trello")
          
          if (error) {
            console.error("❌ Error deleting leads from archived list:", error)
          } else {
          }
          
          // Actualizar mapeo de listas si es necesario
          // (Las listas archivadas ya no aparecerán en /api/trello/lists porque filtramos por closed=false)
          
          return NextResponse.json({ received: true, listId, action: actionType, deleted: true })
        } catch (error: any) {
          console.error("❌ Error processing list action:", error)
          return NextResponse.json({ received: true, error: "Error processing list", message: error.message })
        }
      } else if (actionType === "createList") {
        // Nueva lista creada - no hacer nada, se actualizará en la próxima sincronización
        return NextResponse.json({ received: true, listId, action: actionType })
      }
    }

    if (cardActions.includes(processedActionType || "")) {
      // Sync the card
      try {
        // MEJORADO: Usar retry logic (fetchTrelloCard ya tiene retry integrado)
        const card = await fetchTrelloCard(
          cardId, 
          trelloSettings.trello_api_key, 
          trelloSettings.trello_token
        )
        
        if (card) {
          // Si la card está archivada, eliminar el lead
          if (card.closed) {
            const deleted = await deleteLeadByExternalId(cardId, supabase)
            return NextResponse.json({ received: true, deleted: deleted, cardId, action: actionType })
          }
          
          const result = await syncTrelloCardToLead(card, trelloSettings, supabase)
          const duration = Date.now() - startTime
          return NextResponse.json({ 
            received: true, 
            synced: true, 
            cardId, 
            created: result.created, 
            leadId: result.leadId,
            action: processedActionType,
            duration: `${duration}ms`,
          })
        } else {
          // Si la card no existe, eliminar el lead
          if (cardId) {
            await deleteLeadByExternalId(cardId, supabase)
          }
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
        return NextResponse.json({ received: true, skipped: true, reason: "No cardId found in deleteCard webhook" })
      }
      
      try {
        const deleted = await deleteLeadByExternalId(deleteCardId, supabase)
        const duration = Date.now() - startTime
        return NextResponse.json({ received: true, deleted: deleted, cardId: deleteCardId })
      } catch (error: any) {
        console.error("❌ Error deleting lead:", error)
        // Return 200 to prevent Trello from retrying
        return NextResponse.json({ received: true, error: "Error deleting lead", message: error.message, cardId: deleteCardId })
      }
    } else {
      // Log ignored actions for debugging
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
  return new NextResponse(null, { status: 200 })
}

