#!/usr/bin/env tsx
/**
 * Script para probar la sincronización manual de una card específica
 * Simula lo que haría el webhook
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
const CARD_ID = process.argv[2] || "693850ad86b0bbfde86d5f5b" // Card de prueba por defecto

async function testSync() {
  console.log("🧪 PROBANDO SINCRONIZACIÓN MANUAL")
  console.log("=".repeat(60))
  console.log("")
  console.log(`Card ID: ${CARD_ID}`)
  console.log("")

  // Obtener agencia Rosario
  const { data: rosario } = await supabase
    .from("agencies")
    .select("id, name")
    .ilike("name", "%rosario%")
    .single()

  if (!rosario) {
    console.error("❌ No se encontró agencia Rosario")
    return
  }

  // Obtener configuración
  const { data: settings } = await supabase
    .from("settings_trello")
    .select("*")
    .eq("agency_id", rosario.id)
    .single()

  if (!settings) {
    console.error("❌ No hay configuración de Trello")
    return
  }

  // Fetch card
  console.log("📥 Obteniendo card de Trello...")
  const card = await fetchTrelloCard(CARD_ID, TRELLO_API_KEY, TRELLO_TOKEN)

  if (!card) {
    console.error("❌ No se pudo obtener la card")
    return
  }

  console.log(`✅ Card obtenida: ${card.name}`)
  console.log(`   Lista ID: ${card.idList}`)
  console.log("")

  // Sincronizar
  const trelloSettingsForSync = {
    agency_id: rosario.id,
    trello_api_key: TRELLO_API_KEY,
    trello_token: TRELLO_TOKEN,
    board_id: settings.board_id,
    list_status_mapping: settings.list_status_mapping || {},
    list_region_mapping: settings.list_region_mapping || {},
  }

  console.log("🔄 Sincronizando a lead...")
  const result = await syncTrelloCardToLead(card, trelloSettingsForSync, supabase)

  console.log("")
  console.log("=".repeat(60))
  console.log(`✅ ${result.created ? "CREADO" : "ACTUALIZADO"}`)
  console.log(`   Lead ID: ${result.leadId}`)
  console.log("=".repeat(60))
}

testSync()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error("❌ Error:", error)
    process.exit(1)
  })

