#!/usr/bin/env tsx
/**
 * Script DEFINITIVO para borrar y resincronizar TODOS los leads de Trello
 * Borra todos los leads de Trello de ambas agencias y los vuelve a traer desde cero
 */

import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import { resolve } from "path"
import { fetchTrelloCard, syncTrelloCardToLead } from "../lib/trello/sync"

dotenv.config({ path: resolve(process.cwd(), ".env.local") })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Faltan variables de entorno:")
  console.error("   - NEXT_PUBLIC_SUPABASE_URL")
  console.error("   - SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

// Las credenciales de Trello se obtienen de la base de datos por agencia

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Helper para retry con backoff exponencial
const fetchCardWithRetry = async (
  cardId: string,
  apiKey: string,
  token: string,
  retries = 5
): Promise<any> => {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const fullCard = await fetchTrelloCard(cardId, apiKey, token)
      return fullCard
    } catch (error: any) {
      if (error.message?.includes("429") || error.message?.includes("Rate limit") || error.message?.includes("Too Many Requests")) {
        const waitTime = Math.min(2000 * Math.pow(2, attempt), 30000)
        console.log(`⚠️ Rate limit detectado, esperando ${waitTime}ms...`)
        await delay(waitTime)
        continue
      }
      if (attempt === retries - 1) {
        throw error
      }
      await delay(1000 * (attempt + 1))
    }
  }
  return null
}

async function deleteAllTrelloLeads(agencyId: string, agencyName: string) {
  console.log(`\n🗑️  Eliminando TODOS los leads de Trello de ${agencyName}...`)
  
  // Contar leads existentes
  const { count: totalCount } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("source", "Trello")
    .eq("agency_id", agencyId)
  
  console.log(`   📊 Encontrados ${totalCount || 0} leads de Trello`)
  
  if (!totalCount || totalCount === 0) {
    console.log(`   ✅ No hay leads para eliminar`)
    return
  }
  
  // Eliminar TODOS directamente (más eficiente)
  const { error: deleteError, count: deletedCount } = await supabase
    .from("leads")
    .delete({ count: "exact" })
    .eq("source", "Trello")
    .eq("agency_id", agencyId)
  
  if (deleteError) {
    console.error(`   ❌ Error eliminando leads:`, deleteError)
    return
  }
  
  console.log(`   ✅ ${deletedCount || 0} leads eliminados de ${agencyName}`)
}

