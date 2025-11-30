/**
 * Script para actualizar la base de datos con el webhook registrado
 */

import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase environment variables")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Webhook info from successful registration
const WEBHOOK_ID = "69273b41147fc97d1be5573c"
const WEBHOOK_URL = "https://silly-islands-own.loca.lt/api/trello/webhook"
const BOARD_SHORT_ID = "kZh4zJ0J"
const BOARD_FULL_ID = "680965f3edccf6f26eda61ef"

async function updateDatabase() {
  console.log("🔄 Actualizando base de datos con información del webhook...")
  console.log("")

  // 1. Find the Trello settings
  console.log("1. Buscando configuración de Trello...")
  
  const { data: agencies } = await supabase
    .from("agencies")
    .select("id, name")
    .limit(1)

  if (!agencies || agencies.length === 0) {
    console.error("❌ No se encontraron agencias")
    process.exit(1)
  }

  const agencyId = agencies[0].id
  console.log(`   ✓ Agencia: ${agencies[0].name} (${agencyId})`)

  const { data: trelloSettings } = await supabase
    .from("settings_trello")
    .select("*")
    .eq("agency_id", agencyId)
    .single()

  if (!trelloSettings) {
    console.error("❌ No se encontró configuración de Trello")
    console.log("   Creando configuración...")
    
    const TRELLO_API_KEY = process.env.TRELLO_API_KEY || ""
    const TRELLO_TOKEN = process.env.TRELLO_TOKEN || ""
    
    if (!TRELLO_API_KEY || !TRELLO_TOKEN) {
      console.error("Missing Trello environment variables (TRELLO_API_KEY, TRELLO_TOKEN)")
      process.exit(1)
    }

    const { data: newSettings, error: insertError } = await (supabase.from("settings_trello") as any)
      .insert({
        agency_id: agencyId,
        trello_api_key: TRELLO_API_KEY,
        trello_token: TRELLO_TOKEN,
        board_id: BOARD_SHORT_ID,
        list_status_mapping: {},
        list_region_mapping: {},
        webhook_id: WEBHOOK_ID,
        webhook_url: WEBHOOK_URL,
      })
      .select()
      .single()

    if (insertError) {
      console.error("   ❌ Error:", insertError)
      process.exit(1)
    }
    console.log("   ✓ Configuración creada")
  } else {
    console.log("   ✓ Configuración encontrada")
    
    // Update with webhook info
    const { error: updateError } = await (supabase.from("settings_trello") as any)
      .update({
        webhook_id: WEBHOOK_ID,
        webhook_url: WEBHOOK_URL,
        updated_at: new Date().toISOString(),
      })
      .eq("id", trelloSettings.id)

    if (updateError) {
      console.error("   ❌ Error actualizando:", updateError)
      process.exit(1)
    }
    console.log("   ✓ Webhook actualizado en la base de datos")
  }

  console.log("")
  console.log("✅ ¡Base de datos actualizada!")
  console.log("")
  console.log("Resumen:")
  console.log(`   - Webhook ID: ${WEBHOOK_ID}`)
  console.log(`   - URL: ${WEBHOOK_URL}`)
  console.log(`   - Board Short ID: ${BOARD_SHORT_ID}`)
  console.log(`   - Board Full ID: ${BOARD_FULL_ID}`)
}

updateDatabase().catch(console.error)

