#!/usr/bin/env tsx
/**
 * Script COMPLETO para resetear y sincronizar Trello desde cero
 * 
 * Este script:
 * 1. Borra TODOS los leads de Trello existentes
 * 2. Actualiza las credenciales de Trello en la base de datos
 * 3. Sincroniza TODAS las cards activas (no archivadas) de ambos boards
 * 4. Configura los webhooks en producción
 * 
 * Uso:
 *   npx tsx scripts/reset-and-sync-trello-production.ts <WEBHOOK_URL_PRODUCTION>
 * 
 * Ejemplo:
 *   npx tsx scripts/reset-and-sync-trello-production.ts https://www.maxevagestion.com
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

// Usar variables de entorno - NO hardcodear tokens
const TRELLO_API_KEY = process.env.TRELLO_API_KEY || ""
const TRELLO_TOKEN = process.env.TRELLO_TOKEN || ""

if (!TRELLO_API_KEY || !TRELLO_TOKEN) {
  console.error("❌ Faltan TRELLO_API_KEY o TRELLO_TOKEN en variables de entorno")
  process.exit(1)
}

const BOARD_ROSARIO = "kZh4zJ0J"
const BOARD_MADERO = "X4IFL8rx"

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

/**
 * Paso 1: Borrar TODOS los leads de Trello
 */
async function deleteAllTrelloLeads() {
  console.log("\n" + "=".repeat(60))
  console.log("🗑️  PASO 1: Borrando todos los leads de Trello")
  console.log("=".repeat(60))
  
  const { data: leadsToDelete, error: selectError } = await supabase
    .from("leads")
    .select("id")
    .eq("source", "Trello")
  
  if (selectError) {
    console.error("❌ Error obteniendo leads:", selectError)
    throw selectError
  }
  
  const count = leadsToDelete?.length || 0
  console.log(`📊 Leads encontrados para borrar: ${count}`)
  
  if (count === 0) {
    console.log("✅ No hay leads para borrar")
    return
  }
  
  const { error: deleteError } = await supabase
    .from("leads")
    .delete()
    .eq("source", "Trello")
  
  if (deleteError) {
    console.error("❌ Error borrando leads:", deleteError)
    throw deleteError
  }
  
  console.log(`✅ ${count} leads borrados exitosamente`)
}

/**
 * Paso 2: Actualizar credenciales de Trello en la base de datos
 */
async function updateTrelloCredentials() {
  console.log("\n" + "=".repeat(60))
  console.log("🔑 PASO 2: Actualizando credenciales de Trello")
  console.log("=".repeat(60))
  
  // Obtener ambas agencias
  const { data: agencies, error: agenciesError } = await supabase
    .from("agencies")
    .select("id, name")
    .order("name")
  
  if (agenciesError || !agencies) {
    console.error("❌ Error obteniendo agencias:", agenciesError)
    throw agenciesError
  }
  
  console.log(`📊 Agencias encontradas: ${agencies.length}`)
  
  for (const agency of agencies) {
    const agencyName = agency.name.toLowerCase()
    let boardId = ""
    
    if (agencyName.includes("rosario")) {
      boardId = BOARD_ROSARIO
      console.log(`\n📍 Agencia: ${agency.name} → Board: ${boardId}`)
    } else if (agencyName.includes("madero")) {
      boardId = BOARD_MADERO
      console.log(`\n📍 Agencia: ${agency.name} → Board: ${boardId}`)
    } else {
      console.log(`\n⚠️  Agencia: ${agency.name} → Sin board configurado, saltando...`)
      continue
    }
    
    // Verificar si existe configuración
    const { data: existing } = await supabase
      .from("settings_trello")
      .select("id")
      .eq("agency_id", agency.id)
      .maybeSingle()
    
    const settingsData: any = {
      agency_id: agency.id,
      trello_api_key: TRELLO_API_KEY,
      trello_token: TRELLO_TOKEN,
      board_id: boardId,
      list_status_mapping: {},
      list_region_mapping: {},
      updated_at: new Date().toISOString(),
    }
    
    if (existing) {
      // Actualizar
      const { error: updateError } = await supabase
        .from("settings_trello")
        .update(settingsData)
        .eq("id", existing.id)
      
      if (updateError) {
        console.error(`❌ Error actualizando configuración para ${agency.name}:`, updateError)
        throw updateError
      }
      console.log(`✅ Configuración actualizada para ${agency.name}`)
    } else {
      // Crear
      const { error: insertError } = await supabase
        .from("settings_trello")
        .insert(settingsData)
      
      if (insertError) {
        console.error(`❌ Error creando configuración para ${agency.name}:`, insertError)
        throw insertError
      }
      console.log(`✅ Configuración creada para ${agency.name}`)
    }
  }
  
  console.log("\n✅ Credenciales actualizadas para ambas agencias")
}