async function syncAgency(agencyName: string) {
  console.log("\n" + "=".repeat(70))
  console.log(`🔄 SINCRONIZANDO ${agencyName.toUpperCase()}`)
  console.log("=".repeat(70))
  
  // 1. Obtener agencia
  const { data: agency } = await supabase
    .from("agencies")
    .select("id, name")
    .ilike("name", `%${agencyName}%`)
    .single()
  
  if (!agency) {
    console.error(`❌ No se encontró agencia ${agencyName}`)
    return { success: false, synced: 0, created: 0, errors: 0 }
  }
  
  const agencyId = agency.id
  console.log(`✅ Agencia: ${agency.name} (${agencyId})`)
  
  // 2. Obtener configuración de Trello
  const { data: trelloSettings } = await supabase
    .from("settings_trello")
    .select("*")
    .eq("agency_id", agencyId)
    .single()
  
  if (!trelloSettings) {
    console.error(`❌ No hay configuración de Trello para ${agencyName}`)
    return { success: false, synced: 0, created: 0, errors: 0 }
  }
  
  const settings = trelloSettings as any
  const boardId = settings.board_id
  const trelloApiKey = settings.trello_api_key
  const trelloToken = settings.trello_token
  
  if (!trelloApiKey || !trelloToken) {
    console.error(`❌ No hay credenciales de Trello para ${agencyName}`)
    return { success: false, synced: 0, created: 0, errors: 0 }
  }
  
  console.log(`✅ Board ID: ${boardId}`)
  console.log(`✅ API Key: ${trelloApiKey.substring(0, 10)}...`)
  
  // 3. BORRAR TODOS LOS LEADS DE TRELLO
  await deleteAllTrelloLeads(agencyId, agencyName)
  
  // 4. Obtener TODAS las cards del board usando el endpoint correcto
  console.log(`\n📥 Obteniendo todas las cards de Trello...`)
  
  // Usar /boards/{id}/cards/open que devuelve todas las cards activas sin límite
  let allCards: any[] = []
  let hasMore = true
  let before = null
  
  while (hasMore) {
    let url = `https://api.trello.com/1/boards/${boardId}/cards/open?key=${trelloApiKey}&token=${trelloToken}&fields=id,name,dateLastActivity&limit=1000`
    if (before) {
      url += `&before=${before}`
    }
    
    const cardsResponse = await fetch(url)
    
    if (!cardsResponse.ok) {
      if (cardsResponse.status === 429) {
        console.log(`⚠️ Rate limit, esperando 10 segundos...`)
        await delay(10000)
        continue
      }
      console.error(`❌ Error al obtener cards: ${cardsResponse.status}`)
      break
    }
    
    const cards = await cardsResponse.json()
    
    if (cards.length === 0) {
      hasMore = false
      break
    }
    
    allCards = [...allCards, ...cards]
    console.log(`   📥 Obtenidas ${allCards.length} cards...`)
    
    // Si obtuvimos menos de 1000, no hay más
    if (cards.length < 1000) {
      hasMore = false
    } else {
      // Usar el último ID como cursor para la siguiente página
      before = cards[cards.length - 1].id
      await delay(500) // Pequeño delay entre requests
    }
  }
  
  console.log(`✅ Total: ${allCards.length} cards encontradas`)
  
  // 5. Sincronizar cada card
  console.log(`\n🔄 Sincronizando ${allCards.length} cards...`)
  
  const trelloSettingsForSync = {
    agency_id: agencyId,
    trello_api_key: trelloApiKey,
    trello_token: trelloToken,
    board_id: boardId,
    list_status_mapping: (settings.list_status_mapping || {}) as Record<string, string>,
    list_region_mapping: (settings.list_region_mapping || {}) as Record<string, string>,
  }
  
  let synced = 0
  let created = 0
  let updated = 0
  let errors = 0
  let rateLimited = 0
  
  const DELAY_BETWEEN_CARDS = 100 // 100ms entre cards
  const BATCH_SIZE = 50
  const DELAY_BETWEEN_BATCHES = 2000 // 2 segundos entre batches
  
  for (let i = 0; i < allCards.length; i++) {
    const card = allCards[i]
    
    try {
      // Fetch full card details with retry
      const fullCard = await fetchCardWithRetry(card.id, trelloApiKey, trelloToken)
      
      if (!fullCard) {
        console.error(`❌ Card ${card.id} not found or deleted`)
        errors++
        continue
      }
      
      // Sync using the proper function
      const result = await syncTrelloCardToLead(fullCard, trelloSettingsForSync, supabase)
      
      if (result.created) {
        created++
      } else {
        updated++
      }
      synced++
      
      // Log progress every 50 cards
      if (synced % 50 === 0) {
        console.log(`📊 Progreso: ${synced}/${allCards.length} (${created} nuevas, ${updated} actualizadas, ${errors} errores)`)
      }
      
      // Delay entre cards
      if (i < allCards.length - 1) {
        await delay(DELAY_BETWEEN_CARDS)
      }
      
      // Delay más largo entre batches
      if ((i + 1) % BATCH_SIZE === 0 && i < allCards.length - 1) {
        console.log(`⏸️  Pausa de ${DELAY_BETWEEN_BATCHES}ms después de batch de ${BATCH_SIZE}...`)
        await delay(DELAY_BETWEEN_BATCHES)
      }
    } catch (error: any) {
      if (error.message?.includes("429") || error.message?.includes("Rate limit")) {
        rateLimited++
        console.log(`⚠️ Rate limit en card ${card.id}, esperando 5 segundos...`)
        await delay(5000)
        i-- // Reintentar esta card
        continue
      }
      console.error(`❌ Error sincronizando card ${card.id}:`, error.message)
      errors++
    }
  }
  
  // 6. Actualizar last_sync_at
  await supabase
    .from("settings_trello")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("agency_id", agencyId)
  
  console.log(`\n✅ ${agencyName} completado:`)
  console.log(`   📊 Total sincronizado: ${synced}`)
  console.log(`   ✨ Nuevos: ${created}`)
  console.log(`   🔄 Actualizados: ${updated}`)
  console.log(`   ❌ Errores: ${errors}`)
  if (rateLimited > 0) {
    console.log(`   ⚠️  Rate limits: ${rateLimited}`)
  }
  
  return { success: true, synced, created, updated, errors }
}

async function main() {
  console.log("🚀 RESET Y RESINCRONIZACIÓN COMPLETA DE TRELLO")
  console.log("=".repeat(70))
  console.log("Este script:")
  console.log("1. BORRA TODOS los leads de Trello de ambas agencias")
  console.log("2. Resincroniza TODO desde Trello desde cero")
  console.log("=".repeat(70))
  console.log("")
  
  const startTime = Date.now()
  
  // Sincronizar Rosario
  const rosarioResult = await syncAgency("Rosario")
  
  // Esperar un poco antes de la siguiente agencia
  console.log("\n⏸️  Esperando 5 segundos antes de sincronizar Madero...")
  await delay(5000)
  
  // Sincronizar Madero
  const maderoResult = await syncAgency("Madero")
  
  const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2)
  
  console.log("\n" + "=".repeat(70))
  console.log("✅ RESINCRONIZACIÓN COMPLETA FINALIZADA")
  console.log("=".repeat(70))
  console.log(`⏱️  Duración total: ${duration} minutos`)
  console.log("")
  console.log("📊 RESUMEN:")
  console.log(`   Rosario: ${rosarioResult.synced} leads sincronizados`)
  console.log(`   Madero: ${maderoResult.synced} leads sincronizados`)
  console.log(`   Total: ${rosarioResult.synced + maderoResult.synced} leads`)
  console.log("")
  console.log("💡 Ahora puedes ver todos los leads en la página de Leads")
  console.log("=".repeat(70))
}

main().catch(console.error)

