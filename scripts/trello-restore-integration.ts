/**
 * Script de Restauración de la Integración de Trello
 * Restaura la integración a su estado funcional si se rompe
 * 
 * Uso: npx tsx scripts/trello-restore-integration.ts
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

const WEBHOOK_URL = process.env.NEXT_PUBLIC_APP_URL 
  ? `${process.env.NEXT_PUBLIC_APP_URL}/api/trello/webhook`
  : "https://www.maxevagestion.com/api/trello/webhook"

// Las credenciales se obtienen de la base de datos o variables de entorno
// NO hardcodear tokens aquí por seguridad
const TRELLO_API_KEY = process.env.TRELLO_API_KEY || ""
const TRELLO_TOKEN = process.env.TRELLO_TOKEN || ""

if (!TRELLO_API_KEY || !TRELLO_TOKEN) {
  console.warn("⚠️  TRELLO_API_KEY o TRELLO_TOKEN no configurados en variables de entorno")
  console.warn("   El script intentará usar las credenciales de la base de datos")
}

const AGENCIAS = {
  Rosario: {
    boardIdShort: "kZh4zJ0J",
    boardIdFull: "680965f3edccf6f26eda61ef",
  },
  Madero: {
    boardIdShort: "X4IFL8rx",
    boardIdFull: "680ce7e434b85f29813d4e6f",
  },
}

async function restoreIntegration() {
  console.log("🔧 RESTAURACIÓN DE INTEGRACIÓN TRELLO")
  console.log("=".repeat(70))
  console.log("")

  // 1. Verificar y restaurar configuración de Trello
  console.log("1️⃣ Verificando configuración de Trello...")
  const { data: agencies } = await supabase
    .from("agencies")
    .select("id, name")
    .in("name", ["Rosario", "Madero"])

  if (!agencies || agencies.length !== 2) {
    console.error("❌ No se encontraron ambas agencias")
    return
  }

  for (const agency of agencies) {
    const agencyConfig = AGENCIAS[agency.name as keyof typeof AGENCIAS]
    if (!agencyConfig) {
      console.warn(`⚠️  No hay configuración para ${agency.name}`)
      continue
    }

    console.log(`\n📋 Procesando ${agency.name}...`)

    // Verificar si existe configuración
    const { data: existing } = await supabase
      .from("settings_trello")
      .select("*")
      .eq("agency_id", agency.id)
      .single()

    // Obtener credenciales de variables de entorno o usar las existentes
    const apiKey = TRELLO_API_KEY || existing?.trello_api_key || ""
    const token = TRELLO_TOKEN || existing?.trello_token || ""

    if (!apiKey || !token) {
      console.error(`   ❌ No hay credenciales de Trello para ${agency.name}`)
      console.error(`   Configure TRELLO_API_KEY y TRELLO_TOKEN en variables de entorno`)
      continue
    }

    const settingsData = {
      agency_id: agency.id,
      trello_api_key: apiKey,
      trello_token: token,
      board_id: agencyConfig.boardIdShort,
      list_status_mapping: existing?.list_status_mapping || {},
      list_region_mapping: existing?.list_region_mapping || {},
      updated_at: new Date().toISOString(),
    }

    if (existing) {
      const { error: updateError } = await supabase
        .from("settings_trello")
        .update(settingsData)
        .eq("id", existing.id)

      if (updateError) {
        console.error(`   ❌ Error actualizando configuración:`, updateError.message)
      } else {
        console.log(`   ✅ Configuración actualizada`)
      }
    } else {
      const { error: insertError } = await supabase
        .from("settings_trello")
        .insert(settingsData)

      if (insertError) {
        console.error(`   ❌ Error creando configuración:`, insertError.message)
      } else {
        console.log(`   ✅ Configuración creada`)
      }
    }

    // 2. Verificar y restaurar webhooks
    console.log(`\n2️⃣ Verificando webhooks para ${agency.name}...`)
    
    // Obtener configuración actualizada
    const { data: settings } = await supabase
      .from("settings_trello")
      .select("*")
      .eq("agency_id", agency.id)
      .single()

    if (!settings) {
      console.error(`   ❌ No se pudo obtener configuración`)
      continue
    }

    try {
      // Obtener credenciales de la configuración
      const apiKey = settings.trello_api_key
      const token = settings.trello_token

      if (!apiKey || !token) {
        console.error(`   ❌ No hay credenciales de Trello en la configuración`)
        continue
      }

      // Obtener webhooks existentes
      const webhooksResponse = await fetch(
        `https://api.trello.com/1/tokens/${token}/webhooks?key=${apiKey}`
      )

      if (!webhooksResponse.ok) {
        console.error(`   ❌ Error al obtener webhooks: ${webhooksResponse.status}`)
        continue
      }

      const allWebhooks = await webhooksResponse.json()

      // Buscar webhook para este board
      const existingWebhook = allWebhooks.find((wh: any) => 
        wh.idModel === agencyConfig.boardIdFull || 
        wh.idModel === agencyConfig.boardIdShort
      )

      if (existingWebhook) {
        console.log(`   ✅ Webhook existente encontrado: ${existingWebhook.id}`)
        
        // Verificar si está activo
        if (!existingWebhook.active) {
          console.log(`   ⚠️  Webhook inactivo, intentando reactivar...`)
          // Nota: Trello no permite reactivar webhooks, hay que eliminarlo y crear uno nuevo
          try {
            await fetch(
              `https://api.trello.com/1/webhooks/${existingWebhook.id}?key=${apiKey}&token=${token}`,
              { method: "DELETE" }
            )
            console.log(`   🗑️  Webhook inactivo eliminado`)
          } catch (error) {
            console.error(`   ❌ Error eliminando webhook:`, error)
          }
        } else {
          // Actualizar en BD
          await supabase
            .from("settings_trello")
            .update({
              webhook_id: existingWebhook.id,
              webhook_url: existingWebhook.callbackURL,
              updated_at: new Date().toISOString(),
            })
            .eq("id", settings.id)
          
          console.log(`   ✅ Webhook activo y actualizado en BD`)
          continue
        }
      }

      // Crear nuevo webhook si no existe o fue eliminado
      console.log(`   📡 Creando nuevo webhook...`)
      const webhookResponse = await fetch("https://api.trello.com/1/webhooks/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          description: `MAXEVA GESTION - Lozada ${agency.name} (${agency.name})`,
          callbackURL: WEBHOOK_URL,
          idModel: agencyConfig.boardIdFull, // Usar ID completo
          key: apiKey,
          token: token,
        }),
      })

      if (!webhookResponse.ok) {
        const errorText = await webhookResponse.text()
        console.error(`   ❌ Error al crear webhook:`, errorText)
        continue
      }

      const webhookData = await webhookResponse.json()
      console.log(`   ✅ Webhook creado: ${webhookData.id}`)

      // Actualizar en BD
      await supabase
        .from("settings_trello")
        .update({
          webhook_id: webhookData.id,
          webhook_url: webhookData.callbackURL,
          updated_at: new Date().toISOString(),
        })
        .eq("id", settings.id)

      console.log(`   ✅ Webhook guardado en BD`)

    } catch (error: any) {
      console.error(`   ❌ Error procesando webhooks:`, error.message)
    }
  }

  console.log("\n" + "=".repeat(70))
  console.log("✅ RESTAURACIÓN COMPLETADA")
  console.log("=".repeat(70))
  console.log("")
  console.log("💡 Próximos pasos:")
  console.log("   1. Ejecutar: npx tsx scripts/trello-health-check.ts")
  console.log("   2. Si hay errores, ejecutar sincronización manual:")
  console.log("      npx tsx scripts/sync-both-agencies-complete.ts")
  console.log("")
}

restoreIntegration()
  .then(() => {
    console.log("✅ Script completado")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n❌ Error:", error)
    process.exit(1)
  })

