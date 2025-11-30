#!/usr/bin/env tsx
/**
 * Script para registrar webhooks de Trello en producción
 * 
 * Uso:
 *   npx tsx scripts/register-trello-webhooks-production.ts <URL_PRODUCCION>
 * 
 * Ejemplo:
 *   npx tsx scripts/register-trello-webhooks-production.ts https://maxevagestion.vercel.app
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

async function registerWebhookForAgency(agencyName: string, agencyId: string, boardId: string, webhookUrl: string) {
  console.log(`\n📋 Registrando webhook para ${agencyName}...`)
  console.log(`   Board ID: ${boardId}`)
  console.log(`   Webhook URL: ${webhookUrl}`)

  // Get Trello settings
  const { data: settings, error: settingsError } = await supabase
    .from("settings_trello")
    .select("*")
    .eq("agency_id", agencyId)
    .single()

  if (settingsError || !settings) {
    console.error(`❌ No se encontró configuración de Trello para ${agencyName}`)
    return false
  }

  const trelloSettings = settings as any

  if (!trelloSettings.trello_api_key || !trelloSettings.trello_token) {
    console.error(`❌ Faltan credenciales de Trello para ${agencyName}`)
    return false
  }

  // Get the full board ID
  let boardIdModel = boardId
  try {
    const boardResponse = await fetch(
      `https://api.trello.com/1/boards/${boardId}?key=${trelloSettings.trello_api_key}&token=${trelloSettings.trello_token}`
    )
    if (boardResponse.ok) {
      const boardData = await boardResponse.json()
      boardIdModel = boardData.id
      console.log(`   ✅ Board ID completo: ${boardIdModel}`)
    }
  } catch (error) {
    console.warn(`   ⚠️ No se pudo obtener el board ID completo, usando el corto`)
  }

  // Check if webhook already exists
  try {
    const existingWebhooksResponse = await fetch(
      `https://api.trello.com/1/tokens/${trelloSettings.trello_token}/webhooks?key=${trelloSettings.trello_api_key}`
    )
    
    if (existingWebhooksResponse.ok) {
      const existingWebhooks = await existingWebhooksResponse.json()
      const existingWebhook = existingWebhooks.find(
        (wh: any) => wh.idModel === boardIdModel || wh.idModel === boardId
      )
      
      if (existingWebhook) {
        console.log(`   ℹ️ Ya existe un webhook para este board (ID: ${existingWebhook.id})`)
        console.log(`   URL actual: ${existingWebhook.callbackURL}`)
        
        // Update existing webhook
        const updateResponse = await fetch(`https://api.trello.com/1/webhooks/${existingWebhook.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            description: `MAXEVA GESTION - ${agencyName}`,
            callbackURL: webhookUrl,
            key: trelloSettings.trello_api_key,
            token: trelloSettings.trello_token,
          }),
        })

        if (updateResponse.ok) {
          const updatedWebhook = await updateResponse.json()
          console.log(`   ✅ Webhook actualizado exitosamente`)
          console.log(`   ID: ${updatedWebhook.id}`)
          console.log(`   Estado: ${updatedWebhook.active ? "✅ Activo" : "❌ Inactivo"}`)
          
          // Update in database
          await supabase
            .from("settings_trello")
            .update({
              webhook_id: updatedWebhook.id,
              webhook_url: webhookUrl,
              updated_at: new Date().toISOString(),
            })
            .eq("id", settings.id)
          
          return true
        } else {
          const errorText = await updateResponse.text()
          console.error(`   ❌ Error al actualizar webhook: ${errorText}`)
          return false
        }
      }
    }
  } catch (error) {
    console.warn(`   ⚠️ No se pudieron verificar webhooks existentes:`, error)
  }

  // Register new webhook
  try {
    const webhookResponse = await fetch("https://api.trello.com/1/webhooks/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        description: `MAXEVA GESTION - ${agencyName}`,
        callbackURL: webhookUrl,
        idModel: boardIdModel,
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
      console.error(`   ❌ Error al registrar webhook: ${errorData.message || errorText}`)
      return false
    }

    const webhookData = await webhookResponse.json()
    console.log(`   ✅ Webhook registrado exitosamente`)
    console.log(`   ID: ${webhookData.id}`)
    console.log(`   Estado: ${webhookData.active ? "✅ Activo" : "❌ Inactivo"}`)

    // Update in database
    await supabase
      .from("settings_trello")
      .update({
        webhook_id: webhookData.id,
        webhook_url: webhookUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", settings.id)

    return true
  } catch (error: any) {
    console.error(`   ❌ Error al registrar webhook: ${error.message}`)
    return false
  }
}

async function main() {
  const webhookUrl = process.argv[2]

  if (!webhookUrl) {
    console.error("❌ Error: Falta la URL de producción")
    console.error("\nUso:")
    console.error("  npx tsx scripts/register-trello-webhooks-production.ts <URL_PRODUCCION>")
    console.error("\nEjemplo:")
    console.error("  npx tsx scripts/register-trello-webhooks-production.ts https://maxevagestion.vercel.app")
    process.exit(1)
  }

  // Validar que la URL termine con /api/trello/webhook
  const finalWebhookUrl = webhookUrl.endsWith("/api/trello/webhook")
    ? webhookUrl
    : `${webhookUrl.replace(/\/$/, "")}/api/trello/webhook`

  console.log("🚀 Registrando webhooks de Trello en producción")
  console.log(`📍 URL del webhook: ${finalWebhookUrl}`)
  console.log("")

  // Get all agencies
  const { data: agencies, error: agenciesError } = await supabase
    .from("agencies")
    .select("id, name")
    .order("name")

  if (agenciesError || !agencies || agencies.length === 0) {
    console.error("❌ No se encontraron agencias")
    process.exit(1)
  }

  // Get Trello settings for each agency
  const { data: allSettings, error: settingsError } = await supabase
    .from("settings_trello")
    .select("*, agencies(id, name)")
    .in("agency_id", agencies.map((a) => a.id))

  if (settingsError || !allSettings || allSettings.length === 0) {
    console.error("❌ No se encontraron configuraciones de Trello")
    process.exit(1)
  }

  let successCount = 0
  let failCount = 0

  for (const setting of allSettings) {
    const agencyName = (setting as any).agencies?.name || "Sin nombre"
    const agencyId = setting.agency_id
    const boardId = setting.board_id

    if (!boardId) {
      console.warn(`⚠️ ${agencyName}: No tiene board_id configurado`)
      failCount++
      continue
    }

    const success = await registerWebhookForAgency(agencyName, agencyId, boardId, finalWebhookUrl)
    if (success) {
      successCount++
    } else {
      failCount++
    }
  }

  console.log("\n" + "=".repeat(50))
  console.log("📊 Resumen:")
  console.log(`   ✅ Exitosos: ${successCount}`)
  console.log(`   ❌ Fallidos: ${failCount}`)
  console.log("=".repeat(50))

  if (successCount > 0) {
    console.log("\n✅ Webhooks registrados. Prueba creando una tarjeta en Trello.")
  }

  process.exit(failCount > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error("❌ Error fatal:", error)
  process.exit(1)
})

