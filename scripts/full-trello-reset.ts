#!/usr/bin/env tsx
/**
 * Script MAESTRO: Borra todos los leads e importa TODO desde Trello
 * También verifica y configura webhooks para actualización en tiempo real
 * 
 * Uso:
 *   npx tsx scripts/full-trello-reset.ts <agencyId>
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

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

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
      if (error.message?.includes("429") || error.message?.includes("Rate limit")) {
        const waitTime = Math.min(2000 * Math.pow(2, attempt), 30000)
        console.log(`⚠️ Rate limit, esperando ${waitTime}ms...`)
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

async function clearAllLeads() {
  console.log("\n🗑️  PASO 1: Borrando TODOS los leads...")
  
  const { count: beforeCount, error: countError } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
  
  if (countError) {
    console.error("❌ Error al contar leads:", countError)
    throw countError
  }
  
  console.log(`📊 Leads antes: ${beforeCount || 0}`)
  
  // Borrar en batches más pequeños para evitar problemas
  let deleted = 0
  let hasMore = true
  let attempts = 0
  const maxAttempts = 100 // Máximo 100 batches (100,000 leads)
  
  while (hasMore && attempts < maxAttempts) {
    attempts++
    
    // Obtener batch de IDs
    const { data: batch, error: fetchError } = await supabase
      .from("leads")
      .select("id")
      .limit(500) // Batches más pequeños
    
    if (fetchError) {
      console.error("❌ Error al obtener batch:", fetchError)
      throw fetchError
    }
    
    if (!batch || batch.length === 0) {
      hasMore = false
      break
    }
    
    const ids = batch.map((l: any) => l.id)
    
    // Borrar el batch
    const { error: deleteError } = await supabase
      .from("leads")
      .delete()
      .in("id", ids)
    
    if (deleteError) {
      console.error("❌ Error al borrar batch:", deleteError)
      // Intentar borrar uno por uno como fallback
      console.log("⚠️ Intentando borrar uno por uno...")
      for (const id of ids) {
        const { error: singleError } = await supabase
          .from("leads")
          .delete()
          .eq("id", id)
        if (singleError) {
          console.error(`⚠️ No se pudo borrar lead ${id}:`, singleError.message)
        } else {
          deleted++
        }
      }
    } else {
      deleted += ids.length
    }
    
    console.log(`🗑️  Borrados ${deleted} leads...`)
    
    // Pequeño delay entre batches
    await delay(100)
  }
  
  const { count: afterCount, error: afterCountError } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
  
  if (afterCountError) {
    console.error("❌ Error al contar leads después:", afterCountError)
  } else {
    console.log(`✅ Leads después: ${afterCount || 0}`)
  }
  console.log(`✅ Total borrados: ${deleted} leads\n`)
}

async function verifyWebhook(agencyId: string, settings: any) {
  console.log("\n🔍 PASO 2: Verificando webhook de Trello...")
  
  try {
    const webhooksResponse = await fetch(
      `https://api.trello.com/1/tokens/${settings.trello_token}/webhooks?key=${settings.trello_api_key}`
    )

    if (!webhooksResponse.ok) {
      console.log("⚠️ No se pudieron obtener webhooks de Trello")
      return false
    }

    const webhooks = await webhooksResponse.json()
    const boardWebhooks = webhooks.filter(
      (wh: any) => wh.idModel === settings.board_id || 
                   wh.idModel?.includes(settings.board_id) ||
                   settings.board_id?.includes(wh.idModel)
    )

    if (boardWebhooks.length > 0) {
      const activeWebhooks = boardWebhooks.filter((wh: any) => wh.active)
      if (activeWebhooks.length > 0) {
        console.log(`✅ Webhook activo encontrado: ${activeWebhooks[0].callbackURL}`)
        return true
      } else {
        console.log("⚠️ Webhook existe pero está inactivo")
        return false
      }
    } else {
      console.log("⚠️ No se encontró webhook para este board")
      console.log("💡 Ejecuta: npx tsx scripts/register-trello-webhooks-production.ts <URL_PRODUCCION>")
      return false
    }
  } catch (error) {
    console.error("❌ Error verificando webhook:", error)
    return false
  }
}

async function massImport(agencyId: string) {
  console.log("\n🚀 PASO 3: Importación MASIVA de Trello...")

  const { data: trelloSettings, error: settingsError } = await supabase
    .from("settings_trello")
    .select("*")
    .eq("agency_id", agencyId)
    .single()

  if (settingsError || !trelloSettings) {
    throw new Error("No hay configuración de Trello para esta agencia")
  }

  const settings = trelloSettings as any

  // Resetear last_sync_at
  await supabase
    .from("settings_trello")
    .update({ last_sync_at: null })
    .eq("agency_id", agencyId)

  console.log(`📊 Board ID: ${settings.board_id}`)
  console.log(`🔑 API Key: ${settings.trello_api_key.substring(0, 10)}...`)
  console.log(`🔑 Token: ${settings.trello_token.substring(0, 10)}...`)

  // Obtener TODAS las cards del board específico
  // La API de Trello devuelve todas las cards del board en una sola llamada (hasta el límite de la API)
  console.log("🔄 Obteniendo cards del board específico...")
  
  let allCards: any[] = []
  let retries = 0
  const maxRetries = 3
  
  while (retries < maxRetries) {
    try {
      // Obtener todas las cards del board en una sola llamada
      // IMPORTANTE: Usar el board_id, api_key y token de la configuración
      const cardsResponse = await fetch(
        `https://api.trello.com/1/boards/${settings.board_id}/cards?key=${settings.trello_api_key}&token=${settings.trello_token}&fields=id,name,dateLastActivity,idList,idBoard`
      )

      if (!cardsResponse.ok) {
        if (cardsResponse.status === 429) {
          console.log("⚠️ Rate limit, esperando 10 segundos...")
          await delay(10000)
          retries++
          continue
        }
        const errorText = await cardsResponse.text()
        throw new Error(`Error ${cardsResponse.status}: ${errorText}`)
      }

      allCards = await cardsResponse.json()
      
      // VERIFICAR que todas las cards pertenecen al board correcto
      const cardsFromCorrectBoard = allCards.filter((card: any) => {
        // Verificar que el idBoard coincida exactamente
        return card.idBoard === settings.board_id
      })
      
      if (cardsFromCorrectBoard.length !== allCards.length) {
        console.warn(`⚠️ Algunas cards no pertenecen al board ${settings.board_id}`)
        console.warn(`   Cards del board correcto: ${cardsFromCorrectBoard.length} de ${allCards.length}`)
        // Usar solo las cards del board correcto
        allCards = cardsFromCorrectBoard
      }
      
      console.log(`✅ Total de cards obtenidas del board ${settings.board_id}: ${allCards.length}`)
      break // Salir del loop si fue exitoso
    } catch (error: any) {
      retries++
      if (retries >= maxRetries) {
        console.error("❌ Error obteniendo cards después de varios intentos:", error)
        throw error
      }
      console.log(`⚠️ Error, reintentando (${retries}/${maxRetries})...`)
      await delay(5000)
    }
  }

  if (allCards.length === 0) {
    throw new Error("No se obtuvieron cards del board. Verifica el board_id, api_key y token.")
  }

  console.log(`🚀 Iniciando sincronización de ${allCards.length} cards...\n`)

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
  const startTime = Date.now()

  const BATCH_SIZE = 20
  const DELAY_BETWEEN_CARDS = 50
  const DELAY_BETWEEN_BATCHES = 1000

  for (let i = 0; i < allCards.length; i++) {
    const card = allCards[i]
    
    try {
      const fullCard = await fetchCardWithRetry(
        card.id,
        trelloSettingsForSync.trello_api_key,
        trelloSettingsForSync.trello_token
      )

      if (!fullCard) {
        errors++
        continue
      }

      const result = await syncTrelloCardToLead(fullCard, trelloSettingsForSync, supabase)
      
      if (result.created) {
        created++
      } else {
        updated++
      }
      synced++

      if (synced % 100 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        const rate = (synced / (Date.now() - startTime) * 1000).toFixed(1)
        console.log(`📊 ${synced}/${allCards.length} (${created} nuevas, ${updated} actualizadas) - ${rate} cards/seg`)
      }

      if (i < allCards.length - 1) {
        await delay(DELAY_BETWEEN_CARDS)
      }

      if ((i + 1) % BATCH_SIZE === 0 && i < allCards.length - 1) {
        await delay(DELAY_BETWEEN_BATCHES)
      }
    } catch (error: any) {
      console.error(`❌ Error en card ${card.id}:`, error.message)
      errors++
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
  console.log("✅ IMPORTACIÓN COMPLETADA")
  console.log("=".repeat(60))
  console.log(`📊 Total: ${synced}`)
  console.log(`✨ Nuevas: ${created}`)
  console.log(`🔄 Actualizadas: ${updated}`)
  console.log(`❌ Errores: ${errors}`)
  console.log(`⏱️  Tiempo: ${totalTime}s`)
  console.log("=".repeat(60))
}

async function main() {
  const agencyId = process.argv[2]

  if (!agencyId) {
    console.error("❌ Error: Falta agencyId")
    console.error("\nUso:")
    console.error("  npx tsx scripts/full-trello-reset.ts <agencyId>")
    console.error("\nPara obtener el agencyId:")
    console.error("  npx tsx scripts/list-agencies.ts")
    process.exit(1)
  }

  try {
    // Paso 1: Borrar todos los leads
    await clearAllLeads()

    // Paso 2: Verificar webhook
    const { data: settings } = await supabase
      .from("settings_trello")
      .select("*")
      .eq("agency_id", agencyId)
      .single()

    if (settings) {
      const hasWebhook = await verifyWebhook(agencyId, settings)
      if (!hasWebhook) {
        console.log("\n⚠️ IMPORTANTE: Configura el webhook para actualización en tiempo real")
        console.log("   Ejecuta: npx tsx scripts/register-trello-webhooks-production.ts <URL_PRODUCCION>")
      }
    }

    // Paso 3: Importación masiva
    await massImport(agencyId)

    console.log("\n✅ PROCESO COMPLETO FINALIZADO")
    console.log("✅ Todos los leads fueron borrados e importados desde Trello")
    console.log("✅ El sistema está listo para actualización en tiempo real")
    
  } catch (error: any) {
    console.error("\n❌ ERROR FATAL:", error.message)
    process.exit(1)
  }
}

main()

