#!/usr/bin/env tsx
/**
 * Script para sincronizar SOLO Rosario
 */

import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import { resolve } from "path"
import { fetchTrelloCard, syncTrelloCardToLead } from "../lib/trello/sync"

dotenv.config({ path: resolve(__dirname, "../.env.local") })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Faltan variables de entorno")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

// Usar variables de entorno - NO hardcodear tokens
const TRELLO_API_KEY = process.env.TRELLO_API_KEY || ""
const TRELLO_TOKEN = process.env.TRELLO_TOKEN || ""

if (!TRELLO_API_KEY || !TRELLO_TOKEN) {
  console.error("❌ Faltan TRELLO_API_KEY o TRELLO_TOKEN en variables de entorno")
  process.exit(1)
}
const BOARD_ROSARIO = "kZh4zJ0J"

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function syncRosario() {
  console.log("🚀 Sincronizando Rosario...")
  console.log("=".repeat(60))
  
  // Obtener agencia Rosario
  const { data: rosario } = await supabase
    .from("agencies")
    .select("id, name")
    .ilike("name", "%rosario%")
    .single()
  
  if (!rosario) {
    console.error("❌ No se encontró agencia Rosario")
    process.exit(1)
  }
  
  console.log(`📊 Agencia: ${rosario.name} (ID: ${rosario.id})`)
  console.log("")
  
  // Obtener configuración
  const { data: settings } = await supabase
    .from("settings_trello")
    .select("*")
    .eq("agency_id", rosario.id)
    .single()
  
  if (!settings) {
    console.error("❌ No hay configuración de Trello")
    process.exit(1)
  }
  
  console.log("📥 Obteniendo cards activas de Trello...")
  
  // Obtener todas las cards activas
  let allCards: any[] = []
  let hasMore = true
  let before = null as string | null
  
  while (hasMore) {
    try {
      let url = `https://api.trello.com/1/boards/${BOARD_ROSARIO}/cards/open?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&fields=id,name,dateLastActivity&limit=1000`
      
      if (before) {
        url += `&before=${before}`
      }
      
      const cardsResponse = await fetch(url)
      
      if (!cardsResponse.ok) {
        if (cardsResponse.status === 429) {
          console.log("⚠️ Rate limit, esperando 10 segundos...")
          await delay(10000)
          continue
        }
        throw new Error(`Error: ${cardsResponse.status}`)
      }
      
      const cards = await cardsResponse.json()
      
      if (cards.length === 0) {
        hasMore = false
      } else {
        allCards = [...allCards, ...cards]
        before = cards[cards.length - 1].id
        hasMore = cards.length === 1000
        console.log(`📥 Obtenidas ${allCards.length} cards...`)
        
        if (hasMore) {
          await delay(500)
        }
      }
    } catch (error: any) {
      if (error.message?.includes("429")) {
        await delay(15000)
        continue
      }
      throw error
    }
  }
  
  console.log(`\n✅ Total cards a sincronizar: ${allCards.length}\n`)
  
  const trelloSettingsForSync = {
    agency_id: rosario.id,
    trello_api_key: TRELLO_API_KEY,
    trello_token: TRELLO_TOKEN,
    board_id: BOARD_ROSARIO,
    list_status_mapping: settings.list_status_mapping || {},
    list_region_mapping: settings.list_region_mapping || {},
  }
  
  let synced = 0
  let created = 0
  let updated = 0
  let errors = 0
  const startTime = Date.now()
  const seenCardIds = new Set<string>()
  
  for (let i = 0; i < allCards.length; i++) {
    const card = allCards[i]
    
    if (seenCardIds.has(card.id)) {
      continue
    }
    seenCardIds.add(card.id)
    
    try {
      const fullCard = await fetchTrelloCard(card.id, TRELLO_API_KEY, TRELLO_TOKEN)
      
      if (!fullCard || fullCard.closed) {
        continue
      }
      
      const result = await syncTrelloCardToLead(fullCard, trelloSettingsForSync, supabase)
      
      if (result.created) {
        created++
      } else {
        updated++
      }
      synced++
      
      if (synced % 50 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        console.log(`📊 Progreso: ${synced}/${allCards.length} (${created} nuevas, ${updated} actualizadas) - ${elapsed}s`)
      }
      
      await delay(50)
      
      if ((i + 1) % 20 === 0) {
        await delay(1000)
      }
    } catch (error: any) {
      console.error(`❌ Error en card ${card.id}:`, error.message)
      errors++
      
      if (error.message?.includes("429")) {
        await delay(10000)
      }
    }
  }
  
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)
  
  console.log("\n" + "=".repeat(60))
  console.log("✅ SINCRONIZACIÓN COMPLETADA")
  console.log("=".repeat(60))
  console.log(`📊 Total procesadas: ${synced}`)
  console.log(`✨ Nuevas: ${created}`)
  console.log(`🔄 Actualizadas: ${updated}`)
  console.log(`❌ Errores: ${errors}`)
  console.log(`⏱️  Tiempo: ${totalTime}s`)
  console.log("=".repeat(60))
}

syncRosario()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error fatal:", error)
    process.exit(1)
  })

