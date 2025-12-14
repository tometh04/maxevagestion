import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { fetchTrelloCard, syncTrelloCardToLead } from "@/lib/trello/sync"

/**
 * Sincronización rápida de Trello (< 10 segundos)
 * Solo sincroniza tarjetas modificadas recientemente (últimos 5-10 minutos)
 * Procesa en paralelo con límite de concurrencia
 */
export async function POST(request: Request) {
  const startTime = Date.now()
  const MAX_TIME_MS = 8000 // 8 segundos máximo
  const RECENT_MINUTES = 10 // Últimos 10 minutos
  
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

    const settings = trelloSettings as any
    
    // Calcular fecha límite (últimos 10 minutos)
    const cutoffDate = new Date()
    cutoffDate.setMinutes(cutoffDate.getMinutes() - RECENT_MINUTES)

    console.log(`⚡ Iniciando sincronización rápida (últimos ${RECENT_MINUTES} minutos)`)

    // Obtener todas las tarjetas del board (solo IDs y fecha de última actividad)
    const cardsResponse = await fetch(
      `https://api.trello.com/1/boards/${settings.board_id}/cards/open?key=${settings.trello_api_key}&token=${settings.trello_token}&fields=id,name,dateLastActivity,idList`
    )

    if (!cardsResponse.ok) {
      return NextResponse.json({ error: "Error al obtener tarjetas de Trello" }, { status: 400 })
    }

    let allCards = await cardsResponse.json()
    
    // Filtrar solo tarjetas modificadas recientemente
    const recentCards = allCards.filter((card: any) => {
      if (!card.dateLastActivity) return false
      const cardDate = new Date(card.dateLastActivity)
      return cardDate >= cutoffDate
    })

    // Limitar a máximo 50 tarjetas para asegurar que termine rápido
    const cardsToSync = recentCards.slice(0, 50)
    
    console.log(`📊 Tarjetas a sincronizar: ${cardsToSync.length} de ${allCards.length} totales (últimos ${RECENT_MINUTES} min)`)

    if (cardsToSync.length === 0) {
      return NextResponse.json({
        success: true,
        quick: true,
        summary: {
          total: 0,
          created: 0,
          updated: 0,
          deleted: 0,
          errors: 0,
          timeElapsed: `${Date.now() - startTime}ms`,
        },
      })
    }

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

    // Procesar en paralelo con límite de concurrencia
    const CONCURRENT_LIMIT = 5 // Procesar 5 tarjetas en paralelo
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

    // Función para sincronizar una tarjeta
    const syncCard = async (card: any): Promise<{ success: boolean; created?: boolean; deleted?: boolean }> => {
      try {
        // Verificar timeout
        if (Date.now() - startTime > MAX_TIME_MS) {
          return { success: false }
        }

        const fullCard = await fetchTrelloCard(
          card.id,
          trelloSettingsForSync.trello_api_key,
          trelloSettingsForSync.trello_token
        )

        if (!fullCard) {
          // Card eliminada, eliminar lead
          const { error } = await (supabase.from("leads") as any)
            .delete()
            .eq("external_id", card.id)
            .eq("source", "Trello")
          
          if (!error) {
            deleted++
            return { success: true, deleted: true }
          }
          return { success: false }
        }

        // Si la card está archivada, eliminar lead
        if (fullCard.closed) {
          const { error } = await (supabase.from("leads") as any)
            .delete()
            .eq("external_id", card.id)
            .eq("source", "Trello")
          
          if (!error) {
            deleted++
            return { success: true, deleted: true }
          }
          return { success: false }
        }

        // Sincronizar card
        const result = await syncTrelloCardToLead(fullCard, trelloSettingsForSync, supabase)
        return { success: true, created: result.created }
      } catch (error: any) {
        console.error(`❌ Error sincronizando tarjeta ${card.id}:`, error.message)
        return { success: false }
      }
    }

    // Procesar en batches paralelos
    for (let i = 0; i < cardsToSync.length; i += CONCURRENT_LIMIT) {
      // Verificar timeout antes de cada batch
      if (Date.now() - startTime > MAX_TIME_MS) {
        console.log(`⏱️ Timeout alcanzado, deteniendo sincronización. Procesadas: ${synced}/${cardsToSync.length}`)
        break
      }

      const batch = cardsToSync.slice(i, i + CONCURRENT_LIMIT)
      const results = await Promise.all(batch.map(syncCard))

      // Contar resultados
      for (const result of results) {
        if (result.success) {
          synced++
          if (result.created) {
            created++
          } else if (result.deleted) {
            // Ya contado en syncCard
          } else {
            updated++
          }
        } else {
          errors++
        }
      }
    }

    // Actualizar checkpoint de última sincronización
    const now = new Date().toISOString()
    await (supabase.from("settings_trello") as any)
      .update({ last_sync_at: now })
      .eq("agency_id", agencyId)

    const timeElapsed = Date.now() - startTime

    console.log(`✅ Sincronización rápida completada en ${timeElapsed}ms: ${synced} tarjetas (${created} nuevas, ${updated} actualizadas, ${deleted} eliminadas)`)

    return NextResponse.json({
      success: true,
      quick: true,
      summary: {
        total: synced,
        created,
        updated,
        deleted,
        errors,
        timeElapsed: `${timeElapsed}ms`,
        cardsProcessed: synced,
        cardsTotal: cardsToSync.length,
      },
    })
  } catch (error: any) {
    const timeElapsed = Date.now() - startTime
    console.error("❌ Error en sincronización rápida:", error)
    return NextResponse.json({ 
      error: "Error al sincronizar", 
      message: error.message,
      timeElapsed: `${timeElapsed}ms`,
    }, { status: 500 })
  }
}

