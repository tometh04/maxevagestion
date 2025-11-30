/**
 * Script para registrar webhooks de Trello para todas las agencias
 * Uso: npx tsx scripts/register-webhooks-all-agencies.ts <WEBHOOK_URL>
 * Ejemplo: npx tsx scripts/register-webhooks-all-agencies.ts https://tu-dominio.com/api/trello/webhook
 */

import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"
import { resolve } from "path"

// Cargar variables de entorno desde .env.local
config({ path: resolve(process.cwd(), ".env.local") })

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

// Obtener URL del webhook desde argumentos o variable de entorno
const webhookUrl = process.argv[2] || process.env.NEXT_PUBLIC_WEBHOOK_URL || process.env.WEBHOOK_URL

if (!webhookUrl) {
  console.error("❌ Error: Falta la URL del webhook")
  console.error("\nUso:")
  console.error("  npx tsx scripts/register-webhooks-all-agencies.ts <WEBHOOK_URL>")
  console.error("\nEjemplo:")
  console.error("  npx tsx scripts/register-webhooks-all-agencies.ts https://tu-dominio.com/api/trello/webhook")
  console.error("\nO configura la variable de entorno:")
  console.error("  NEXT_PUBLIC_WEBHOOK_URL=https://tu-dominio.com/api/trello/webhook")
  process.exit(1)
}

async function registerWebhookForAgency(agencyName: string, agencyId: string, boardId: string) {
  console.log(`\n${"=".repeat(60)}`)
  console.log(`📋 Registrando webhook para: ${agencyName}`)
  console.log(`${"=".repeat(60)}`)

  // Obtener configuración de Trello
  const { data: trelloSettings } = await supabase
    .from("settings_trello")
    .select("*")
    .eq("agency_id", agencyId)
    .single()

  if (!trelloSettings) {
    console.error(`   ❌ No hay configuración de Trello para ${agencyName}`)
    return { success: false }
  }

  const settings = trelloSettings as any

  try {
    // Obtener el board completo para obtener el ID completo
    let boardIdModel = boardId
    try {
      const boardResponse = await fetch(
        `https://api.trello.com/1/boards/${boardId}?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
      )
      if (boardResponse.ok) {
        const boardData = await boardResponse.json()
        boardIdModel = boardData.id
        console.log(`   ✓ Board ID completo: ${boardIdModel}`)
      }
    } catch (error) {
      console.warn(`   ⚠️  Usando Board ID corto: ${boardId}`)
    }

    // Verificar si ya existe un webhook para este board
    console.log(`\n   Verificando webhooks existentes...`)
    const webhooksResponse = await fetch(
      `https://api.trello.com/1/tokens/${TRELLO_TOKEN}/webhooks?key=${TRELLO_API_KEY}`
    )

    let existingWebhook: any = null
    if (webhooksResponse.ok) {
      const webhooks = await webhooksResponse.json()
      existingWebhook = webhooks.find(
        (wh: any) => wh.idModel === boardIdModel || wh.idModel === boardId
      )
    }

    if (existingWebhook) {
      console.log(`   ⚠️  Ya existe un webhook para este board`)
      console.log(`   Webhook ID: ${existingWebhook.id}`)
      console.log(`   URL actual: ${existingWebhook.callbackURL}`)
      
      // Actualizar la URL si es diferente
      if (existingWebhook.callbackURL !== webhookUrl) {
        console.log(`   Actualizando URL del webhook...`)
        const updateResponse = await fetch(
          `https://api.trello.com/1/webhooks/${existingWebhook.id}?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ callbackURL: webhookUrl }),
          }
        )

        if (updateResponse.ok) {
          console.log(`   ✓ Webhook actualizado`)
        } else {
          const errorText = await updateResponse.text()
          console.error(`   ❌ Error al actualizar webhook:`, errorText)
          return { success: false }
        }
      } else {
        console.log(`   ✓ URL del webhook ya es correcta`)
      }

      // Guardar webhook ID en la base de datos
      await supabase
        .from("settings_trello")
        .update({
          webhook_id: existingWebhook.id,
          webhook_url: webhookUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", settings.id)

      return { success: true, webhookId: existingWebhook.id, isNew: false }
    }

    // Registrar nuevo webhook
    console.log(`\n   Registrando nuevo webhook...`)
    console.log(`   URL: ${webhookUrl}`)
    console.log(`   Board: ${boardIdModel}`)

    const webhookResponse = await fetch("https://api.trello.com/1/webhooks/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: `ERP Lozada - ${agencyName} - ${boardId}`,
        callbackURL: webhookUrl,
        idModel: boardIdModel,
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
      console.error(`   ❌ Error al registrar webhook:`, errorData)
      return { success: false }
    }

    const webhookData = await webhookResponse.json()
    console.log(`   ✓ Webhook registrado exitosamente`)
    console.log(`   Webhook ID: ${webhookData.id}`)
    console.log(`   Estado: ${webhookData.active ? "✅ Activo" : "⚠️  Inactivo"}`)

    // Guardar webhook ID en la base de datos
    await supabase
      .from("settings_trello")
      .update({
        webhook_id: webhookData.id,
        webhook_url: webhookUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", settings.id)

    return { success: true, webhookId: webhookData.id, isNew: true }
  } catch (error) {
    console.error(`   ❌ Error inesperado:`, error)
    return { success: false }
  }
}

async function main() {
  console.log("🚀 Registro de Webhooks de Trello para Todas las Agencias")
  console.log("=".repeat(60))
  console.log(`\n📡 URL del Webhook: ${webhookUrl}`)

  // Obtener todas las agencias con configuración de Trello
  const { data: agencies } = await supabase
    .from("agencies")
    .select("id, name")
    .in("name", ["Rosario", "Madero"])

  if (!agencies || agencies.length === 0) {
    console.error("❌ No se encontraron agencias")
    process.exit(1)
  }

  const results = []
  for (const agency of agencies) {
    // Obtener configuración de Trello
    const { data: trelloSettings } = await supabase
      .from("settings_trello")
      .select("board_id")
      .eq("agency_id", agency.id)
      .single()

    if (!trelloSettings) {
      console.warn(`\n⚠️  No hay configuración de Trello para ${agency.name}, saltando...`)
      continue
    }

    const result = await registerWebhookForAgency(
      agency.name,
      agency.id,
      (trelloSettings as any).board_id
    )
    results.push({ agency: agency.name, ...result })
  }

  // Resumen
  console.log("\n" + "=".repeat(60))
  console.log("📊 RESUMEN")
  console.log("=".repeat(60))

  results.forEach((result) => {
    console.log(`\n${result.agency}:`)
    if (result.success) {
      console.log(`   ✅ Webhook ${result.isNew ? "registrado" : "actualizado"}`)
      console.log(`   Webhook ID: ${result.webhookId}`)
    } else {
      console.log(`   ❌ Error al registrar webhook`)
    }
  })

  console.log("\n" + "=".repeat(60))
  console.log("✅ Proceso completado!")
  console.log("=".repeat(60))
}

main()
  .then(() => {
    console.log("\n✅ Script completado")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n❌ Error:", error)
    process.exit(1)
  })

