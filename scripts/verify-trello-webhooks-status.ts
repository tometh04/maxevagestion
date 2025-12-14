/**
 * Script para verificar el estado de los webhooks de Trello
 * Verifica si están registrados y activos para ambas agencias
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

async function verifyWebhooks() {
  console.log("🔍 Verificando estado de Webhooks de Trello")
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
    console.log(`   Webhook ID en BD: ${trelloSettings.webhook_id || "No configurado"}`)
    console.log(`   Webhook URL en BD: ${trelloSettings.webhook_url || "No configurado"}`)

    // Verificar webhooks en Trello
    try {
      const webhooksResponse = await fetch(
        `https://api.trello.com/1/tokens/${trelloSettings.trello_token}/webhooks?key=${trelloSettings.trello_api_key}`
      )

      if (!webhooksResponse.ok) {
        console.log("   ❌ Error al obtener webhooks de Trello")
        continue
      }

      const allWebhooks = await webhooksResponse.json()
      
      // Buscar webhooks para este board
      const boardWebhooks = allWebhooks.filter((wh: any) => {
        // Match por board ID (puede ser short o long ID)
        const whBoardId = wh.idModel || ""
        const settingsBoardId = trelloSettings.board_id || ""
        
        // Match exacto
        if (whBoardId === settingsBoardId) return true
        
        // Match por substring (para short/long ID)
        if (whBoardId.includes(settingsBoardId) || settingsBoardId.includes(whBoardId)) return true
        
        // Match por primeros 8 caracteres
        if (whBoardId.length >= 8 && settingsBoardId.length >= 8) {
          if (whBoardId.substring(0, 8) === settingsBoardId.substring(0, 8)) return true
        }
        
        return false
      })

      if (boardWebhooks.length === 0) {
        console.log("   ❌ No se encontraron webhooks registrados en Trello para este board")
        console.log("   💡 Necesitas registrar el webhook desde Settings → Trello → Webhooks")
        continue
      }

      console.log(`   ✅ Encontrados ${boardWebhooks.length} webhook(s):`)
      
      for (const webhook of boardWebhooks) {
        const isActive = webhook.active
        const status = isActive ? "✅ ACTIVO" : "❌ INACTIVO"
        
        console.log("")
        console.log(`   📡 Webhook ID: ${webhook.id}`)
        console.log(`      Estado: ${status}`)
        console.log(`      URL: ${webhook.callbackURL}`)
        console.log(`      Descripción: ${webhook.description || "N/A"}`)
        console.log(`      Board Model: ${webhook.idModel}`)
        
        // Verificar si la URL es accesible
        if (webhook.callbackURL) {
          try {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 5000)
            
            const testResponse = await fetch(webhook.callbackURL, {
              method: "HEAD",
              signal: controller.signal,
            })
            
            clearTimeout(timeoutId)
            const isAccessible = testResponse.ok || testResponse.status === 405 // 405 = Method Not Allowed pero el endpoint existe
            console.log(`      Accesibilidad: ${isAccessible ? "✅ Accesible" : "⚠️ No responde correctamente (Status: " + testResponse.status + ")"}`)
          } catch (error: any) {
            if (error.name === 'AbortError') {
              console.log(`      Accesibilidad: ❌ Timeout (no responde en 5 segundos)`)
            } else {
              console.log(`      Accesibilidad: ❌ No accesible (${error.message})`)
            }
          }
        }
        
        // Verificar si coincide con el webhook guardado en BD
        if (trelloSettings.webhook_id === webhook.id) {
          console.log(`      ✅ Coincide con el webhook guardado en BD`)
        } else {
          console.log(`      ⚠️  No coincide con el webhook guardado en BD (BD tiene: ${trelloSettings.webhook_id || "ninguno"})`)
        }
      }

      // Resumen
      const activeWebhooks = boardWebhooks.filter((wh: any) => wh.active)
      if (activeWebhooks.length > 0) {
        console.log(`\n   ✅ Sincronización en tiempo real: ACTIVA`)
        console.log(`      ${activeWebhooks.length} webhook(s) activo(s)`)
      } else {
        console.log(`\n   ❌ Sincronización en tiempo real: INACTIVA`)
        console.log(`      Todos los webhooks están inactivos`)
      }

    } catch (error: any) {
      console.error(`   ❌ Error verificando webhooks:`, error.message)
    }
  }

  console.log("\n" + "=".repeat(70))
  console.log("✅ Verificación completada")
  console.log("=".repeat(70))
  console.log("\n💡 Para probar la sincronización en tiempo real:")
  console.log("   1. Ve a Trello y crea una nueva tarjeta")
  console.log("   2. Mueve una tarjeta de lista")
  console.log("   3. Archiva una tarjeta")
  console.log("   4. Verifica en el sistema que los cambios se reflejen automáticamente")
  console.log("\n📊 Los logs de webhooks aparecen en Vercel → Functions → /api/trello/webhook")
}

verifyWebhooks()
  .then(() => {
    console.log("\n✅ Script completado")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n❌ Error:", error)
    process.exit(1)
  })

