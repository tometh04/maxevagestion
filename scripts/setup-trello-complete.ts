#!/usr/bin/env tsx
/**
 * Script completo para configurar Trello desde cero
 * 
 * 1. Obtiene todas las listas de Trello
 * 2. Configura el mapeo automáticamente
 * 3. Sincroniza TODAS las cards activas
 * 4. Asigna cada lead a su lista correcta
 * 5. Configura webhooks para tiempo real
 * 
 * Uso:
 *   npx tsx scripts/setup-trello-complete.ts
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

// Configuración de boards por agencia
const TRELLO_CONFIG = {
  ROSARIO: {
    apiKey: TRELLO_API_KEY,
    token: TRELLO_TOKEN,
    boardId: "kZh4zJ0J",
  },
  MADERO: {
    apiKey: TRELLO_API_KEY,
    token: TRELLO_TOKEN,
    boardId: "X4IFL8rx",
  },
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Obtener todas las listas de un board de Trello
 */
async function fetchTrelloLists(boardId: string, apiKey: string, token: string) {
  const url = `https://api.trello.com/1/boards/${boardId}/lists?key=${apiKey}&token=${token}&fields=id,name,pos,closed`
  const response = await fetch(url)
  
  if (!response.ok) {
    throw new Error(`Error fetching lists: ${response.status}`)
  }
  
  return await response.json()
}

/**
 * Configurar mapeo automático de listas a status/region
 */
function configureListMapping(lists: any[]) {
  const listStatusMapping: Record<string, string> = {}
  const listRegionMapping: Record<string, string> = {}
  
  for (const list of lists) {
    if (list.closed) continue
    
    const listName = list.name.toLowerCase()
    
    // Mapeo de status basado en nombres comunes
    if (listName.includes("nuevo") || listName.includes("pendiente") || listName.includes("to do")) {
      listStatusMapping[list.id] = "NEW"
    } else if (listName.includes("en proceso") || listName.includes("proceso") || listName.includes("working")) {
      listStatusMapping[list.id] = "IN_PROGRESS"
    } else if (listName.includes("cotizado") || listName.includes("quote") || listName.includes("presupuesto")) {
      listStatusMapping[list.id] = "QUOTED"
    } else if (listName.includes("ganado") || listName.includes("won") || listName.includes("cerrado")) {
      listStatusMapping[list.id] = "WON"
    } else if (listName.includes("perdido") || listName.includes("lost")) {
      listStatusMapping[list.id] = "LOST"
    } else {
      // Por defecto, si tiene un vendedor asignado, está en progreso
      listStatusMapping[list.id] = "IN_PROGRESS"
    }
    
    // Mapeo de region basado en nombres comunes
    if (listName.includes("caribe") || listName.includes("caribbean")) {
      listRegionMapping[list.id] = "CARIBE"
    } else if (listName.includes("brasil") || listName.includes("brazil")) {
      listRegionMapping[list.id] = "BRASIL"
    } else if (listName.includes("argentina")) {
      listRegionMapping[list.id] = "ARGENTINA"
    } else if (listName.includes("europa") || listName.includes("europe")) {
      listRegionMapping[list.id] = "EUROPA"
    } else if (listName.includes("eeuu") || listName.includes("usa") || listName.includes("united states")) {
      listRegionMapping[list.id] = "EEUU"
    } else if (listName.includes("crucero") || listName.includes("cruise")) {
      listRegionMapping[list.id] = "CRUCEROS"
    } else {
      listRegionMapping[list.id] = "OTROS"
    }
  }
  
  return { listStatusMapping, listRegionMapping }
}

/**
 * Obtener todas las cards activas de un board
 */
