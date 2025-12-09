#!/usr/bin/env tsx
/**
 * Script completo para sincronizar TODAS las cards de Trello para Madero
 * Similar a lo hecho para Rosario - trae todas las cards activas y las sincroniza
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
const BOARD_ID_SHORT = "X4IFL8rx" // Madero

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function syncMaderoComplete() {
  console.log("🚀 SINCRONIZACIÓN COMPLETA DE TRELLO - MADERO")
  console.log("=".repeat(70))
  console.log("")

  // 1. Obtener agencia Madero
  const { data: madero } = await supabase
    .from("agencies")
    .select("id, name")
    .ilike("name", "%madero%")
    .single()

  if (!madero) {
    console.error("❌ No se encontró agencia Madero")
    return
  }

  console.log(`✅ Agencia: ${madero.name} (ID: ${madero.id})`)

  // 2. Obtener configuración
  const { data: settings } = await supabase
    .from("settings_trello")
    .select("*")
    .eq("agency_id", madero.id)
    .single()

  if (!settings) {
    console.error("❌ No hay configuración de Trello para Madero")
    console.log("💡 Ejecuta primero: npx tsx scripts/setup-madero-complete.ts")
    return
  }

  console.log(`✅ Board ID: ${settings.board_id}`)

  // 3. Obtener todas las listas y configurar mapeos automáticamente
  console.log("")
  console.log("📋 Obteniendo listas de Trello...")
  const listsResponse = await fetch(
    `https://api.trello.com/1/boards/${BOARD_ID_SHORT}/lists?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&filter=open&fields=id,name,pos`
  )

  if (!listsResponse.ok) {
    console.error(`❌ Error obteniendo listas: ${listsResponse.status}`)
    return
  }

  const lists = await listsResponse.json()
  console.log(`✅ ${lists.length} listas encontradas`)

  // 4. Configurar mapeos automáticamente
  console.log("")
  console.log("🗺️  Configurando mapeos automáticos...")
  const listStatusMapping: Record<string, string> = {}
  const listRegionMapping: Record<string, string> = {}

  for (const list of lists) {
    const listName = list.name.toLowerCase()

    // Mapeo de status
    if (listName.includes("nuevo") || listName.includes("pendiente") || listName.includes("to do")) {
      listStatusMapping[list.id] = "NEW"
    } else if (
      listName.includes("en proceso") ||
      listName.includes("proceso") ||
      listName.includes("working") ||
      listName.includes("campaña")
    ) {
      listStatusMapping[list.id] = "IN_PROGRESS"
    } else if (listName.includes("cotizado") || listName.includes("quote") || listName.includes("presupuesto")) {
      listStatusMapping[list.id] = "QUOTED"
    } else if (listName.includes("ganado") || listName.includes("won") || listName.includes("cerrado")) {
      listStatusMapping[list.id] = "WON"
    } else if (listName.includes("perdido") || listName.includes("lost")) {
      listStatusMapping[list.id] = "LOST"
    } else {
      listStatusMapping[list.id] = "IN_PROGRESS" // Por defecto
    }

    // Mapeo de región
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
      listRegionMapping[list.id] = "OTROS" // Por defecto
    }

    console.log(`   📌 ${list.name} → ${listStatusMapping[list.id]} / ${listRegionMapping[list.id]}`)
  }

  // Guardar mapeos en BD
  const { error: updateError } = await supabase
    .from("settings_trello")
    .update({
      list_status_mapping: listStatusMapping,
      list_region_mapping: listRegionMapping,
      updated_at: new Date().toISOString(),
    })
    .eq("agency_id", madero.id)

  if (updateError) {
    console.error(`⚠️  Error guardando mapeos: ${updateError.message}`)
  } else {
    console.log("✅ Mapeos guardados en BD")
  }

  // 5. Obtener TODAS las cards activas (no archivadas) - CORREGIDO: solo del board específico
  console.log("")
  console.log("📥 Obteniendo todas las cards activas de Trello...")
  console.log(`   Board ID: ${BOARD_ID_SHORT}`)
  
  // IMPORTANTE: Usar /boards/{id}/cards/open para obtener SOLO cards activas del board específico
  // NO usar paginación aquí, la API de Trello devuelve todas las cards activas de una vez
  const cardsResponse = await fetch(
    `https://api.trello.com/1/boards/${BOARD_ID_SHORT}/cards/open?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&fields=id,name,idList`
  )

  if (!cardsResponse.ok) {
    console.error(`❌ Error obteniendo cards: ${cardsResponse.status}`)
    const errorText = await cardsResponse.text()
    console.error(`   ${errorText}`)
    return
  }

  const allCards = await cardsResponse.json()
  
  if (!Array.isArray(allCards)) {
    console.error(`❌ Respuesta inválida: ${typeof allCards}`)
    return
  }

  console.log(`✅ Total cards activas: ${allCards.length}`)

  if (allCards.length === 0) {
    console.log("ℹ️  No hay cards para sincronizar")
    return
  }

  // 6. Sincronizar cada card
  console.log("")
  console.log("🔄 Sincronizando cards...")
  console.log("")

  const trelloSettingsForSync = {
    agency_id: madero.id,
    trello_api_key: TRELLO_API_KEY,
    trello_token: TRELLO_TOKEN,
    board_id: settings.board_id,
    list_status_mapping: listStatusMapping,
    list_region_mapping: listRegionMapping,
  }

  let created = 0
  let updated = 0
  let errors = 0
  const seenCardIds = new Set<string>()

  for (let i = 0; i < allCards.length; i++) {
    const card = allCards[i]

    // Evitar duplicados
    if (seenCardIds.has(card.id)) {
      continue
    }
    seenCardIds.add(card.id)

    try {
      // Fetch card completa con todos los datos
      const fullCard = await fetchTrelloCard(card.id, TRELLO_API_KEY, TRELLO_TOKEN)

      if (!fullCard) {
        console.log(`   ⚠️  Card ${card.id.substring(0, 8)}... no encontrada, saltando`)
        errors++
        continue
      }

      // Sincronizar
      const result = await syncTrelloCardToLead(fullCard, trelloSettingsForSync, supabase)

      if (result.created) {
        created++
      } else {
        updated++
      }

      // Log cada 50 cards
      if ((created + updated) % 50 === 0) {
        console.log(`   📊 Progreso: ${created + updated}/${allCards.length} (${created} nuevas, ${updated} actualizadas)`)
      }

      // Rate limiting
      await delay(100)

      // Pausa cada 100 cards
      if ((i + 1) % 100 === 0) {
        await delay(1000)
      }
    } catch (error: any) {
      console.error(`   ❌ Error sincronizando card ${card.id}: ${error.message}`)
      errors++
    }
  }

  // 7. Actualizar last_sync_at
  await supabase
    .from("settings_trello")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("agency_id", madero.id)

  // 8. Resumen final
  console.log("")
  console.log("=".repeat(70))
  console.log("✅ SINCRONIZACIÓN COMPLETA FINALIZADA")
  console.log("=".repeat(70))
  console.log(`📊 Total procesadas: ${allCards.length}`)
  console.log(`🆕 Nuevas: ${created}`)
  console.log(`🔄 Actualizadas: ${updated}`)
  console.log(`❌ Errores: ${errors}`)
  console.log(`📋 Listas configuradas: ${lists.length}`)
  console.log("=".repeat(70))
  console.log("")
  console.log("💡 Madero ahora es la foto viva del tablero de Trello!")
}

syncMaderoComplete()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error("❌ Error fatal:", error)
    process.exit(1)
  })

