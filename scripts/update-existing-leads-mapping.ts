#!/usr/bin/env tsx
/**
 * Script para actualizar leads existentes con el mapeo correcto de listas
 * Esto corrige los leads que se sincronizaron antes de configurar el mapeo
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

const BOARD_ROSARIO = "kZh4zJ0J"

async function updateLeadsMapping() {
  console.log("🔄 Actualizando mapeo de leads existentes...")
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

  // Obtener configuración de Trello
  const { data: settings } = await supabase
    .from("settings_trello")
    .select("list_status_mapping, list_region_mapping")
    .eq("agency_id", rosario.id)
    .single()

  if (!settings) {
    console.error("❌ No hay configuración de Trello")
    return
  }

  const listStatusMapping = settings.list_status_mapping || {}
  const listRegionMapping = settings.list_region_mapping || {}

  console.log(`📋 Mapeos configurados: ${Object.keys(listStatusMapping).length} listas`)
  console.log("")

  // Obtener todos los leads de Trello para Rosario
  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, trello_list_id, status, region")
    .eq("source", "Trello")
    .eq("agency_id", rosario.id)

  if (error) {
    console.error("❌ Error obteniendo leads:", error)
    return
  }

  console.log(`📊 Leads encontrados: ${leads?.length || 0}`)
  console.log("")

  let updated = 0
  let skipped = 0

  for (const lead of leads || []) {
    if (!lead.trello_list_id) {
      skipped++
      continue
    }

    const newStatus = listStatusMapping[lead.trello_list_id] || lead.status
    const newRegion = listRegionMapping[lead.trello_list_id] || lead.region

    // Solo actualizar si cambió
    if (newStatus !== lead.status || newRegion !== lead.region) {
      const { error: updateError } = await supabase
        .from("leads")
        .update({
          status: newStatus,
          region: newRegion,
          updated_at: new Date().toISOString(),
        })
        .eq("id", lead.id)

      if (updateError) {
        console.error(`❌ Error actualizando lead ${lead.id}:`, updateError)
      } else {
        updated++
      }
    } else {
      skipped++
    }
  }

  console.log("")
  console.log("=".repeat(60))
  console.log("✅ ACTUALIZACIÓN COMPLETADA")
  console.log("=".repeat(60))
  console.log(`📊 Total leads: ${leads?.length || 0}`)
  console.log(`✅ Actualizados: ${updated}`)
  console.log(`⏭️  Sin cambios: ${skipped}`)
  console.log("=".repeat(60))
}

updateLeadsMapping()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error("❌ Error fatal:", error)
    process.exit(1)
  })

