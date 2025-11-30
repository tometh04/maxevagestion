/**
 * Script para configurar Trello para todas las agencias
 * - Configura Board IDs
 * - Registra webhooks para cada agencia
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
  console.error("NEXT_PUBLIC_SUPABASE_URL:", supabaseUrl ? "✓" : "✗")
  console.error("SUPABASE_SERVICE_ROLE_KEY:", supabaseServiceKey ? "✓" : "✗")
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

// Configuración por agencia
const AGENCIES_CONFIG = [
  { name: "Rosario", boardId: "kZh4zJ0J" },
  { name: "Madero", boardId: "X4IFL8rx" },
]

// URL del webhook - Si no está en .env, se pedirá al usuario
// Puedes configurarla en .env.local como: NEXT_PUBLIC_WEBHOOK_URL=https://tu-dominio.com
const WEBHOOK_URL = process.env.NEXT_PUBLIC_WEBHOOK_URL || process.env.WEBHOOK_URL || ""

async function setupAgency(agencyName: string, boardId: string, webhookUrl: string) {
  console.log(`\n${"=".repeat(60)}`)
  console.log(`📋 Configurando agencia: ${agencyName}`)
  console.log(`${"=".repeat(60)}`)

  // 1. Obtener agencia
  console.log(`\n1. Obteniendo agencia ${agencyName}...`)
  const { data: agency, error: agencyError } = await supabase
    .from("agencies")
    .select("id, name")
    .eq("name", agencyName)
    .single()

  if (agencyError || !agency) {
    console.error(`   ❌ No se encontró agencia ${agencyName}. Error:`, agencyError?.message)
    return { success: false, agencyId: null }
  }

  const agencyId = agency.id
  console.log(`   ✓ Agencia: ${agency.name} (${agencyId})`)

  // 2. Obtener o crear configuración de Trello
  console.log(`\n2. Configurando Trello para ${agencyName}...`)
  
  const { data: existingSettings } = await supabase
    .from("settings_trello")
    .select("*")
    .eq("agency_id", agencyId)
    .maybeSingle()

  const settingsData = {
    agency_id: agencyId,
    trello_api_key: TRELLO_API_KEY,
    trello_token: TRELLO_TOKEN,
    board_id: boardId,
    list_status_mapping: {},
    list_region_mapping: {},
    updated_at: new Date().toISOString(),
  }

  let settingsId: string
  if (existingSettings) {
    console.log(`   ⚠️  Configuración existente encontrada, actualizando...`)
    const { data: updated, error: updateError } = await supabase
      .from("settings_trello")
      .update(settingsData)
      .eq("id", existingSettings.id)
      .select()
      .single()

    if (updateError) {
      console.error(`   ❌ Error al actualizar configuración:`, updateError)
      return { success: false, agencyId }
    }
    settingsId = (updated as any).id
    console.log(`   ✓ Configuración actualizada`)
  } else {
    console.log(`   Creando nueva configuración...`)
    const { data: created, error: createError } = await supabase
      .from("settings_trello")
      .insert(settingsData)
      .select()
      .single()

    if (createError) {
      console.error(`   ❌ Error al crear configuración:`, createError)
      return { success: false, agencyId }
    }
    settingsId = (created as any).id
    console.log(`   ✓ Configuración creada`)
  }

  console.log(`   ✓ Board ID: ${boardId}`)

  // 3. Obtener listas del board para mapeo automático
  console.log(`\n3. Obteniendo listas del board de Trello...`)
  try {
    const listsResponse = await fetch(
      `https://api.trello.com/1/boards/${boardId}/lists?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&filter=open`
    )

    if (listsResponse.ok) {
      const lists = await listsResponse.json()
      const activeLists = lists.filter((list: any) => !list.closed)
      console.log(`   ✓ ${activeLists.length} listas encontradas`)

      // Crear mapeo automático de estados
      const listStatusMapping: Record<string, string> = {}
      activeLists.forEach((list: any) => {
        const listName = list.name.toLowerCase()
        if (listName.includes("nuevo") || listName.includes("new") || listName.includes("pendiente")) {
          listStatusMapping[list.id] = "NEW"
        } else if (listName.includes("progreso") || listName.includes("progress") || listName.includes("trabajando")) {
          listStatusMapping[list.id] = "IN_PROGRESS"
        } else if (listName.includes("cotizado") || listName.includes("quoted") || listName.includes("presupuesto")) {
          listStatusMapping[list.id] = "QUOTED"
        } else if (listName.includes("ganado") || listName.includes("won") || listName.includes("cerrado")) {
          listStatusMapping[list.id] = "WON"
        } else if (listName.includes("perdido") || listName.includes("lost") || listName.includes("cancelado")) {
          listStatusMapping[list.id] = "LOST"
        } else {
          listStatusMapping[list.id] = "NEW" // Por defecto
        }
      })

      // Actualizar con mapeos
      await supabase
        .from("settings_trello")
        .update({
          list_status_mapping: listStatusMapping,
          updated_at: new Date().toISOString(),
        })
        .eq("id", settingsId)

      console.log(`   ✓ Mapeo de estados creado automáticamente`)
    } else {
      console.warn(`   ⚠️  No se pudieron obtener las listas (puede ser que el board no exista o las credenciales sean incorrectas)`)
    }
  } catch (error) {
    console.warn(`   ⚠️  Error al obtener listas:`, error)
  }

  // 4. Registrar webhook
  if (!webhookUrl) {
    console.log(`\n   ⚠️  No se proporcionó URL de webhook, saltando registro...`)
    return { success: true, agencyId, settingsId, webhookRegistered: false }
  }

  console.log(`\n4. Registrando webhook para ${agencyName}...`)
  console.log(`   URL: ${webhookUrl}`)
  console.log(`   Board ID: ${boardId}`)

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
        console.log(`   ✓ Board ID completo obtenido: ${boardIdModel}`)
      }
    } catch (error) {
      console.warn(`   ⚠️  No se pudo obtener el ID completo del board, usando el corto`)
    }

    // Verificar si ya existe un webhook para este board
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
      console.log(`   ⚠️  Ya existe un webhook para este board (ID: ${existingWebhook.id})`)
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
          console.error(`   ❌ Error al actualizar webhook`)
        }
      }

      // Guardar webhook ID en la base de datos
      await supabase
        .from("settings_trello")
        .update({
          webhook_id: existingWebhook.id,
          webhook_url: webhookUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", settingsId)

      return { success: true, agencyId, settingsId, webhookRegistered: true, webhookId: existingWebhook.id }
    }

    // Registrar nuevo webhook
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
      return { success: false, agencyId, settingsId, webhookRegistered: false }
    }

    const webhookData = await webhookResponse.json()
    console.log(`   ✓ Webhook registrado exitosamente`)
    console.log(`   Webhook ID: ${webhookData.id}`)
    console.log(`   Estado: ${webhookData.active ? "Activo" : "Inactivo"}`)

    // Guardar webhook ID en la base de datos
    await supabase
      .from("settings_trello")
      .update({
        webhook_id: webhookData.id,
        webhook_url: webhookUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", settingsId)

    return { success: true, agencyId, settingsId, webhookRegistered: true, webhookId: webhookData.id }
  } catch (error) {
    console.error(`   ❌ Error inesperado al registrar webhook:`, error)
    return { success: false, agencyId, settingsId, webhookRegistered: false }
  }
}

async function main() {
  console.log("🚀 Configuración Completa de Trello para Todas las Agencias")
  console.log("=".repeat(60))

  // Verificar URL del webhook
  let webhookUrl = WEBHOOK_URL
  if (!webhookUrl) {
    console.log("\n⚠️  No se encontró URL de webhook en variables de entorno")
    console.log("   Puedes configurarla en .env.local como:")
    console.log("   NEXT_PUBLIC_WEBHOOK_URL=https://tu-dominio.com/api/trello/webhook")
    console.log("\n   O proporcionarla ahora (presiona Enter para saltar):")
    
    // En un script real, podríamos usar readline, pero para simplificar, usaremos una variable
    // Si no está configurada, el script continuará sin registrar webhooks
    console.log("   ⚠️  Continuando sin registrar webhooks...")
    console.log("   Puedes registrarlos manualmente desde Settings > Trello > Webhooks")
  } else {
    console.log(`\n✓ URL de webhook encontrada: ${webhookUrl}`)
  }

  const results = []
  for (const agencyConfig of AGENCIES_CONFIG) {
    const result = await setupAgency(agencyConfig.name, agencyConfig.boardId, webhookUrl)
    results.push({ ...agencyConfig, ...result })
  }

  // Resumen
  console.log("\n" + "=".repeat(60))
  console.log("📊 RESUMEN")
  console.log("=".repeat(60))

  results.forEach((result) => {
    console.log(`\n${result.name}:`)
    console.log(`   Board ID: ${result.boardId}`)
    console.log(`   Configuración: ${result.success ? "✅" : "❌"}`)
    if (webhookUrl) {
      console.log(`   Webhook: ${result.webhookRegistered ? "✅ Registrado" : "❌ No registrado"}`)
      if (result.webhookId) {
        console.log(`   Webhook ID: ${result.webhookId}`)
      }
    } else {
      console.log(`   Webhook: ⚠️  No configurado (falta URL)`)
    }
  })

  console.log("\n" + "=".repeat(60))
  console.log("✅ Configuración completada!")
  console.log("=".repeat(60))
  console.log("\n💡 Próximos pasos:")
  console.log("   1. Si no se registraron webhooks, ve a Settings > Trello")
  console.log("   2. Selecciona cada agencia y registra el webhook manualmente")
  console.log("   3. Ejecuta la sincronización desde Settings > Trello > Sincronización")
  console.log("   4. Verifica los leads en la sección Leads seleccionando cada agencia")
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

