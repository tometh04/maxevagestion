#!/usr/bin/env tsx
/**
 * Script para sincronización completa de Trello para Rosario
 * Sincroniza TODAS las cards del board de Rosario
 */

import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import { resolve } from "path"
import { fetchTrelloCard, syncTrelloCardToLead } from "../lib/trello/sync"

dotenv.config({ path: resolve(__dirname, "../.env.local") })

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

// Helper para delay
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
        const waitTime = Math.min(2000 * Math.pow(2, attempt), 30000) // Max 30 segundos
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

async function main() {
  console.log("🚀 Sincronización Completa de Trello - Rosario")
  console.log("=".repeat(60))
  console.log("")

  // 1. Obtener agencia Rosario
  console.log("📋 Obteniendo agencia Rosario...")
  const { data: agency, error: agencyError } = await supabase
    .from("agencies")
    .select("id, name")
    .eq("name", "Rosario")
    .single()

  if (agencyError || !agency) {
    console.error("❌ No se encontró agencia Rosario")
    console.error("   Error:", agencyError)
    process.exit(1)
  }

  const agencyId = agency.id
  console.log(`✅ Agencia encontrada: ${agency.name} (${agencyId})`)
  console.log("")

  // 2. Obtener configuración de Trello
  console.log("🔧 Obteniendo configuración de Trello...")
  const { data: trelloSettings, error: settingsError } = await supabase
    .from("settings_trello")
    .select("*")
    .eq("agency_id", agencyId)
    .single()

  if (settingsError || !trelloSettings) {
    console.error("❌ No hay configuración de Trello para Rosario")
    console.error("   Error:", settingsError)
    process.exit(1)
  }

  const settings = trelloSettings as any
  console.log(`✅ Board ID: ${settings.board_id}`)
  console.log(`✅ API Key: ${settings.trello_api_key.substring(0, 10)}...`)
  console.log("")

  // 3. Resetear last_sync_at para forzar sincronización completa
  console.log("🔄 Reseteando checkpoint de sincronización...")
  await supabase
    .from("settings_trello")
    .update({ last_sync_at: null })
    .eq("agency_id", agencyId)
  console.log("✅ Checkpoint reseteado (sincronización completa)")
  console.log("")

  // 4. Obtener TODAS las cards activas del board (sin límites)
  console.log("📥 Obteniendo TODAS las cards activas del board de Trello...")
  let allCards: any[] = []
  const seenCardIds = new Set<string>() // Para evitar duplicados
  
  try {
    // Obtener TODAS las cards activas sin límite
    // Usar el endpoint /cards/open que devuelve solo cards no archivadas
    let offset = 0
    const limit = 1000
    let hasMore = true
    let iterations = 0
    
    // La API de Trello no soporta paginación con offset para /cards/open
    // Necesitamos obtener todas las cards de una vez o usar un enfoque diferente
    // Intentar obtener todas las cards activas directamente
    console.log("   Obteniendo todas las cards activas (esto puede tardar si hay muchas)...")
    
    let cardsResponse = await fetch(
      `https://api.trello.com/1/boards/${settings.board_id}/cards/open?key=${settings.trello_api_key}&token=${settings.trello_token}&fields=id,name,dateLastActivity,closed`
    )

    if (!cardsResponse.ok) {
      if (cardsResponse.status === 429) {
        console.log("⚠️ Rate limit, esperando 10 segundos...")
        await delay(10000)
        cardsResponse = await fetch(
          `https://api.trello.com/1/boards/${settings.board_id}/cards/open?key=${settings.trello_api_key}&token=${settings.trello_token}&fields=id,name,dateLastActivity,closed`
        )
      }
      
      if (!cardsResponse.ok) {
        throw new Error(`Error al obtener cards: ${cardsResponse.statusText}`)
      }
    }

    const cards = await cardsResponse.json()
    
    // Filtrar duplicados y solo cards no archivadas (por si acaso)
    allCards = cards.filter((card: any) => {
      if (card.closed || seenCardIds.has(card.id)) {
        return false
      }
      seenCardIds.add(card.id)
      return true
    })
    
    console.log(`   📥 Obtenidas ${allCards.length} cards activas`)
    
    console.log(`   ✅ Total: ${allCards.length} cards activas encontradas`)
  } catch (error: any) {
    console.error("❌ Error obteniendo cards:", error.message)
    throw error
  }

  console.log(`\n✅ Total de cards encontradas: ${allCards.length}`)
  console.log("")

  if (allCards.length === 0) {
    console.log("⚠️ No hay cards para sincronizar")
    process.exit(0)
  }

  // 5. Preparar configuración para sincronización
  const trelloSettingsForSync = {
    agency_id: agencyId,
    trello_api_key: settings.trello_api_key,
    trello_token: settings.trello_token,
    board_id: settings.board_id,
    list_status_mapping: settings.list_status_mapping || {},
    list_region_mapping: settings.list_region_mapping || {},
  }

  // 6. Sincronizar todas las cards
  console.log("🔄 Iniciando sincronización de cards...")
  console.log("")

  let synced = 0
  let created = 0
  let updated = 0
  let errors = 0
  const startTime = Date.now()

  const BATCH_SIZE = 20
  const DELAY_BETWEEN_CARDS = 50 // 50ms entre cards
  const DELAY_BETWEEN_BATCHES = 1000 // 1 segundo entre batches

  for (let i = 0; i < allCards.length; i++) {
    const card = allCards[i]
    
    try {
      // Fetch full card details with retry
      const fullCard = await fetchCardWithRetry(
        card.id,
        trelloSettingsForSync.trello_api_key,
        trelloSettingsForSync.trello_token
      )

      if (!fullCard) {
        console.error(`⚠️ Card ${card.id} not found or deleted`)
        errors++
        continue
      }

      // Sync card
      const result = await syncTrelloCardToLead(fullCard, trelloSettingsForSync, supabase)
      
      if (result.created) {
        created++
      } else {
        updated++
      }
      synced++

      // Log progress cada 10 cards para mejor feedback
      if (synced % 10 === 0 || synced === allCards.length) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        const rate = synced > 0 ? (synced / (Date.now() - startTime) * 1000).toFixed(1) : "0"
        const percentage = ((synced / allCards.length) * 100).toFixed(1)
        console.log(`📊 ${percentage}% - ${synced}/${allCards.length} (${created} nuevas, ${updated} actualizadas, ${errors} errores) - ${rate} cards/seg`)
      }

      // Delay entre cards
      if (i < allCards.length - 1) {
        await delay(DELAY_BETWEEN_CARDS)
      }

      // Delay más largo entre batches
      if ((i + 1) % BATCH_SIZE === 0 && i < allCards.length - 1) {
        await delay(DELAY_BETWEEN_BATCHES)
      }
    } catch (error: any) {
      console.error(`❌ Error sincronizando card ${card.id}:`, error.message)
      errors++
      
      // Si hay muchos rate limits, esperar más
      if (errors > 10 && errors % 10 === 0) {
        console.log(`⚠️ Muchos errores, esperando 5 segundos...`)
        await delay(5000)
      }
    }
  }

  // 7. Actualizar checkpoint
  const now = new Date().toISOString()
  await supabase
    .from("settings_trello")
    .update({ last_sync_at: now })
    .eq("agency_id", agencyId)

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)

  console.log("\n" + "=".repeat(60))
  console.log("✅ SINCRONIZACIÓN COMPLETA FINALIZADA")
  console.log("=".repeat(60))
  console.log(`📊 Total procesadas: ${synced}`)
  console.log(`✨ Nuevas: ${created}`)
  console.log(`🔄 Actualizadas: ${updated}`)
  console.log(`❌ Errores: ${errors}`)
  console.log(`⏱️  Tiempo total: ${totalTime}s`)
  if (synced > 0) {
    console.log(`📈 Velocidad promedio: ${(synced / parseFloat(totalTime)).toFixed(1)} cards/seg`)
  }
  console.log("=".repeat(60))
  console.log("")

  // 8. Verificar leads de Maximiliano
  console.log("🔍 Verificando leads de Maximiliano...")
  const { data: maximiliano } = await supabase
    .from("users")
    .select("id, name")
    .ilike("name", "%maximiliano%")
    .single()

  if (maximiliano) {
    const { count } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("assigned_seller_id", maximiliano.id)
      .eq("source", "Trello")
      .eq("agency_id", agencyId)

    console.log(`✅ Leads de Maximiliano: ${count || 0}`)
    console.log(`   Usuario ID: ${maximiliano.id}`)
    console.log(`   Nombre: ${maximiliano.name}`)
  } else {
    console.log("⚠️ No se encontró usuario Maximiliano")
    console.log("   Buscando todos los usuarios...")
    const { data: allUsers } = await supabase
      .from("users")
      .select("id, name, email")
      .in("role", ["SELLER", "ADMIN", "SUPER_ADMIN"])
      .eq("is_active", true)
    
    if (allUsers) {
      console.log(`   Usuarios encontrados: ${allUsers.map((u: any) => u.name).join(", ")}`)
    }
  }

  console.log("")
  console.log("🎉 ¡Sincronización completada exitosamente!")
}

main()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error("❌ Error fatal:", error)
    process.exit(1)
  })

