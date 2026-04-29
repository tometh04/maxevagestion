import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { fetchTrelloCard, syncTrelloCardToLead } from "@/lib/trello/sync"

// Aumentar timeout para sincronizaciones largas (5 minutos)
// NOTA: En Vercel, el máximo es 60s para Hobby, 300s para Pro
export const maxDuration = 300
export const runtime = 'nodejs' // Asegurar que use Node.js runtime

export async function POST(request: Request) {
  const startTime = Date.now()
  try {
    const { user } = await getCurrentUser()
    const supabase = await createServerClient()
    const body = await request.json()
    const { agencyId, forceFullSync = false } = body

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

    const settings = trelloSettings as any
    const lastSyncAt = settings.last_sync_at
    const isIncrementalSync = !forceFullSync && lastSyncAt

    // Obtener solo tarjetas activas (no archivadas) con idList para saber en qué lista están
    // Para sincronización incremental, obtenemos todas las cards pero filtraremos por dateLastActivity
    const cardsUrl = `https://api.trello.com/1/boards/${settings.board_id}/cards/open?key=${settings.trello_api_key}&token=${settings.trello_token}&fields=id,name,dateLastActivity,idList`

    const cardsResponse = await fetch(cardsUrl, {
      signal: AbortSignal.timeout(30000) // Timeout de 30s para obtener cards
    })

    if (!cardsResponse.ok) {
      const errorText = await cardsResponse.text()
      console.error(`[Trello Sync] Error obteniendo cards: ${cardsResponse.status} - ${errorText}`)
      return NextResponse.json({ 
        error: `Error al obtener tarjetas de Trello: ${cardsResponse.status}` 
      }, { status: 400 })
    }

    let allCards = await cardsResponse.json()

    // Obtener solo listas activas (no archivadas) del board para validación y limpieza
    const listsResponse = await fetch(
      `https://api.trello.com/1/boards/${settings.board_id}/lists?key=${settings.trello_api_key}&token=${settings.trello_token}&filter=open&fields=id,name`,
      {
        signal: AbortSignal.timeout(30000) // Timeout de 30s
      }
    )
    
    let allLists: any[] = []
    if (listsResponse.ok) {
      allLists = await listsResponse.json()
      // Actualizar mapeo de listas si hay nuevas
      const activeLists = allLists // Ya vienen solo las activas con filter=open
      const listStatusMapping: Record<string, string> = settings.list_status_mapping || {}
      const listRegionMapping: Record<string, string> = settings.list_region_mapping || {}
      
      // Agregar nuevas listas al mapeo si no existen
      let mappingUpdated = false
      for (const list of activeLists) {
        if (!listStatusMapping[list.id]) {
          // Auto-mapear según nombre de lista
          const listName = list.name.toLowerCase()
          if (listName.includes("nuevo") || listName.includes("new") || listName.includes("pendiente")) {
            listStatusMapping[list.id] = "NEW"
          } else if (listName.includes("progreso") || listName.includes("progress") || listName.includes("trabajando")) {
            listStatusMapping[list.id] = "IN_PROGRESS"
          } else if (listName.includes("cotizado") || listName.includes("quoted") || listName.includes("presupuesto")) {
            listStatusMapping[list.id] = "QUOTED"
          } else if (listName.includes("ganado") || listName.includes("won") || listName.includes("cerrado")) {
            listStatusMapping[list.id] = "WON"
          } else if (listName.includes("perdido") || listName.includes("lost") || listName.includes("cancelado")) {
            listStatusMapping[list.id] = "LOST"
          } else {
            listStatusMapping[list.id] = "NEW" // Por defecto
          }
          mappingUpdated = true
        }
      }
      
      if (mappingUpdated) {
        await (supabase.from("settings_trello") as any)
          .update({
            list_status_mapping: listStatusMapping,
            list_region_mapping: listRegionMapping,
          })
          .eq("agency_id", agencyId)
      }
    }
    
    // Filtrar cards para sincronización incremental
    if (isIncrementalSync) {
      const lastSyncDate = new Date(lastSyncAt)
      allCards = allCards.filter((card: any) => {
        if (!card.dateLastActivity) return true // Si no tiene fecha, sincronizar por seguridad
        const cardDate = new Date(card.dateLastActivity)
        return cardDate >= lastSyncDate
      })
      // Re-fetch para obtener el total (ya que filtramos allCards)
      const totalCardsResponse = await fetch(cardsUrl)
      const totalCards = await totalCardsResponse.ok ? await totalCardsResponse.json() : []
    }

    const cards = allCards
    
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
    let deleted = 0
    let errors = 0
    let rateLimited = 0
    let orphanedDeleted = 0

    // Helper para hacer delay
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

    // MEJORADO: fetchTrelloCard ya tiene retry logic integrado, pero manejamos errores aquí
    const fetchCardWithRetry = async (cardId: string, retries = 2): Promise<any> => {
      // fetchTrelloCard ya tiene retry logic interno (3 intentos), 
      // pero si falla completamente, podemos reintentar una vez más aquí
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
            const waitTime = Math.min(2000 * Math.pow(2, attempt), 30000) // Max 30 segundos
            await delay(waitTime)
            continue
          }
          // Si no es rate limit y es el último intento, lanzar el error
          if (attempt === retries - 1) {
            throw error
          }
          // Esperar un poco antes de reintentar
          await delay(1000 * (attempt + 1))
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
      
      // Log cada 50 cards para tracking
      try {
        // Fetch full card details with ALL information (con retry)
        const fullCard = await fetchCardWithRetry(card.id)

        if (!fullCard) {
          // Card eliminada o no existe, eliminar lead (solo de esta agencia)
          const { error: deleteError } = await (supabase.from("leads") as any)
            .delete()
            .eq("external_id", card.id)
            .eq("source", "Trello")
            .eq("agency_id", agencyId) // CRÍTICO: Solo de esta agencia
          
          if (!deleteError) {
            deleted++
          }
          continue
        }

        // Si la card está archivada (no debería pasar porque filtramos por open, pero por seguridad)
        if (fullCard.closed) {
          const { error: deleteError } = await (supabase.from("leads") as any)
            .delete()
            .eq("external_id", fullCard.id)
            .eq("source", "Trello")
            .eq("agency_id", agencyId) // CRÍTICO: Solo de esta agencia
          
          if (!deleteError) {
            deleted++
          }
          continue
        }

        // CRÍTICO: Verificar que la card tenga idList antes de sincronizar
        // Cada card DEBE estar asociada a una lista
        if (!fullCard.idList && !fullCard.list?.id) {
          console.error(`⚠️ Card sin idList, saltando: ${fullCard.id} - ${fullCard.name}`)
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
        // Delay entre cards para evitar rate limits
        if (i < cards.length - 1) {
          await delay(DELAY_BETWEEN_CARDS)
        }

        // Delay más largo entre batches
        if ((i + 1) % BATCH_SIZE === 0 && i < cards.length - 1) {
          await delay(DELAY_BETWEEN_BATCHES)
        }
      } catch (error: any) {
        console.error(`❌ Error sincronizando tarjeta ${card.id}:`, error.message)
        errors++
        // Si hay muchos rate limits seguidos, esperar más
        if (rateLimited > 5 && rateLimited % 5 === 0) {
          await delay(5000)
        }
      }
    }

    // MEJORADO: Limpieza de leads huérfanos (solo en sincronización completa)
    if (forceFullSync) {
      // 1. Eliminar leads de listas que ya no existen o están archivadas
      // allLists ya contiene solo listas activas (filter=open)
      const activeListIds = new Set(allLists.map((list: any) => list.id))
      if (activeListIds.size > 0) {
        // Obtener todos los leads de Trello con trello_list_id (SOLO de esta agencia)
        const { data: allTrelloLeadsWithList } = await (supabase.from("leads") as any)
          .select("id, trello_list_id")
          .eq("source", "Trello")
          .eq("agency_id", agencyId) // CRÍTICO: Solo leads de esta agencia
          .not("trello_list_id", "is", null)
        
        // Filtrar los que no están en listas activas
        const orphanedByList = allTrelloLeadsWithList?.filter((lead: any) => !activeListIds.has(lead.trello_list_id)) || []
        
        if (orphanedByList.length > 0) {
          const orphanedIds = orphanedByList.map((l: any) => l.id)
          if (orphanedIds.length > 0) {
            await (supabase.from("leads") as any)
              .delete()
              .in("id", orphanedIds)
            orphanedDeleted += orphanedIds.length
          }
        }
      }

      // 2. Eliminar leads con external_id que no existe en Trello (solo para la agencia actual)
      const trelloCardIds = new Set(allCards.map((c: any) => c.id))
      const { data: allTrelloLeads } = await (supabase.from("leads") as any)
        .select("id, external_id, trello_list_id")
        .eq("source", "Trello")
        .eq("agency_id", agencyId) // IMPORTANTE: Solo leads de esta agencia
        .not("external_id", "is", null)
      
      if (allTrelloLeads) {
        const orphanedByCard = allTrelloLeads.filter((lead: any) => !trelloCardIds.has(lead.external_id))
        if (orphanedByCard.length > 0) {
          const orphanedIds = orphanedByCard.map((l: any) => l.id)
          await (supabase.from("leads") as any)
            .delete()
            .in("id", orphanedIds)
          orphanedDeleted += orphanedIds.length
        }
      }

    }

    // Actualizar checkpoint de última sincronización solo si fue exitosa
    if (synced > 0 || errors === 0) {
      const now = new Date().toISOString()
      const { error: updateError } = await (supabase.from("settings_trello") as any)
        .update({ last_sync_at: now })
        .eq("agency_id", agencyId)

      if (updateError) {
        console.error("⚠️ Error actualizando last_sync_at:", updateError)
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        total: synced,
        created,
        updated,
        deleted,
        orphanedDeleted,
        errors,
        rateLimited,
        totalCards: cards.length, // Total de cards que se intentaron sincronizar
        incremental: isIncrementalSync,
        lastSyncAt: isIncrementalSync ? lastSyncAt : null,
      },
    })
  } catch (error: any) {
    const elapsed = Date.now() - startTime
    console.error(`[Trello Sync] Error después de ${Math.floor(elapsed/1000)}s:`, error)
    
    // Detectar si es timeout
    if (error.name === 'AbortError' || error.message?.includes('timeout') || error.message?.includes('TIMEOUT')) {
      return NextResponse.json({ 
        error: "La sincronización tardó demasiado. Intenta con menos cards o contacta al administrador.",
        timeout: true
      }, { status: 504 })
    }
    
    return NextResponse.json({ 
      error: error.message || "Error al sincronizar",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined
    }, { status: 500 })
  }
}

