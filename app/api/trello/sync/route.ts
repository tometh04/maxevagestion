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
    let rateLimited = 0

    // Helper para hacer delay
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

    // Helper para retry con backoff exponencial
    const fetchCardWithRetry = async (cardId: string, retries = 3): Promise<any> => {
      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          const fullCard = await fetchTrelloCard(
            cardId,
            trelloSettingsForSync.trello_api_key,
            trelloSettingsForSync.trello_token
          )
          return fullCard
        } catch (error: any) {
          // Si es rate limit, esperar más tiempo
          if (error.message?.includes("429") || error.message?.includes("Rate limit") || error.message?.includes("Too Many Requests")) {
            rateLimited++
            const waitTime = Math.min(1000 * Math.pow(2, attempt), 10000) // Max 10 segundos
            console.log(`⚠️ Rate limit detectado para card ${cardId}, esperando ${waitTime}ms antes de reintentar...`)
            await delay(waitTime)
            continue
          }
          // Si no es rate limit y es el último intento, lanzar el error
          if (attempt === retries - 1) {
            throw error
          }
          // Esperar un poco antes de reintentar
          await delay(500 * (attempt + 1))
        }
      }
      return null
    }

    // Sync each card using the proper function that fetches ALL information
    // Procesar en batches para evitar rate limits
    const BATCH_SIZE = 10
    const DELAY_BETWEEN_CARDS = 100 // 100ms entre cada card
    const DELAY_BETWEEN_BATCHES = 2000 // 2 segundos entre batches

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i]
      
      try {
        // Fetch full card details with ALL information (con retry)
        const fullCard = await fetchCardWithRetry(card.id)

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

        // Log progress every 25 cards
        if (synced % 25 === 0) {
          console.log(`📊 Progreso: ${synced}/${cards.length} tarjetas procesadas (${created} nuevas, ${updated} actualizadas, ${errors} errores, ${rateLimited} rate limits)`)
        }

        // Delay entre cards para evitar rate limits
        if (i < cards.length - 1) {
          await delay(DELAY_BETWEEN_CARDS)
        }

        // Delay más largo entre batches
        if ((i + 1) % BATCH_SIZE === 0 && i < cards.length - 1) {
          console.log(`⏸️ Pausa de ${DELAY_BETWEEN_BATCHES}ms después de procesar batch de ${BATCH_SIZE} tarjetas...`)
          await delay(DELAY_BETWEEN_BATCHES)
        }
      } catch (error: any) {
        console.error(`❌ Error sincronizando tarjeta ${card.id}:`, error.message)
        errors++
        // Si hay muchos rate limits seguidos, esperar más
        if (rateLimited > 5 && rateLimited % 5 === 0) {
          console.log(`⚠️ Muchos rate limits detectados, esperando 5 segundos antes de continuar...`)
          await delay(5000)
        }
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        total: synced,
        created,
        updated,
        errors,
        rateLimited,
        totalCards: cards.length,
      },
    })
  } catch (error) {
    console.error("Trello sync error:", error)
    return NextResponse.json({ error: "Error al sincronizar" }, { status: 500 })
  }
}

