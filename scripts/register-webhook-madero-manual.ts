/**
 * Script para registrar webhook de Madero manualmente
 * Asegúrate de que el servidor esté corriendo antes de ejecutar este script
 */

import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"
import { resolve } from "path"

config({ path: resolve(process.cwd(), ".env.local") })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase environment variables")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const TRELLO_API_KEY = process.env.TRELLO_API_KEY || ""
const TRELLO_TOKEN = process.env.TRELLO_TOKEN || ""

if (!TRELLO_API_KEY || !TRELLO_TOKEN) {
  console.error("Missing Trello environment variables (TRELLO_API_KEY, TRELLO_TOKEN)")
  process.exit(1)
}
const WEBHOOK_URL = "https://silly-islands-own.loca.lt/api/trello/webhook"
const MADERO_BOARD_ID = "X4IFL8rx"

async function registerWebhook() {
  console.log("🚀 Registrando webhook para Madero")
  console.log("=".repeat(60))
  console.log(`\n⚠️  IMPORTANTE: Asegúrate de que el servidor esté corriendo en el puerto 3044`)
  console.log(`   y que loca.lt esté activo antes de continuar.\n`)

  // 1. Obtener agencia Madero
  console.log("1. Obteniendo agencia Madero...")
  const { data: agency } = await supabase
    .from("agencies")
    .select("id, name")
    .eq("name", "Madero")
    .single()

  if (!agency) {
    console.error("❌ No se encontró agencia Madero")
    process.exit(1)
  }

  console.log(`   ✓ Agencia: ${agency.name} (${agency.id})`)

  // 2. Obtener configuración de Trello
  console.log("\n2. Obteniendo configuración de Trello...")
  const { data: trelloSettings } = await supabase
    .from("settings_trello")
    .select("*")
    .eq("agency_id", agency.id)
    .single()

  if (!trelloSettings) {
    console.error("❌ No hay configuración de Trello para Madero")
    process.exit(1)
  }

  console.log(`   ✓ Board ID: ${(trelloSettings as any).board_id}`)

  // 3. Obtener Board ID completo
  console.log("\n3. Obteniendo Board ID completo...")
  let boardIdModel = MADERO_BOARD_ID
  try {
    const boardResponse = await fetch(
      `https://api.trello.com/1/boards/${MADERO_BOARD_ID}?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`
    )
    if (boardResponse.ok) {
      const boardData = await boardResponse.json()
      boardIdModel = boardData.id
      console.log(`   ✓ Board ID completo: ${boardIdModel}`)
    }
  } catch (error) {
    console.warn(`   ⚠️  Error al obtener Board ID completo, usando el corto`)
  }

  // 4. Verificar webhooks existentes
  console.log("\n4. Verificando webhooks existentes...")
  const webhooksResponse = await fetch(
    `https://api.trello.com/1/tokens/${TRELLO_TOKEN}/webhooks?key=${TRELLO_API_KEY}`
  )

  if (webhooksResponse.ok) {
    const webhooks = await webhooksResponse.json()
    console.log(`   ✓ Encontrados ${webhooks.length} webhooks en total`)
    
    // Buscar si ya existe uno para este board
    const existingWebhook = webhooks.find(
      (wh: any) => wh.idModel === boardIdModel || wh.idModel === MADERO_BOARD_ID
    )

    if (existingWebhook) {
      console.log(`   ⚠️  Ya existe un webhook para este board:`)
      console.log(`      ID: ${existingWebhook.id}`)
      console.log(`      URL: ${existingWebhook.callbackURL}`)
      console.log(`      Estado: ${existingWebhook.active ? "Activo" : "Inactivo"}`)
      
      if (existingWebhook.callbackURL === WEBHOOK_URL) {
        console.log(`   ✓ La URL ya es correcta, actualizando en la base de datos...`)
        await supabase
          .from("settings_trello")
          .update({
            webhook_id: existingWebhook.id,
            webhook_url: WEBHOOK_URL,
            updated_at: new Date().toISOString(),
          })
          .eq("id", (trelloSettings as any).id)
        console.log(`   ✅ Webhook ya está registrado y actualizado en la BD`)
        return
      }
    }
  }

  // 5. Registrar nuevo webhook
  console.log("\n5. Registrando nuevo webhook...")
  console.log(`   URL: ${WEBHOOK_URL}`)
  console.log(`   Board: ${boardIdModel}`)
  console.log(`   Descripción: ERP Lozada - Madero - ${MADERO_BOARD_ID}`)

  // Primero, verificar que la URL responde (opcional, pero útil)
  console.log(`\n   Verificando que la URL responde...`)
  try {
    const testResponse = await fetch(WEBHOOK_URL, { method: "GET" })
    if (testResponse.status === 200 || testResponse.status === 405) {
      console.log(`   ✓ URL responde correctamente (status: ${testResponse.status})`)
    } else {
      console.warn(`   ⚠️  URL responde con status: ${testResponse.status}`)
      console.warn(`   Esto puede causar problemas al registrar el webhook`)
    }
  } catch (error) {
    console.error(`   ❌ Error al verificar URL:`, error)
    console.error(`   ⚠️  Asegúrate de que el servidor esté corriendo y loca.lt esté activo`)
  }

  console.log(`\n   Registrando webhook en Trello...`)
  const webhookResponse = await fetch("https://api.trello.com/1/webhooks/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      description: `ERP Lozada - Madero - ${MADERO_BOARD_ID}`,
      callbackURL: WEBHOOK_URL,
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
    console.error(`\n   ❌ Error al registrar webhook:`)
    console.error(`   ${errorData.message || errorData.error || errorText}`)
    
    if (errorData.message?.includes("503") || errorData.message?.includes("did not return 200")) {
      console.error(`\n   💡 SOLUCIÓN:`)
      console.error(`   1. Asegúrate de que el servidor esté corriendo: npm run dev`)
      console.error(`   2. Asegúrate de que loca.lt esté activo y la URL sea accesible`)
      console.error(`   3. Intenta ejecutar este script nuevamente`)
    }
    
    process.exit(1)
  }

  const webhookData = await webhookResponse.json()
  console.log(`   ✅ Webhook registrado exitosamente!`)
  console.log(`   Webhook ID: ${webhookData.id}`)
  console.log(`   Estado: ${webhookData.active ? "✅ Activo" : "⚠️  Inactivo"}`)

  // 6. Guardar en la base de datos
  console.log("\n6. Guardando información en la base de datos...")
  await supabase
    .from("settings_trello")
    .update({
      webhook_id: webhookData.id,
      webhook_url: WEBHOOK_URL,
      updated_at: new Date().toISOString(),
    })
    .eq("id", (trelloSettings as any).id)

  console.log(`   ✅ Información guardada`)

  console.log("\n" + "=".repeat(60))
  console.log("✅ Webhook registrado exitosamente para Madero!")
  console.log("=".repeat(60))
  console.log(`\n📋 Resumen:`)
  console.log(`   Agencia: Madero`)
  console.log(`   Board ID: ${MADERO_BOARD_ID}`)
  console.log(`   Webhook ID: ${webhookData.id}`)
  console.log(`   URL: ${WEBHOOK_URL}`)
  console.log(`   Estado: ${webhookData.active ? "Activo" : "Inactivo"}`)
  console.log(`\n💡 Próximos pasos:`)
  console.log(`   1. Verifica el webhook en Settings > Trello > Webhooks (selecciona Madero)`)
  console.log(`   2. Crea una tarjeta en Trello en el board de Madero para probar`)
  console.log(`   3. Debería aparecer automáticamente en Leads (selecciona agencia Madero)`)
}

registerWebhook()
  .then(() => {
    console.log("\n✅ Script completado")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n❌ Error:", error)
    process.exit(1)
  })

