#!/usr/bin/env tsx
/**
 * Script para arreglar el webhook de Trello para Madero
 * Elimina webhooks incorrectos y registra uno nuevo con el board ID correcto
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

async function fixWebhook() {
  console.log("🔧 ARREGLANDO WEBHOOK DE TRELLO - MADERO")
  console.log("=".repeat(60))
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

  console.log(`✅ Agencia: ${madero.name}`)

  // 2. Obtener configuración
  const { data: settings } = await supabase
    .from("settings_trello")
    .select("*")
    .eq("agency_id", madero.id)
    .single()

  if (!settings) {
    console.error("❌ No hay configuración de Trello para Madero")
    console.log("💡 Primero configura las credenciales en Settings > Trello")
    return
  }

  console.log(`✅ Board ID (corto): ${settings.board_id}`)

  // 3. Obtener board ID completo desde Trello
  console.log("")
  console.log("📥 Obteniendo board ID completo desde Trello...")
  const boardResponse = await fetch(
    `https://api.trello.com/1/boards/${settings.board_id}?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&fields=id,shortLink,name`
  )

  if (!boardResponse.ok) {
    console.error(`❌ Error obteniendo board: ${boardResponse.status}`)
    return
  }

  const board = await boardResponse.json()
  const fullBoardId = board.id
  const shortBoardId = board.shortLink

  console.log(`✅ Board ID completo: ${fullBoardId}`)
  console.log(`✅ Board ID corto: ${shortBoardId}`)
  console.log(`✅ Board nombre: ${board.name}`)

  // 4. Obtener todos los webhooks
  console.log("")
  console.log("📋 Obteniendo webhooks existentes...")
  const webhooksResponse = await fetch(
    `https://api.trello.com/1/tokens/${TRELLO_TOKEN}/webhooks?key=${TRELLO_API_KEY}`
  )

  if (!webhooksResponse.ok) {
    console.error(`❌ Error obteniendo webhooks: ${webhooksResponse.status}`)
    return
  }

  const webhooks = await webhooksResponse.json()
  console.log(`   Total webhooks: ${webhooks.length}`)

  // 5. Eliminar webhooks incorrectos o duplicados para Madero
  console.log("")
  console.log("🗑️  Eliminando webhooks incorrectos...")
  const webhookUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/trello/webhook`
    : "https://www.maxevagestion.com/api/trello/webhook"

  for (const webhook of webhooks) {
    // Eliminar si:
    // - No es para nuestro board (ni full ni short ID)
    // - Es para nuestro callback URL pero board incorrecto
    const isForOurBoard =
      webhook.idModel === fullBoardId || webhook.idModel === shortBoardId || webhook.idModel === settings.board_id
    const isOurCallback = webhook.callbackURL?.includes("/api/trello/webhook")

    if (!isForOurBoard || (isOurCallback && !isForOurBoard)) {
      // Verificar si es específicamente para el board de Madero (no tocar los de Rosario)
      // Si no coincide con nuestro board, solo eliminarlo si es un callback nuestro
      if (isOurCallback && !isForOurBoard) {
        console.log(`   🗑️  Eliminando webhook ${webhook.id} (board incorrecto: ${webhook.idModel})`)
        try {
          const deleteResponse = await fetch(
            `https://api.trello.com/1/webhooks/${webhook.id}?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
            { method: "DELETE" }
          )
          if (deleteResponse.ok) {
            console.log(`      ✅ Eliminado`)
          } else {
            console.log(`      ❌ Error: ${deleteResponse.status}`)
          }
        } catch (error: any) {
          console.log(`      ❌ Error: ${error.message}`)
        }
      }
    } else {
      console.log(`   ✅ Webhook ${webhook.id} es correcto (board: ${webhook.idModel})`)
    }
  }

  // 6. Verificar si ya existe un webhook correcto para Madero
  const correctWebhook = webhooks.find(
    (wh: any) =>
      (wh.idModel === fullBoardId || wh.idModel === shortBoardId) && wh.callbackURL?.includes("/api/trello/webhook")
  )

  if (correctWebhook) {
    console.log("")
    console.log("✅ Ya existe un webhook correcto:")
    console.log(`   ID: ${correctWebhook.id}`)
    console.log(`   URL: ${correctWebhook.callbackURL}`)
    console.log(`   Board: ${correctWebhook.idModel}`)
    console.log(`   Activo: ${correctWebhook.active ? "✅" : "❌"}`)
    return
  }

  // 7. Registrar nuevo webhook
  console.log("")
  console.log("🔗 Registrando nuevo webhook...")
  console.log(`   URL: ${webhookUrl}`)
  console.log(`   Board ID: ${fullBoardId}`)

  const newWebhookResponse = await fetch("https://api.trello.com/1/webhooks/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      description: `MAXEVA GESTION - ${board.name} (Madero)`,
      callbackURL: webhookUrl,
      idModel: fullBoardId, // Usar ID completo
      key: TRELLO_API_KEY,
      token: TRELLO_TOKEN,
    }),
  })

  if (!newWebhookResponse.ok) {
    const errorText = await newWebhookResponse.text()
    console.error(`❌ Error registrando webhook: ${newWebhookResponse.status}`)
    console.error(`   ${errorText}`)
    return
  }

  const newWebhook = await newWebhookResponse.json()
  console.log("")
  console.log("✅ Webhook registrado exitosamente:")
  console.log(`   ID: ${newWebhook.id}`)
  console.log(`   URL: ${newWebhook.callbackURL}`)
  console.log(`   Board: ${newWebhook.idModel}`)
  console.log("")
  console.log("=".repeat(60))
  console.log("✅ WEBHOOK CONFIGURADO CORRECTAMENTE PARA MADERO")
  console.log("=".repeat(60))
  console.log("")
  console.log("💡 Ahora las cards nuevas en Trello se sincronizarán automáticamente")
}

fixWebhook()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error("❌ Error fatal:", error)
    process.exit(1)
  })

