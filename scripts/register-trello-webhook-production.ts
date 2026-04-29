#!/usr/bin/env tsx
/**
 * Script para registrar webhooks de Trello en producción
 * 
 * Uso:
 *   npx tsx scripts/register-trello-webhook-production.ts <URL_PRODUCCION>
 * 
 * Ejemplo:
 *   npx tsx scripts/register-trello-webhook-production.ts https://app.vibook.ai
 */

import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import { resolve } from "path"

// Load environment variables
dotenv.config({ path: resolve(__dirname, "../.env.local") })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ Error: Faltan variables de entorno")
  console.error("   NEXT_PUBLIC_SUPABASE_URL:", SUPABASE_URL ? "✅" : "❌")
  console.error("   SUPABASE_SERVICE_ROLE_KEY:", SUPABASE_SERVICE_KEY ? "✅" : "❌")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function registerWebhookForAgency(agencyName: string, agencyId: string, boardId: string) {
  console.log(`\n📋 Procesando: ${agencyName}`)
  console.log(`   Agency ID: ${agencyId}`)
  console.log(`   Board ID: ${boardId}`)

  try {
    // Get Trello settings
    const { data: settings, error: settingsError } = await supabase
      .from("settings_trello")
      .select("*")
      .eq("agency_id", agencyId)
      .single()

    if (settingsError || !settings) {
      console.error(`   ❌ No se encontró configuración de Trello para ${agencyName}`)
      return false
    }

    if (!settings.trello_api_key || !settings.trello_token) {
      console.error(`   ❌ Credenciales de Trello no configuradas para ${agencyName}`)
      return false
    }

    // Get full board ID
    let boardIdModel = boardId
    try {
      const boardResponse = await fetch(
        `https://api.trello.com/1/boards/${boardId}?key=${settings.trello_api_key}&token=${settings.trello_token}`
      )
      if (boardResponse.ok) {
        const boardData = await boardResponse.json()
        boardIdModel = boardData.id
        console.log(`   ✅ Board ID completo: ${boardIdModel}`)
      }
    } catch (error: any) {
      console.warn(`   ⚠️  No se pudo obtener el board ID completo: ${error.message}`)
      console.warn(`   Continuando con el ID corto: ${boardId}`)
    }

    // Check for existing webhooks
    console.log(`   🔍 Verificando webhooks existentes...`)
    try {
      const existingWebhooksResponse = await fetch(
        `https://api.trello.com/1/tokens/${settings.trello_token}/webhooks?key=${settings.trello_api_key}`
      )

      if (existingWebhooksResponse.ok) {
        const existingWebhooks = await existingWebhooksResponse.json()
        
        // Find webhooks for this board
        const boardWebhooks = existingWebhooks.filter(
          (wh: any) => wh.idModel === boardIdModel || 
                      wh.idModel === boardId ||
                      wh.callbackURL === fullWebhookUrl
        )

        if (boardWebhooks.length > 0) {
          console.log(`   🗑️  Encontrados ${boardWebhooks.length} webhook(s) existente(s), eliminando...`)
          
          for (const existingWebhook of boardWebhooks) {
            try {
              const deleteResponse = await fetch(
                `https://api.trello.com/1/webhooks/${existingWebhook.id}?key=${settings.trello_api_key}&token=${settings.trello_token}`,
                { method: "DELETE" }
              )
              
              if (deleteResponse.ok) {
                console.log(`      ✅ Eliminado: ${existingWebhook.id}`)
              } else {
                console.warn(`      ⚠️  No se pudo eliminar: ${existingWebhook.id}`)
              }
            } catch (deleteError: any) {
              console.warn(`      ⚠️  Error eliminando webhook: ${deleteError.message}`)
            }
          }
        } else {
          console.log(`   ✅ No hay webhooks existentes`)
        }
      }
    } catch (error: any) {
      console.warn(`   ⚠️  Error verificando webhooks existentes: ${error.message}`)
      // Continue anyway
    }

    // Register new webhook
    console.log(`   📡 Registrando nuevo webhook...`)
    const webhookResponse = await fetch("https://api.trello.com/1/webhooks/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        description: `MAXEVA GESTION - ${agencyName} - ${boardIdModel}`,
        callbackURL: fullWebhookUrl,
        idModel: boardIdModel,
        key: settings.trello_api_key,
        token: settings.trello_token,
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
      console.error(`   ❌ Error al registrar webhook: ${errorData.message || errorText}`)
      return false
    }

    const webhookData = await webhookResponse.json()
    console.log(`   ✅ Webhook registrado exitosamente`)
    console.log(`      ID: ${webhookData.id}`)
    console.log(`      Estado: ${webhookData.active ? "✅ Activo" : "❌ Inactivo"}`)
    console.log(`      URL: ${webhookData.callbackURL}`)

    // Update in database
    const { error: updateError } = await supabase
      .from("settings_trello")
      .update({
        webhook_id: webhookData.id,
        webhook_url: fullWebhookUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", settings.id)

    if (updateError) {
      console.warn(`   ⚠️  No se pudo actualizar en la base de datos: ${updateError.message}`)
      console.warn(`   El webhook está registrado en Trello pero no se guardó el ID en la BD`)
    } else {
      console.log(`   ✅ Información guardada en la base de datos`)
    }

    return true
  } catch (error: any) {
    console.error(`   ❌ Error inesperado: ${error.message}`)
    return false
  }
}

async function main() {
  const webhookUrl = process.argv[2]

  if (!webhookUrl) {
    console.error("❌ Error: Falta la URL de producción")
    console.error("")
    console.error("Uso:")
    console.error("  npx tsx scripts/register-trello-webhook-production.ts <URL_PRODUCCION>")
    console.error("")
    console.error("Ejemplo:")
    console.error("  npx tsx scripts/register-trello-webhook-production.ts https://app.vibook.ai")
    process.exit(1)
  }

  // Validate URL
  if (!webhookUrl.startsWith("https://")) {
    console.error("❌ Error: La URL debe ser HTTPS")
    process.exit(1)
  }

  const fullWebhookUrl = webhookUrl.endsWith("/api/trello/webhook")
    ? webhookUrl
    : `${webhookUrl.replace(/\/$/, "")}/api/trello/webhook`

  console.log("🚀 Registro de Webhooks de Trello en Producción")
  console.log("=" .repeat(60))
  console.log(`📍 URL del Webhook: ${fullWebhookUrl}`)
  console.log("")

  // Verify endpoint is accessible
  console.log("🔍 Verificando que el endpoint es accesible...")
  try {
    const headResponse = await fetch(fullWebhookUrl, { method: "HEAD" })
    if (headResponse.ok) {
      console.log("✅ Endpoint accesible")
    } else {
      console.warn(`⚠️  Endpoint responde con status: ${headResponse.status}`)
    }
  } catch (error: any) {
    console.error(`❌ Error verificando endpoint: ${error.message}`)
    console.error("   Asegúrate de que la URL sea correcta y el servidor esté funcionando")
    process.exit(1)
  }

  console.log("")

  // Get all agencies with Trello configured
  const { data: agencies, error: agenciesError } = await supabase
    .from("agencies")
    .select("id, name")

  if (agenciesError || !agencies) {
    console.error("❌ Error obteniendo agencias:", agenciesError)
    process.exit(1)
  }

  const { data: trelloSettings, error: trelloError } = await supabase
    .from("settings_trello")
    .select("agency_id, board_id")

  if (trelloError) {
    console.error("❌ Error obteniendo configuración de Trello:", trelloError)
    process.exit(1)
  }

  if (!trelloSettings || trelloSettings.length === 0) {
    console.error("❌ No hay configuración de Trello")
    console.error("   Configura Trello primero desde Settings → Trello")
    process.exit(1)
  }

  console.log(`📊 Encontradas ${trelloSettings.length} agencia(s) con Trello configurado\n`)

  let successCount = 0
  let failCount = 0

  for (const trelloSetting of trelloSettings) {
    const agency = agencies.find((a) => a.id === trelloSetting.agency_id)
    if (!agency) {
      console.warn(`⚠️  Agencia no encontrada: ${trelloSetting.agency_id}`)
      continue
    }

    const success = await registerWebhookForAgency(
      agency.name,
      trelloSetting.agency_id,
      trelloSetting.board_id
    )

    if (success) {
      successCount++
    } else {
      failCount++
    }
  }

  console.log("\n" + "=".repeat(60))
  console.log("📊 RESUMEN")
  console.log("=".repeat(60))
  console.log(`✅ Exitosos: ${successCount}`)
  console.log(`❌ Fallidos: ${failCount}`)
  console.log("")

  if (successCount > 0) {
    console.log("🎉 Webhooks registrados exitosamente!")
    console.log("")
    console.log("📝 Próximos pasos:")
    console.log("   1. Ve a Settings → Trello → Webhooks")
    console.log("   2. Verifica que los webhooks aparecen como ✅ Activo")
    console.log("   3. Crea un card de prueba en Trello")
    console.log("   4. Verifica que aparece automáticamente en Sales → Leads")
  }

  if (failCount > 0) {
    console.log("")
    console.log("⚠️  Algunos webhooks no se pudieron registrar")
    console.log("   Revisa los errores arriba y vuelve a intentar")
    process.exit(1)
  }
}

main().catch((error) => {
  console.error("❌ Error fatal:", error)
  process.exit(1)
})

