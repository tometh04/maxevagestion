#!/usr/bin/env tsx
/**
 * Script completo para configurar Trello para Madero
 * 1. Crea/actualiza configuración en BD
 * 2. Arregla webhook
 * 3. Sincroniza list_ids
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
const BOARD_ID_SHORT = "X4IFL8rx" // Madero

if (!TRELLO_API_KEY || !TRELLO_TOKEN) {
  console.error("❌ Faltan TRELLO_API_KEY o TRELLO_TOKEN en variables de entorno")
  process.exit(1)
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function setupMadero() {
  console.log("🚀 CONFIGURACIÓN COMPLETA DE TRELLO PARA MADERO")
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

  console.log(`✅ Agencia: ${madero.name} (ID: ${madero.id})`)

  // 2. Verificar board en Trello y obtener ID completo
  console.log("")
  console.log("📥 Verificando board en Trello...")
  const boardResponse = await fetch(
    `https://api.trello.com/1/boards/${BOARD_ID_SHORT}?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&fields=id,shortLink,name`
  )

  if (!boardResponse.ok) {
    console.error(`❌ Error obteniendo board: ${boardResponse.status}`)
    return
  }

  const board = await boardResponse.json()
  const fullBoardId = board.id

  console.log(`✅ Board encontrado:`)
  console.log(`   Nombre: ${board.name}`)
  console.log(`   ID Completo: ${fullBoardId}`)
  console.log(`   ID Corto: ${BOARD_ID_SHORT}`)

  // 3. Crear o actualizar configuración en BD
  console.log("")
  console.log("💾 Guardando configuración en BD...")
  
  const { data: existing } = await supabase
    .from("settings_trello")
    .select("id")
    .eq("agency_id", madero.id)
    .maybeSingle()

  const settingsData = {
    agency_id: madero.id,
    trello_api_key: TRELLO_API_KEY,
    trello_token: TRELLO_TOKEN,
    board_id: BOARD_ID_SHORT,
    list_status_mapping: {},
    list_region_mapping: {},
    updated_at: new Date().toISOString(),
  }

  let result
  if (existing) {
    const { data, error } = await supabase
      .from("settings_trello")
      .update(settingsData)
      .eq("id", existing.id)
      .select()
      .single()

    if (error) {
      console.error(`❌ Error actualizando configuración: ${error.message}`)
      return
    }
    result = data
    console.log("✅ Configuración actualizada")
  } else {
    const { data, error } = await supabase
      .from("settings_trello")
      .insert(settingsData)
      .select()
      .single()

    if (error) {
      console.error(`❌ Error creando configuración: ${error.message}`)
      return
    }
    result = data
    console.log("✅ Configuración creada")
  }

  // 4. Obtener listas y configurar mapeos básicos
  console.log("")
  console.log("📋 Obteniendo listas de Trello...")
  const listsResponse = await fetch(
    `https://api.trello.com/1/boards/${BOARD_ID_SHORT}/lists?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&filter=open&fields=id,name,pos`
  )

  if (!listsResponse.ok) {
    console.error(`❌ Error obteniendo listas: ${listsResponse.status}`)
    return
  }

  const lists = await listsResponse.json()
  console.log(`✅ ${lists.length} listas encontradas`)

  // 5. Configurar webhook
  console.log("")
  console.log("🔗 Configurando webhook...")
  
  const webhookUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/trello/webhook`
    : "https://www.maxevagestion.com/api/trello/webhook"

  // Obtener webhooks existentes
  const webhooksResponse = await fetch(
    `https://api.trello.com/1/tokens/${TRELLO_TOKEN}/webhooks?key=${TRELLO_API_KEY}`
  )

  if (webhooksResponse.ok) {
    const webhooks = await webhooksResponse.json()
    
    // Eliminar webhooks incorrectos para este board
    for (const webhook of webhooks) {
      const isForOurBoard = webhook.idModel === fullBoardId || webhook.idModel === BOARD_ID_SHORT
      const isOurCallback = webhook.callbackURL?.includes("/api/trello/webhook")
      
      if (isOurCallback && !isForOurBoard) {
        console.log(`   🗑️  Eliminando webhook incorrecto ${webhook.id}`)
        await fetch(
          `https://api.trello.com/1/webhooks/${webhook.id}?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}`,
          { method: "DELETE" }
        )
      }
    }

    // Verificar si ya existe uno correcto
    const correctWebhook = webhooks.find(
      (wh: any) =>
        (wh.idModel === fullBoardId || wh.idModel === BOARD_ID_SHORT) && 
        wh.callbackURL?.includes("/api/trello/webhook")
    )

    if (!correctWebhook) {
      // Registrar nuevo webhook
      const newWebhookResponse = await fetch("https://api.trello.com/1/webhooks/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          description: `MAXEVA GESTION - ${board.name} (Madero)`,
          callbackURL: webhookUrl,
          idModel: fullBoardId,
          key: TRELLO_API_KEY,
          token: TRELLO_TOKEN,
        }),
      })

      if (newWebhookResponse.ok) {
        const newWebhook = await newWebhookResponse.json()
        console.log(`✅ Webhook registrado: ${newWebhook.id}`)
      } else {
        const errorText = await newWebhookResponse.text()
        console.log(`⚠️  Error registrando webhook: ${errorText}`)
      }
    } else {
      console.log(`✅ Webhook ya existe: ${correctWebhook.id}`)
    }
  }

  // 6. Sincronizar list_ids de leads existentes (si hay)
  console.log("")
  console.log("🔄 Sincronizando trello_list_id de leads...")
  
  const { count } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("agency_id", madero.id)
    .eq("source", "Trello")
    .not("external_id", "is", null)

  if (count && count > 0) {
    console.log(`📊 ${count} leads encontrados, sincronizando...`)
    
    let page = 0
    const pageSize = 1000
    let allLeads: any[] = []
    let hasMore = true
    
    while (hasMore) {
      const { data, error } = await supabase
        .from("leads")
        .select("id, external_id, trello_list_id, contact_name")
        .eq("agency_id", madero.id)
        .eq("source", "Trello")
        .not("external_id", "is", null)
        .range(page * pageSize, (page + 1) * pageSize - 1)
      
      if (error || !data) break
      
      if (data.length > 0) {
        allLeads = [...allLeads, ...data]
        hasMore = data.length === pageSize
        page++
      } else {
        hasMore = false
      }
    }

    let updated = 0
    for (let i = 0; i < allLeads.length; i++) {
      const lead = allLeads[i]
      try {
        const cardResponse = await fetch(
          `https://api.trello.com/1/cards/${lead.external_id}?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&fields=id,idList,closed`
        )

        if (cardResponse.ok) {
          const card = await cardResponse.json()
          if (!card.closed && card.idList !== lead.trello_list_id) {
            await supabase
              .from("leads")
              .update({ trello_list_id: card.idList, updated_at: new Date().toISOString() })
              .eq("id", lead.id)
            updated++
          }
        }

        await delay(50)
        if ((i + 1) % 20 === 0) await delay(1000)
      } catch (error) {
        // Continuar con el siguiente
      }
    }

    console.log(`✅ ${updated} leads actualizados`)
  } else {
    console.log("ℹ️  No hay leads para sincronizar")
  }

  console.log("")
  console.log("=".repeat(60))
  console.log("✅ CONFIGURACIÓN COMPLETA DE MADERO FINALIZADA")
  console.log("=".repeat(60))
  console.log("")
  console.log("💡 Próximos pasos:")
  console.log("   1. Ir a Settings > Trello")
  console.log("   2. Seleccionar agencia 'Madero'")
  console.log("   3. Configurar mapeos de estados y regiones en el tab 'Mapeo'")
  console.log("   4. (Opcional) Ejecutar sincronización manual en el tab 'Sincronización'")
}

setupMadero()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error("❌ Error fatal:", error)
    process.exit(1)
  })

