/**
 * Script para actualizar la información del webhook en la BD
 * Actualiza webhook_id y webhook_url en settings_trello
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

async function updateWebhookInDB() {
  console.log("🔄 Actualizando información de webhooks en la BD")
  console.log("=".repeat(70))
  console.log("")

  // Obtener todas las agencias con configuración de Trello
  const { data: agencies } = await supabase
    .from("agencies")
    .select("id, name")
    .order("name")

  if (!agencies || agencies.length === 0) {
    console.error("❌ No se encontraron agencias")
    return
  }

  for (const agency of agencies) {
    console.log(`\n📋 Agencia: ${agency.name}`)
    console.log("-".repeat(70))

    // Obtener configuración de Trello
    const { data: settings } = await supabase
      .from("settings_trello")
      .select("*")
      .eq("agency_id", agency.id)
      .single()

    if (!settings) {
      console.log("   ⚠️  No hay configuración de Trello")
      continue
    }

    const trelloSettings = settings as any
    console.log(`   Board ID: ${trelloSettings.board_id}`)

    // Obtener webhooks de Trello
    try {
      const webhooksResponse = await fetch(
        `https://api.trello.com/1/tokens/${trelloSettings.trello_token}/webhooks?key=${trelloSettings.trello_api_key}`
      )

      if (!webhooksResponse.ok) {
        console.log("   ❌ Error al obtener webhooks de Trello")
        continue
      }

      const allWebhooks = await webhooksResponse.json()
      
      // Obtener board ID completo desde Trello para matching preciso
      let fullBoardId = trelloSettings.board_id
      try {
        const boardResponse = await fetch(
          `https://api.trello.com/1/boards/${trelloSettings.board_id}?key=${trelloSettings.trello_api_key}&token=${trelloSettings.trello_token}&fields=id,shortLink`
        )
        if (boardResponse.ok) {
          const boardData = await boardResponse.json()
          fullBoardId = boardData.id
          console.log(`   Board ID completo: ${fullBoardId}`)
        }
      } catch (error) {
        console.warn(`   ⚠️  No se pudo obtener Board ID completo, usando corto`)
      }

      // Buscar webhook para este board (match exacto con board ID completo o corto)
      const boardWebhooks = allWebhooks.filter((wh: any) => {
        const whBoardId = wh.idModel || ""
        const shortBoardId = trelloSettings.board_id || ""
        
        // Match exacto con ID completo
        if (whBoardId === fullBoardId) return true
        
        // Match exacto con ID corto
        if (whBoardId === shortBoardId) return true
        
        // Match por substring (para variaciones)
        if (whBoardId.includes(shortBoardId) || shortBoardId.includes(whBoardId)) return true
        if (whBoardId.includes(fullBoardId) || fullBoardId.includes(whBoardId)) return true
        
        // Match por primeros 8 caracteres
        if (whBoardId.length >= 8 && shortBoardId.length >= 8) {
          if (whBoardId.substring(0, 8) === shortBoardId.substring(0, 8)) return true
        }
        
        return false
      })

      if (boardWebhooks.length === 0) {
        console.log("   ⚠️  No se encontró webhook para este board")
        continue
      }

      // Usar el primer webhook activo o el primero disponible
      const webhook = boardWebhooks.find((wh: any) => wh.active) || boardWebhooks[0]
      
      console.log(`   📡 Webhook encontrado:`)
      console.log(`      ID: ${webhook.id}`)
      console.log(`      URL: ${webhook.callbackURL}`)
      console.log(`      Estado: ${webhook.active ? "✅ Activo" : "❌ Inactivo"}`)
      console.log(`      Board Model: ${webhook.idModel}`)

      // Actualizar en BD
      const { error: updateError } = await supabase
        .from("settings_trello")
        .update({
          webhook_id: webhook.id,
          webhook_url: webhook.callbackURL,
          updated_at: new Date().toISOString(),
        })
        .eq("id", settings.id)

      if (updateError) {
        console.error(`   ❌ Error actualizando en BD:`, updateError.message)
      } else {
        console.log(`   ✅ Información actualizada en BD`)
      }

    } catch (error: any) {
      console.error(`   ❌ Error:`, error.message)
    }
  }

  console.log("\n" + "=".repeat(70))
  console.log("✅ Actualización completada")
  console.log("=".repeat(70))
}

updateWebhookInDB()
  .then(() => {
    console.log("\n✅ Script completado")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n❌ Error:", error)
    process.exit(1)
  })

