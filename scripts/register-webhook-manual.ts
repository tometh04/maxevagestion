/**
 * Script manual para registrar el webhook de Trello
 * Ejecuta este script para registrar el webhook directamente
 */

import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase environment variables")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Credenciales de Trello desde variables de entorno
const TRELLO_API_KEY = process.env.TRELLO_API_KEY || ""
const TRELLO_TOKEN = process.env.TRELLO_TOKEN || ""

if (!TRELLO_API_KEY || !TRELLO_TOKEN) {
  console.error("Missing Trello environment variables (TRELLO_API_KEY, TRELLO_TOKEN)")
  process.exit(1)
}
const BOARD_ID = "kZh4zJ0J"
const WEBHOOK_URL = "https://silly-islands-own.loca.lt/api/trello/webhook"

async function registerWebhook() {
  console.log("🔄 Registrando webhook de Trello...")
  console.log("")

  // 1. Primero, obtener o crear la configuración de Trello
  console.log("1. Verificando configuración de Trello...")
  
  // Obtener todas las agencias
  const { data: agencies, error: agenciesError } = await supabase
    .from("agencies")
    .select("id, name")
    .limit(1)

  if (agenciesError || !agencies || agencies.length === 0) {
    console.error("❌ No se encontraron agencias. Error:", agenciesError)
    process.exit(1)
  }

  const agencyId = agencies[0].id
  console.log(`   ✓ Agencia encontrada: ${agencies[0].name} (${agencyId})`)

  // Verificar si existe configuración de Trello
  const { data: existingSettings } = await supabase
    .from("settings_trello")
    .select("*")
    .eq("agency_id", agencyId)
    .single()

  let settingsId: string

  if (existingSettings) {
    console.log("   ✓ Configuración de Trello encontrada, actualizando...")
    settingsId = existingSettings.id
    
    // Actualizar credenciales
    const { error: updateError } = await (supabase.from("settings_trello") as any)
      .update({
        trello_api_key: TRELLO_API_KEY,
        trello_token: TRELLO_TOKEN,
        board_id: BOARD_ID,
        updated_at: new Date().toISOString(),
      })
      .eq("id", settingsId)

    if (updateError) {
      console.error("   ❌ Error actualizando configuración:", updateError)
      process.exit(1)
    }
    console.log("   ✓ Credenciales actualizadas")
  } else {
    console.log("   ⚠️  No existe configuración, creando...")
    const { data: newSettings, error: insertError } = await (supabase.from("settings_trello") as any)
      .insert({
        agency_id: agencyId,
        trello_api_key: TRELLO_API_KEY,
        trello_token: TRELLO_TOKEN,
        board_id: BOARD_ID,
        list_status_mapping: {},
        list_region_mapping: {},
      })
      .select()
      .single()

    if (insertError || !newSettings) {
      console.error("   ❌ Error creando configuración:", insertError)
      process.exit(1)
    }
    settingsId = newSettings.id
    console.log("   ✓ Configuración creada")
  }

  // 2. Registrar webhook con Trello
  console.log("")
  console.log("2. Registrando webhook en Trello...")
  console.log(`   URL: ${WEBHOOK_URL}`)
  console.log(`   Board ID: ${BOARD_ID}`)

  try {
    const webhookResponse = await fetch("https://api.trello.com/1/webhooks/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        description: `ERP Lozada - ${BOARD_ID}`,
        callbackURL: WEBHOOK_URL,
        idModel: BOARD_ID,
        key: TRELLO_API_KEY,
        token: TRELLO_TOKEN,
      }),
    })

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text()
      let errorData
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { message: errorText }
      }
      console.error("   ❌ Error de Trello:", errorData)
      console.error("   Status:", webhookResponse.status)
      process.exit(1)
    }

    const webhookData = await webhookResponse.json()
    console.log("   ✓ Webhook registrado en Trello")
    console.log(`   Webhook ID: ${webhookData.id}`)
    console.log(`   Estado: ${webhookData.active ? "Activo" : "Inactivo"}`)

    // 3. Guardar webhook_id en la base de datos
    console.log("")
    console.log("3. Guardando información del webhook en la base de datos...")
    
    const { error: saveError } = await (supabase.from("settings_trello") as any)
      .update({
        webhook_id: webhookData.id,
        webhook_url: WEBHOOK_URL,
        updated_at: new Date().toISOString(),
      })
      .eq("id", settingsId)

    if (saveError) {
      console.error("   ⚠️  Error guardando webhook_id (pero el webhook está registrado en Trello):", saveError)
    } else {
      console.log("   ✓ Información guardada en la base de datos")
    }

    console.log("")
    console.log("✅ ¡Webhook registrado exitosamente!")
    console.log("")
    console.log("Resumen:")
    console.log(`   - Webhook ID: ${webhookData.id}`)
    console.log(`   - URL: ${WEBHOOK_URL}`)
    console.log(`   - Board ID: ${BOARD_ID}`)
    console.log(`   - Estado: ${webhookData.active ? "Activo" : "Inactivo"}`)
  } catch (error) {
    console.error("❌ Error inesperado:", error)
    process.exit(1)
  }
}

registerWebhook().catch(console.error)

