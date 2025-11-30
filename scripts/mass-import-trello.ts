#!/usr/bin/env tsx
/**
 * Script para importación MASIVA de TODAS las cards de Trello
 * Sin límites, procesa TODO el board
 * 
 * Uso:
 *   npx tsx scripts/mass-import-trello.ts <agencyId>
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

async function massImportTrello(agencyId: string) {
  console.log("🚀 Iniciando importación MASIVA de Trello...")
  console.log(`📋 Agency ID: ${agencyId}\n`)

  // Get Trello settings
  const { data: trelloSettings, error: settingsError } = await supabase
    .from("settings_trello")
    .select("*")
    .eq("agency_id", agencyId)
    .single()

  if (settingsError || !trelloSettings) {
    console.error("❌ No hay configuración de Trello para esta agencia")
    process.exit(1)
  }

  const settings = trelloSettings as any

  console.log(`📊 Board ID: ${settings.board_id}`)
  console.log(`🔑 API Key: ${settings.trello_api_key.substring(0, 10)}...`)

  // Resetear last_sync_at para forzar sincronización completa
  await supabase
    .from("settings_trello")
    .update({ last_sync_at: null })
    .eq("agency_id", agencyId)

  console.log("🔄 Obteniendo TODAS las cards del board...")

  // Obtener TODAS las cards (sin límites)
  let allCards: any[] = []
  let offset = 0
  const limit = 1000
  let hasMore = true

  while (hasMore) {
    try {
      const cardsResponse = await fetch(
        `https://api.trello.com/1/boards/${settings.board_id}/cards?key=${settings.trello_api_key}&token=${settings.trello_token}&fields=id,name,dateLastActivity&limit=${limit}&offset=${offset}`
      )

      if (!cardsResponse.ok) {
        if (cardsResponse.status === 429) {
          console.log("⚠️ Rate limit, esperando 10 segundos...")
          await delay(10000)
          continue
        }
        throw new Error(`Error al obtener cards: ${cardsResponse.statusText}`)
      }

      const cards = await cardsResponse.json()
      
      if (cards.length === 0) {
        hasMore = false
      } else {
        allCards = [...allCards, ...cards]
        offset += cards.length
        hasMore = cards.length === limit
        console.log(`📥 Obtenidas ${allCards.length} cards hasta ahora...`)
        
        // Pequeño delay entre batches de requests
        if (hasMore) {
          await delay(500)
        }
      }
    } catch (error: any) {
      if (error.message?.includes("429")) {
        console.log("⚠️ Rate limit, esperando 15 segundos...")
        await delay(15000)
        continue
      }
      throw error
    }
  }

  console.log(`\n✅ Total de cards a importar: ${allCards.length}\n`)

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
  const startTime = Date.now()

  // Procesar TODAS las cards
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

      // Log progress cada 100 cards
      if (synced % 100 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        const rate = (synced / (Date.now() - startTime) * 1000).toFixed(1)
        console.log(`📊 Progreso: ${synced}/${allCards.length} (${created} nuevas, ${updated} actualizadas, ${errors} errores) - ${rate} cards/seg - ${elapsed}s`)
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
      if (rateLimited > 10 && rateLimited % 10 === 0) {
        console.log(`⚠️ Muchos rate limits, esperando 10 segundos...`)
        await delay(10000)
      }
    }
  }

  // Actualizar checkpoint
  const now = new Date().toISOString()
  await supabase
    .from("settings_trello")
    .update({ last_sync_at: now })
    .eq("agency_id", agencyId)

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)

  console.log("\n" + "=".repeat(60))
  console.log("✅ IMPORTACIÓN MASIVA COMPLETADA")
  console.log("=".repeat(60))
  console.log(`📊 Total procesadas: ${synced}`)
  console.log(`✨ Nuevas: ${created}`)
  console.log(`🔄 Actualizadas: ${updated}`)
  console.log(`❌ Errores: ${errors}`)
  console.log(`⏱️  Tiempo total: ${totalTime}s`)
  console.log(`📈 Velocidad promedio: ${(synced / parseFloat(totalTime)).toFixed(1)} cards/seg`)
  console.log("=".repeat(60))
}

async function main() {
  const agencyId = process.argv[2]

  if (!agencyId) {
    console.error("❌ Error: Falta agencyId")
    console.error("\nUso:")
    console.error("  npx tsx scripts/mass-import-trello.ts <agencyId>")
    console.error("\nPara obtener el agencyId, ejecuta:")
    console.error("  npx tsx scripts/list-agencies.ts")
    process.exit(1)
  }

  await massImportTrello(agencyId)
}

main()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error("❌ Error fatal:", error)
    process.exit(1)
  })