/**
 * Paso 3: Sincronizar todas las cards activas de un board
 */
async function syncBoard(agencyId: string, boardId: string, agencyName: string) {
  console.log("\n" + "=".repeat(60))
  console.log(`🔄 PASO 3: Sincronizando board de ${agencyName}`)
  console.log("=".repeat(60))
  console.log(`📋 Board ID: ${boardId}`)
  
  // Obtener configuración de Trello
  const { data: trelloSettings, error: settingsError } = await supabase
    .from("settings_trello")
    .select("*")
    .eq("agency_id", agencyId)
    .single()
  
  if (settingsError || !trelloSettings) {
    console.error("❌ No hay configuración de Trello para esta agencia")
    throw settingsError || new Error("No hay configuración de Trello")
  }
  
  const settings = trelloSettings as any
  
  console.log("📥 Obteniendo TODAS las cards activas (no archivadas)...")
  
  // IMPORTANTE: Usar /cards/open para obtener SOLO cards activas
  let allCards: any[] = []
  let hasMore = true
  let before = null as string | null
  
  while (hasMore) {
    try {
      let url = `https://api.trello.com/1/boards/${boardId}/cards/open?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&fields=id,name,dateLastActivity&limit=1000`
      
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
        const errorText = await cardsResponse.text()
        throw new Error(`Error al obtener cards: ${cardsResponse.status} - ${errorText}`)
      }
      
      const cards = await cardsResponse.json()
      
      if (cards.length === 0) {
        hasMore = false
      } else {
        allCards = [...allCards, ...cards]
        // Usar el ID de la última card como cursor
        before = cards[cards.length - 1].id
        hasMore = cards.length === 1000
        console.log(`📥 Obtenidas ${allCards.length} cards activas hasta ahora...`)
        
        // Pequeño delay entre batches
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
  
  console.log(`\n✅ Total de cards activas a sincronizar: ${allCards.length}\n`)
  
  if (allCards.length === 0) {
    console.log("⚠️  No hay cards activas para sincronizar")
    return { synced: 0, created: 0, updated: 0, errors: 0 }
  }
  
  const trelloSettingsForSync = {
    agency_id: agencyId,
    trello_api_key: TRELLO_API_KEY,
    trello_token: TRELLO_TOKEN,
    board_id: boardId,
    list_status_mapping: settings.list_status_mapping || {},
    list_region_mapping: settings.list_region_mapping || {},
  }
  
  let synced = 0
  let created = 0
  let updated = 0
  let errors = 0
  const startTime = Date.now()
  
  const BATCH_SIZE = 20
  const DELAY_BETWEEN_CARDS = 50 // 50ms entre cards
  const DELAY_BETWEEN_BATCHES = 1000 // 1 segundo entre batches
  
  // Usar Set para evitar duplicados
  const seenCardIds = new Set<string>()
  
  for (let i = 0; i < allCards.length; i++) {
    const card = allCards[i]
    
    // Verificar duplicados
    if (seenCardIds.has(card.id)) {
      console.log(`⚠️ Card duplicada detectada y omitida: ${card.id}`)
      continue
    }
    seenCardIds.add(card.id)
    
    try {
      // Fetch full card details with retry
      const fullCard = await fetchCardWithRetry(
        card.id,
        TRELLO_API_KEY,
        TRELLO_TOKEN
      )
      
      if (!fullCard) {
        console.error(`⚠️ Card ${card.id} not found or deleted`)
        errors++
        continue
      }
      
      // IMPORTANTE: Solo sincronizar cards NO archivadas
      if (fullCard.closed) {
        console.log(`⏭️  Card ${card.id} está archivada, omitiendo...`)
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
      
      // Log progress cada 50 cards
      if (synced % 50 === 0) {
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
      if (error.message?.includes("429") || error.message?.includes("Rate limit")) {
        console.log(`⚠️ Rate limit detectado, esperando 10 segundos...`)
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
  console.log(`✅ SINCRONIZACIÓN DE ${agencyName.toUpperCase()} COMPLETADA`)
  console.log("=".repeat(60))
  console.log(`📊 Total procesadas: ${synced}`)
  console.log(`✨ Nuevas: ${created}`)
  console.log(`🔄 Actualizadas: ${updated}`)
  console.log(`❌ Errores: ${errors}`)
  console.log(`⏱️  Tiempo total: ${totalTime}s`)
  console.log(`📈 Velocidad promedio: ${(synced / parseFloat(totalTime)).toFixed(1)} cards/seg`)
  console.log("=".repeat(60))
  
  return { synced, created, updated, errors }
}

/**
 * Paso 4: Configurar webhooks en producción
 */
async function setupWebhooks(webhookUrl: string) {
  console.log("\n" + "=".repeat(60))
  console.log("🔗 PASO 4: Configurando webhooks en producción")
  console.log("=".repeat(60))
  console.log(`📍 URL del Webhook: ${webhookUrl}`)
  
  // Validar URL
  if (!webhookUrl.startsWith("https://")) {
    console.error("❌ Error: La URL debe ser HTTPS")
    return false
  }
  
  const fullWebhookUrl = webhookUrl.endsWith("/api/trello/webhook")
    ? webhookUrl
    : `${webhookUrl.replace(/\/$/, "")}/api/trello/webhook`
  
  console.log(`📍 URL completa: ${fullWebhookUrl}`)
  
  // Verificar que el endpoint es accesible
  console.log("\n🔍 Verificando que el endpoint es accesible...")
  try {
    const headResponse = await fetch(fullWebhookUrl, { method: "HEAD" })
    if (headResponse.ok || headResponse.status === 405) {
      console.log("✅ Endpoint accesible")
    } else {
      console.warn(`⚠️  Endpoint responde con status: ${headResponse.status}`)
    }
  } catch (error: any) {
    console.error(`❌ Error verificando endpoint: ${error.message}`)
    return false
  }
  
  // Obtener todas las agencias con configuración de Trello
  const { data: agencies, error: agenciesError } = await supabase
    .from("agencies")
    .select("id, name")
    .order("name")
  
  if (agenciesError || !agencies) {
    console.error("❌ Error obteniendo agencias:", agenciesError)
    return false
  }
  
  for (const agency of agencies) {
    const agencyName = agency.name.toLowerCase()
    if (!agencyName.includes("rosario") && !agencyName.includes("madero")) {
      continue
    }
    
    console.log(`\n📋 Configurando webhook para ${agency.name}...`)
    
    // Obtener configuración de Trello
    const { data: trelloSettings, error: settingsError } = await supabase
      .from("settings_trello")
      .select("board_id")
      .eq("agency_id", agency.id)
      .single()
    
    if (settingsError || !trelloSettings) {
      console.error(`⚠️  No hay configuración de Trello para ${agency.name}, saltando...`)
      continue
    }
    
    const boardId = trelloSettings.board_id
    
    try {
      // Obtener el board ID completo desde Trello
      let boardIdFull = boardId
      try {
        const boardResponse = await fetch(
          `https://api.trello.com/1/boards/${boardId}?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
        )
        if (boardResponse.ok) {
          const boardData = await boardResponse.json()
          boardIdFull = boardData.id // Usar el ID completo
          console.log(`   ✓ Board ID completo obtenido: ${boardIdFull}`)
        }
      } catch (error: any) {
        console.warn(`   ⚠️  No se pudo obtener Board ID completo, usando corto: ${boardId}`)
      }
      
      // Obtener webhooks existentes
      const webhooksResponse = await fetch(
        `https://api.trello.com/1/tokens/${TRELLO_TOKEN}/webhooks?key=${TRELLO_API_KEY}`
      )
      
      if (!webhooksResponse.ok) {
        console.error(`❌ Error obteniendo webhooks: ${webhooksResponse.statusText}`)
        continue
      }
      
      const existingWebhooks = await webhooksResponse.json()
      
      // Eliminar webhooks duplicados para este board (verificar tanto ID corto como completo)
      const boardWebhooks = existingWebhooks.filter(
        (wh: any) => wh.idModel === boardId || wh.idModel === boardIdFull
      )
      for (const webhook of boardWebhooks) {
        if (webhook.callbackURL !== fullWebhookUrl) {
          console.log(`🗑️  Eliminando webhook duplicado: ${webhook.id}`)
          await fetch(
            `https://api.trello.com/1/webhooks/${webhook.id}?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
            { method: "DELETE" }
          )
          await delay(500)
        }
      }
      
      // Verificar si ya existe un webhook para este board con la URL correcta
      const existingWebhook = boardWebhooks.find((wh: any) => wh.callbackURL === fullWebhookUrl)
      
      if (existingWebhook) {
        console.log(`✅ Webhook ya existe para ${agency.name}`)
        console.log(`   ID: ${existingWebhook.id}`)
        console.log(`   Estado: ${existingWebhook.active ? "✅ Activo" : "❌ Inactivo"}`)
        
        // Actualizar en la base de datos
        await supabase
          .from("settings_trello")
          .update({
            webhook_id: existingWebhook.id,
            webhook_url: fullWebhookUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("agency_id", agency.id)
      } else {
        // Crear nuevo webhook
        console.log(`📝 Creando nuevo webhook para ${agency.name}...`)
        
        const createResponse = await fetch(
          `https://api.trello.com/1/webhooks?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              description: `ERP Lozada - ${agency.name}`,
              callbackURL: fullWebhookUrl,
              idModel: boardIdFull, // Usar el ID completo
            }),
          }
        )
        
        if (!createResponse.ok) {
          const errorText = await createResponse.text()
          console.error(`❌ Error creando webhook: ${createResponse.status} - ${errorText}`)
          continue
        }
        
        const webhookData = await createResponse.json()
        console.log(`✅ Webhook creado exitosamente para ${agency.name}`)
        console.log(`   ID: ${webhookData.id}`)
        console.log(`   URL: ${webhookData.callbackURL}`)
        
        // Guardar en la base de datos
        await supabase
          .from("settings_trello")
          .update({
            webhook_id: webhookData.id,
            webhook_url: fullWebhookUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("agency_id", agency.id)
      }
      
      await delay(1000) // Delay entre agencias
    } catch (error: any) {
      console.error(`❌ Error configurando webhook para ${agency.name}:`, error.message)
    }
  }
  
  console.log("\n✅ Webhooks configurados para ambas agencias")
  return true
}

/**
 * Función principal
 */
async function main() {
  const webhookUrl = process.argv[2]
  
  if (!webhookUrl) {
    console.error("❌ Error: Falta la URL de producción del webhook")
    console.error("")
    console.error("Uso:")
    console.error("  npx tsx scripts/reset-and-sync-trello-production.ts <WEBHOOK_URL>")
    console.error("")
    console.error("Ejemplo:")
    console.error("  npx tsx scripts/reset-and-sync-trello-production.ts https://www.maxevagestion.com")
    process.exit(1)
  }
  
  console.log("🚀 RESET Y SINCRONIZACIÓN COMPLETA DE TRELLO")
  console.log("=".repeat(60))
  console.log(`📍 URL de Producción: ${webhookUrl}`)
  console.log("=".repeat(60))
  
  try {
    // Paso 1: Borrar todos los leads de Trello
    await deleteAllTrelloLeads()
    
    // Paso 2: Actualizar credenciales
    await updateTrelloCredentials()
    
    // Paso 3: Sincronizar ambos boards
    const { data: agencies } = await supabase
      .from("agencies")
      .select("id, name")
      .order("name")
    
    if (!agencies) {
      throw new Error("No se pudieron obtener las agencias")
    }
    
    for (const agency of agencies) {
      const agencyName = agency.name.toLowerCase()
      let boardId = ""
      
      if (agencyName.includes("rosario")) {
        boardId = BOARD_ROSARIO
      } else if (agencyName.includes("madero")) {
        boardId = BOARD_MADERO
      } else {
        continue
      }
      
      await syncBoard(agency.id, boardId, agency.name)
      await delay(2000) // Delay entre agencias
    }
    
    // Paso 4: Configurar webhooks
    await setupWebhooks(webhookUrl)
    
    console.log("\n" + "=".repeat(60))
    console.log("🎉 ¡PROCESO COMPLETADO EXITOSAMENTE!")
    console.log("=".repeat(60))
    console.log("✅ Todos los leads de Trello fueron borrados")
    console.log("✅ Credenciales actualizadas")
    console.log("✅ Todas las cards activas sincronizadas")
    console.log("✅ Webhooks configurados en producción")
    console.log("")
    console.log("🚀 El sistema está listo para sincronización en tiempo real")
    console.log("=".repeat(60))
    
  } catch (error: any) {
    console.error("\n❌ ERROR FATAL:", error)
    console.error(error.stack)
    process.exit(1)
  }
}

main()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error("❌ Error fatal:", error)
    process.exit(1)
  })

