#!/usr/bin/env tsx
/**
 * Script para sincronizar trello_list_id de todos los leads
 * Obtiene el estado actual de cada card en Trello y actualiza el trello_list_id en BD
 */

import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import { resolve } from "path"

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

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function syncListIds() {
  console.log("🔄 SINCRONIZANDO trello_list_id DE TODOS LOS LEADS")
  console.log("=".repeat(60))
  console.log("")

  // 1. Obtener agencia Rosario
  const { data: rosario } = await supabase
    .from("agencies")
    .select("id, name")
    .ilike("name", "%rosario%")
    .single()

  if (!rosario) {
    console.error("❌ No se encontró agencia Rosario")
    return
  }

  console.log(`✅ Agencia: ${rosario.name}`)

  // 2. Obtener configuración
  const { data: settings } = await supabase
    .from("settings_trello")
    .select("*")
    .eq("agency_id", rosario.id)
    .single()

  if (!settings) {
    console.error("❌ No hay configuración de Trello")
    return
  }

  const BOARD_ID = settings.board_id

  // 3. Obtener todos los leads de Trello (sin límite)
  console.log("")
  console.log("📥 Obteniendo leads de Trello desde BD...")
  let allLeads: any[] = []
  let page = 0
  const pageSize = 1000
  let hasMore = true
  
  while (hasMore) {
    const { data, error } = await supabase
      .from("leads")
      .select("id, external_id, trello_list_id, contact_name")
      .eq("source", "Trello")
      .not("external_id", "is", null)
      .eq("agency_id", rosario.id)
      .range(page * pageSize, (page + 1) * pageSize - 1)
    
    if (error) {
      console.error("❌ Error obteniendo leads:", error)
      break
    }
    
    if (data && data.length > 0) {
      allLeads = [...allLeads, ...data]
      hasMore = data.length === pageSize
      page++
      console.log(`   📥 Obtenidos ${allLeads.length} leads...`)
    } else {
      hasMore = false
    }
  }

  if (!allLeads || allLeads.length === 0) {
    console.log("⚠️  No hay leads de Trello para sincronizar")
    return
  }

  console.log(`✅ ${allLeads.length} leads encontrados`)
  console.log("")

  // 4. Sincronizar cada lead
  let updated = 0
  let errors = 0
  let unchanged = 0

  for (let i = 0; i < allLeads.length; i++) {
    const lead = allLeads[i]
    const cardId = lead.external_id

    try {
      // Obtener card actual de Trello
      const cardResponse = await fetch(
        `https://api.trello.com/1/cards/${cardId}?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&fields=id,idList,closed`
      )

      if (!cardResponse.ok) {
        if (cardResponse.status === 404) {
          console.log(`   ⚠️  Card ${cardId.substring(0, 8)}... no existe en Trello (posiblemente archivada)`)
          // No actualizar, dejar como está
          unchanged++
        } else {
          console.error(`   ❌ Error obteniendo card ${cardId}: ${cardResponse.status}`)
          errors++
        }
        continue
      }

      const card = await cardResponse.json()

      // Si la card está cerrada (archivada), saltar
      if (card.closed) {
        console.log(`   ⏭️  Card ${cardId.substring(0, 8)}... está archivada`)
        unchanged++
        continue
      }

      const currentListId = card.idList
      const bdListId = lead.trello_list_id

      // Solo actualizar si es diferente
      if (currentListId !== bdListId) {
        const { error } = await supabase
          .from("leads")
          .update({ trello_list_id: currentListId, updated_at: new Date().toISOString() })
          .eq("id", lead.id)

        if (error) {
          console.error(`   ❌ Error actualizando lead ${lead.id}: ${error.message}`)
          errors++
        } else {
          updated++
          if (updated % 50 === 0) {
            console.log(`   📊 Actualizados: ${updated}/${allLeads.length}`)
          }
        }
      } else {
        unchanged++
      }

      // Rate limiting
      await delay(50)

      if ((i + 1) % 20 === 0) {
        await delay(1000)
      }
    } catch (error: any) {
      console.error(`   ❌ Error procesando lead ${lead.id}: ${error.message}`)
      errors++
    }
  }

  console.log("")
  console.log("=".repeat(60))
  console.log("✅ SINCRONIZACIÓN COMPLETADA")
  console.log("=".repeat(60))
  console.log(`📊 Total procesados: ${allLeads.length}`)
  console.log(`✅ Actualizados: ${updated}`)
  console.log(`⏭️  Sin cambios: ${unchanged}`)
  console.log(`❌ Errores: ${errors}`)
  console.log("=".repeat(60))
}

syncListIds()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error("❌ Error fatal:", error)
    process.exit(1)
  })

