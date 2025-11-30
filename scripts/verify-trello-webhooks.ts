#!/usr/bin/env tsx
/**
 * Script para verificar el estado de los webhooks de Trello
 * 
 * Uso:
 *   npx tsx scripts/verify-trello-webhooks.ts
 */

import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import { resolve } from "path"

// Cargar variables de entorno
dotenv.config({ path: resolve(__dirname, "../.env.local") })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Faltan variables de entorno:")
  console.error("   - NEXT_PUBLIC_SUPABASE_URL")
  console.error("   - SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function verifyWebhooks() {
  console.log("🔍 Verificando webhooks de Trello...\n")

  // Obtener todas las agencias
  const { data: agencies, error: agenciesError } = await supabase
    .from("agencies")
    .select("id, name")
    .order("name")

  if (agenciesError || !agencies || agencies.length === 0) {
    console.error("❌ No se encontraron agencias")
    process.exit(1)
  }

  for (const agency of agencies) {
    console.log(`\n📋 Agencia: ${agency.name}`)
    console.log("=" .repeat(50))

    // Obtener configuración de Trello
    const { data: trelloSettings } = await supabase
      .from("settings_trello")
      .select("*")
      .eq("agency_id", agency.id)
      .single()

    if (!trelloSettings) {
      console.log("   ⚠️ No hay configuración de Trello para esta agencia")
      continue
    }

    const settings = trelloSettings as any

    if (!settings.trello_api_key || !settings.trello_token) {
      console.log("   ⚠️ Faltan credenciales de Trello")
      continue
    }

    console.log(`   Board ID: ${settings.board_id}`)
    console.log(`   Webhook URL guardada: ${settings.webhook_url || "No configurada"}`)

    // Obtener webhooks desde Trello
    try {
      const webhooksResponse = await fetch(
        `https://api.trello.com/1/tokens/${settings.trello_token}/webhooks?key=${settings.trello_api_key}`
      )

      if (!webhooksResponse.ok) {
        console.log("   ❌ Error al obtener webhooks de Trello")
        continue
      }

      const webhooks = await webhooksResponse.json()

      // Filtrar webhooks para este board
      const boardWebhooks = webhooks.filter(
        (wh: any) => wh.idModel === settings.board_id || 
                     wh.idModel?.startsWith(settings.board_id) ||
                     settings.board_id?.startsWith(wh.idModel)
      )

      if (boardWebhooks.length === 0) {
        console.log("   ⚠️ No se encontraron webhooks para este board")
        console.log(`   💡 Ejecuta: npx tsx scripts/register-trello-webhooks-production.ts <URL_PRODUCCION>`)
        continue
      }

      console.log(`   ✅ Encontrados ${boardWebhooks.length} webhook(s):\n`)

      for (const webhook of boardWebhooks) {
        console.log(`   📡 Webhook ID: ${webhook.id}`)
        console.log(`      URL: ${webhook.callbackURL}`)
        console.log(`      Estado: ${webhook.active ? "✅ Activo" : "❌ Inactivo"}`)
        console.log(`      Board: ${webhook.idModel}`)
        console.log(`      Descripción: ${webhook.description || "N/A"}`)
        
        // Verificar si la URL es accesible
        if (webhook.callbackURL) {
          try {
            const testResponse = await fetch(webhook.callbackURL, {
              method: "HEAD",
              signal: AbortSignal.timeout(5000),
            })
            console.log(`      Accesibilidad: ${testResponse.ok ? "✅ Accesible" : "⚠️ No responde correctamente"}`)
          } catch (error) {
            console.log(`      Accesibilidad: ❌ No accesible (${(error as Error).message})`)
          }
        }
        console.log("")
      }

      // Verificar si la URL guardada coincide con la registrada
      if (settings.webhook_url) {
        const matchingWebhook = boardWebhooks.find(
          (wh: any) => wh.callbackURL === settings.webhook_url
        )
        if (!matchingWebhook) {
          console.log("   ⚠️ La URL guardada no coincide con ningún webhook activo")
        }
      }

    } catch (error) {
      console.error(`   ❌ Error al verificar webhooks:`, error)
    }
  }

  console.log("\n" + "=".repeat(50))
  console.log("✅ Verificación completada")
}

verifyWebhooks().catch(console.error)