async function fetchAllActiveCards(boardId: string, apiKey: string, token: string) {
  let allCards: any[] = []
  let hasMore = true
  let before = null as string | null
  
  console.log("📥 Obteniendo todas las cards activas...")
  
  while (hasMore) {
    try {
      let url = `https://api.trello.com/1/boards/${boardId}/cards/open?key=${apiKey}&token=${token}&fields=id,name,idList,dateLastActivity&limit=1000`
      
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
        console.log(`   📥 Obtenidas ${allCards.length} cards...`)
        
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
  
  return allCards
}

/**
 * Configurar webhook para un board
 */
async function setupWebhook(boardId: string, apiKey: string, token: string, callbackUrl: string) {
  // Obtener el board completo para tener el ID largo
  const boardResponse = await fetch(
    `https://api.trello.com/1/boards/${boardId}?key=${apiKey}&token=${token}&fields=id`
  )
  
  if (!boardResponse.ok) {
    throw new Error(`Error fetching board: ${boardResponse.status}`)
  }
  
  const board = await boardResponse.json()
  const fullBoardId = board.id
  
  // Verificar webhooks existentes
  const webhooksResponse = await fetch(
    `https://api.trello.com/1/tokens/${token}/webhooks?key=${apiKey}`
  )
  
  if (webhooksResponse.ok) {
    const webhooks = await webhooksResponse.json()
    
    // Eliminar webhooks duplicados para este board
    for (const webhook of webhooks) {
      if (webhook.idModel === fullBoardId || webhook.idModel === boardId) {
        console.log(`   🗑️  Eliminando webhook existente: ${webhook.id}`)
        await fetch(
          `https://api.trello.com/1/webhooks/${webhook.id}?key=${apiKey}&token=${token}`,
          { method: "DELETE" }
        )
      }
    }
  }
  
  // Crear nuevo webhook
  const webhookUrl = `https://api.trello.com/1/webhooks?key=${apiKey}&token=${token}`
  const webhookBody = new URLSearchParams({
    description: `ERP Lozada Webhook for board ${boardId}`,
    callbackURL: callbackUrl,
    idModel: fullBoardId,
  })
  
  const webhookResponse = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: webhookBody.toString(),
  })
  
  if (!webhookResponse.ok) {
    const errorText = await webhookResponse.text()
    throw new Error(`Error creating webhook: ${webhookResponse.status} - ${errorText}`)
  }
  
  const webhook = await webhookResponse.json()
  return webhook
}

/**
 * Configurar Trello para una agencia
 */
