/**
 * Script para registrar webhook de Trello para Rosario
 */

import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"
import { resolve } from "path"

config({ path: resolve(process.cwd(), ".env.local") })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing Supabase environment variables")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const WEBHOOK_URL = "https://www.maxevagestion.com/api/trello/webhook"

async function registerWebhookRosario() {
  console.log("🚀 Registrando Webhook de Trello para Rosario")
  console.log("=".repeat(70))
  console.log("")

  // 1. Obtener agencia Rosario
  const { data: agency } = await supabase
    .from("agencies")
    .select("id, name")
    .eq("name", "Rosario")
    .single()

  if (!agency) {
    console.error("❌ No se encontró agencia Rosario")
    return
  }

  console.log(`✅ Agencia: ${agency.name} (${agency.id})`)

  // 2. Obtener configuración de Trello
  const { data: settings } = await supabase
    .from("settings_trello")
    .select("*")
    .eq("agency_id", agency.id)
    .single()

  if (!settings) {
    console.error("❌ No hay configuración de Trello para Rosario")
    return
  }

  const trelloSettings = settings as any
  const shortBoardId = trelloSettings.board_id // kZh4zJ0J
  
  console.log(`✅ Board ID corto: ${shortBoardId}`)

  // 3. Obtener board ID completo desde Trello
  console.log("\n📥 Obteniendo board ID completo desde Trello...")
  const boardResponse = await fetch(
    `https://api.trello.com/1/boards/${shortBoardId}?key=${trelloSettings.trello_api_key}&token=${trelloSettings.trello_token}&fields=id,shortLink,name`
  )

  if (!boardResponse.ok) {
    console.error(`❌ Error obteniendo board: ${boardResponse.status}`)
    return
  }

  const board = await boardResponse.json()
  const fullBoardId = board.id // 680965f3edccf6f26eda61ef
  
  console.log(`✅ Board ID completo: ${fullBoardId}`)
  console.log(`✅ Board nombre: ${board.name}`)

  // 4. Verificar webhooks existentes
  console.log("\n🔍 Verificando webhooks existentes...")
  const webhooksResponse = await fetch(
    `https://api.trello.com/1/tokens/${trelloSettings.trello_token}/webhooks?key=${trelloSettings.trello_api_key}`
  )

  if (!webhooksResponse.ok) {
    console.error(`❌ Error obteniendo webhooks: ${webhooksResponse.statusText}`)
    return
  }

  const existingWebhooks = await webhooksResponse.json()
  console.log(`📊 Total webhooks en Trello: ${existingWebhooks.length}`)

  // Buscar webhook existente para este board
  const existingWebhook = existingWebhooks.find((wh: any) => {
    return wh.idModel === fullBoardId || wh.idModel === shortBoardId
  })

  if (existingWebhook) {
    console.log(`\n✅ Ya existe un webhook para este board:`)
    console.log(`   ID: ${existingWebhook.id}`)
    console.log(`   URL: ${existingWebhook.callbackURL}`)
    console.log(`   Estado: ${existingWebhook.active ? "✅ Activo" : "❌ Inactivo"}`)
    
    // Actualizar en BD
    const { error: updateError } = await supabase
      .from("settings_trello")
      .update({
        webhook_id: existingWebhook.id,
        webhook_url: existingWebhook.callbackURL,
        updated_at: new Date().toISOString(),
      })
      .eq("id", settings.id)

    if (updateError) {
      console.error(`   ❌ Error actualizando en BD:`, updateError.message)
    } else {
      console.log(`   ✅ Información actualizada en BD`)
    }
    
    return
  }

  // 5. Registrar nuevo webhook
  console.log("\n📡 Registrando nuevo webhook...")
  const webhookResponse = await fetch("https://api.trello.com/1/webhooks/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      description: `MAXEVA GESTION - Lozada Rosario (Rosario)`,
      callbackURL: WEBHOOK_URL,
      idModel: fullBoardId, // Usar ID completo
      key: trelloSettings.trello_api_key,
      token: trelloSettings.trello_token,
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
    console.error(`❌ Error al registrar webhook:`, errorData)
    return
  }

  const webhookData = await webhookResponse.json()
  console.log(`✅ Webhook registrado exitosamente:`)
  console.log(`   ID: ${webhookData.id}`)
  console.log(`   URL: ${webhookData.callbackURL}`)
  console.log(`   Estado: ${webhookData.active ? "✅ Activo" : "❌ Inactivo"}`)

  // 6. Actualizar en BD
  const { error: updateError } = await supabase
    .from("settings_trello")
    .update({
      webhook_id: webhookData.id,
      webhook_url: webhookData.callbackURL,
      updated_at: new Date().toISOString(),
    })
    .eq("id", settings.id)

  if (updateError) {
    console.error(`❌ Error actualizando en BD:`, updateError.message)
  } else {
    console.log(`✅ Información guardada en BD`)
  }

  console.log("\n" + "=".repeat(70))
  console.log("✅ Webhook registrado y configurado correctamente")
  console.log("=".repeat(70))
}

registerWebhookRosario()
  .then(() => {
    console.log("\n✅ Script completado")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n❌ Error:", error)
    process.exit(1)
  })