async function setupAgency(agencyName: string, config: typeof TRELLO_CONFIG.ROSARIO) {
  console.log("")
  console.log("=".repeat(60))
  console.log(`🚀 Configurando Trello para: ${agencyName}`)
  console.log("=".repeat(60))
  console.log("")
  
  // 1. Obtener agencia
  const { data: agency } = await supabase
    .from("agencies")
    .select("id, name")
    .ilike("name", `%${agencyName}%`)
    .single()
  
  if (!agency) {
    console.error(`❌ No se encontró agencia: ${agencyName}`)
    return
  }
  
  console.log(`✅ Agencia encontrada: ${agency.name} (${agency.id})`)
  
  // 2. Obtener todas las listas
  console.log("")
  console.log("📋 Obteniendo listas de Trello...")
  const lists = await fetchTrelloLists(config.boardId, config.apiKey, config.token)
  console.log(`   ✅ ${lists.filter((l: any) => !l.closed).length} listas activas encontradas`)
  
  // 3. Configurar mapeo
  console.log("")
  console.log("🔧 Configurando mapeo de listas...")
  const { listStatusMapping, listRegionMapping } = configureListMapping(lists)
  
  console.log("   📊 Mapeo de status:")
  for (const [listId, status] of Object.entries(listStatusMapping)) {
    const list = lists.find((l: any) => l.id === listId)
    console.log(`      ${list?.name || listId}: ${status}`)
  }
  
  console.log("   📊 Mapeo de regiones:")
  for (const [listId, region] of Object.entries(listRegionMapping)) {
    const list = lists.find((l: any) => l.id === listId)
    console.log(`      ${list?.name || listId}: ${region}`)
  }
  
  // 4. Guardar/actualizar configuración
  console.log("")
  console.log("💾 Guardando configuración...")
  const { data: existingSettings } = await supabase
    .from("settings_trello")
    .select("id")
    .eq("agency_id", agency.id)
    .single()
  
  const settingsData = {
    agency_id: agency.id,
    trello_api_key: config.apiKey,
    trello_token: config.token,
    board_id: config.boardId,
    list_status_mapping: listStatusMapping,
    list_region_mapping: listRegionMapping,
    updated_at: new Date().toISOString(),
  }
  
  if (existingSettings) {
    const { error } = await supabase
      .from("settings_trello")
      .update(settingsData)
      .eq("id", existingSettings.id)
    
    if (error) {
      console.error("❌ Error actualizando configuración:", error)
      return
    }
    console.log("   ✅ Configuración actualizada")
  } else {
    const { error } = await supabase
      .from("settings_trello")
      .insert(settingsData)
    
    if (error) {
      console.error("❌ Error creando configuración:", error)
      return
    }
    console.log("   ✅ Configuración creada")
  }
  
  // 5. Obtener todas las cards activas
  console.log("")
  const cards = await fetchAllActiveCards(config.boardId, config.apiKey, config.token)
  console.log(`✅ Total cards a sincronizar: ${cards.length}`)
  
  // 6. Sincronizar cada card
  console.log("")
  console.log("🔄 Sincronizando cards...")
  
  const trelloSettingsForSync = {
    agency_id: agency.id,
    trello_api_key: config.apiKey,
    trello_token: config.token,
    board_id: config.boardId,
    list_status_mapping: listStatusMapping,
    list_region_mapping: listRegionMapping,
  }
  
  let synced = 0
  let created = 0
  let updated = 0
  let errors = 0
  const startTime = Date.now()
  const seenCardIds = new Set<string>()
  
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]
    
    if (seenCardIds.has(card.id)) {
      continue
    }
    seenCardIds.add(card.id)
    
    try {
      const fullCard = await fetchTrelloCard(card.id, config.apiKey, config.token)
      
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
        console.log(`   📊 Progreso: ${synced}/${cards.length} (${created} nuevas, ${updated} actualizadas) - ${elapsed}s`)
      }
      
      await delay(50)
      
      if ((i + 1) % 20 === 0) {
        await delay(1000)
      }
    } catch (error: any) {
      console.error(`   ❌ Error en card ${card.id}:`, error.message)
      errors++
      
      if (error.message?.includes("429")) {
        await delay(10000)
      }
    }
  }
  
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)
  
  console.log("")
  console.log("=".repeat(60))
  console.log("✅ SINCRONIZACIÓN COMPLETADA")
  console.log("=".repeat(60))
  console.log(`📊 Total procesadas: ${synced}`)
  console.log(`✨ Nuevas: ${created}`)
  console.log(`🔄 Actualizadas: ${updated}`)
  console.log(`❌ Errores: ${errors}`)
  console.log(`⏱️  Tiempo: ${totalTime}s`)
  console.log("=".repeat(60))
  
  // 7. Configurar webhook
  console.log("")
  console.log("🔗 Configurando webhook...")
  try {
    const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://erplozada.vercel.app"}/api/trello/webhook`
    const webhook = await setupWebhook(config.boardId, config.apiKey, config.token, callbackUrl)
    console.log(`   ✅ Webhook configurado: ${webhook.id}`)
  } catch (error: any) {
    console.error(`   ⚠️  Error configurando webhook: ${error.message}`)
    console.error("   💡 Puedes configurarlo manualmente más tarde")
  }
}

/**
 * Función principal
 */
async function main() {
  console.log("🚀 CONFIGURACIÓN COMPLETA DE TRELLO")
  console.log("=".repeat(60))
  console.log("")
  console.log("Este script:")
  console.log("  1. Obtiene todas las listas de Trello")
  console.log("  2. Configura el mapeo automáticamente")
  console.log("  3. Sincroniza TODAS las cards activas")
  console.log("  4. Asigna cada lead a su lista correcta")
  console.log("  5. Configura webhooks para tiempo real")
  console.log("")
  
  // Configurar Rosario
  await setupAgency("Rosario", TRELLO_CONFIG.ROSARIO)
  
  // TODO: Descomentar cuando tengas el board ID de Madero
  // await setupAgency("Madero", TRELLO_CONFIG.MADERO)
  
  console.log("")
  console.log("=".repeat(60))
  console.log("✅ CONFIGURACIÓN COMPLETA FINALIZADA")
  console.log("=".repeat(60))
}

main()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error("❌ Error fatal:", error)
    process.exit(1)
  })

