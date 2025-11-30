/**
 * Script para configurar Trello para la agencia Madero
 * Board ID: X4IFL8rx
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
const BOARD_ID = "X4IFL8rx" // Board ID de Madero

async function setupTrelloMadero() {
  console.log("🔄 Configurando Trello para Madero...")
  console.log("")

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

  const agencyId = agency.id
  console.log(`   ✓ Agencia: ${agency.name} (${agencyId})`)

  // 2. Obtener listas del board de Trello
  console.log("")
  console.log("2. Obteniendo listas del board de Trello...")
  const listsResponse = await fetch(
    `https://api.trello.com/1/boards/${BOARD_ID}/lists?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&fields=id,name`
  )

  if (!listsResponse.ok) {
    console.error("❌ Error al obtener listas de Trello")
    const errorText = await listsResponse.text()
    console.error(errorText)
    process.exit(1)
  }

  const lists = await listsResponse.json()
  console.log(`   ✓ ${lists.length} listas encontradas:`)
  lists.forEach((list: any) => {
    console.log(`      - ${list.name} (${list.id})`)
  })

  // 3. Crear mapeo de estados (similar a Rosario)
  // Por defecto, mapear listas comunes a estados
  const listStatusMapping: Record<string, string> = {}
  const listRegionMapping: Record<string, string> = {}

  lists.forEach((list: any) => {
    const listName = list.name.toLowerCase()
    
    // Mapeo de estados
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
      // Por defecto, asignar NEW
      listStatusMapping[list.id] = "NEW"
    }

    // Mapeo de regiones (opcional, se puede ajustar después)
    if (listName.includes("argentina")) {
      listRegionMapping[list.id] = "ARGENTINA"
    } else if (listName.includes("caribe")) {
      listRegionMapping[list.id] = "CARIBE"
    } else if (listName.includes("brasil")) {
      listRegionMapping[list.id] = "BRASIL"
    } else if (listName.includes("europa")) {
      listRegionMapping[list.id] = "EUROPA"
    } else if (listName.includes("eeuu") || listName.includes("usa")) {
      listRegionMapping[list.id] = "EEUU"
    } else if (listName.includes("crucero")) {
      listRegionMapping[list.id] = "CRUCEROS"
    }
  })

  console.log("")
  console.log("3. Mapeo de estados creado:")
  Object.entries(listStatusMapping).forEach(([listId, status]) => {
    const listName = lists.find((l: any) => l.id === listId)?.name || "Unknown"
    console.log(`   ${listName} -> ${status}`)
  })

  // 4. Verificar si ya existe configuración
  console.log("")
  console.log("4. Verificando configuración existente...")
  const { data: existingSettings } = await supabase
    .from("settings_trello")
    .select("*")
    .eq("agency_id", agencyId)
    .maybeSingle()

  const settingsData = {
    agency_id: agencyId,
    trello_api_key: TRELLO_API_KEY,
    trello_token: TRELLO_TOKEN,
    board_id: BOARD_ID,
    list_status_mapping: listStatusMapping,
    list_region_mapping: listRegionMapping,
    updated_at: new Date().toISOString(),
  }

  if (existingSettings) {
    console.log("   ⚠️  Configuración existente encontrada, actualizando...")
    const { data, error } = await supabase
      .from("settings_trello")
      .update(settingsData)
      .eq("id", existingSettings.id)
      .select()
      .single()

    if (error) {
      console.error("❌ Error al actualizar configuración:", error)
      process.exit(1)
    }
    console.log("   ✓ Configuración actualizada")
  } else {
    console.log("   Creando nueva configuración...")
    const { data, error } = await supabase
      .from("settings_trello")
      .insert(settingsData)
      .select()
      .single()

    if (error) {
      console.error("❌ Error al crear configuración:", error)
      process.exit(1)
    }
    console.log("   ✓ Configuración creada")
  }

  console.log("")
  console.log("✅ Configuración de Trello para Madero completada!")
  console.log(`   Board ID: ${BOARD_ID}`)
  console.log(`   Listas: ${lists.length}`)
  console.log("")
  console.log("💡 Próximos pasos:")
  console.log("   1. Revisar y ajustar el mapeo de estados en Settings > Trello")
  console.log("   2. Ejecutar sincronización desde Settings > Trello > Sync")
  console.log("   3. Verificar que los leads se sincronicen correctamente")
}

setupTrelloMadero()
  .then(() => {
    console.log("✅ Script completado")
    process.exit(0)
  })
  .catch((error) => {
    console.error("❌ Error:", error)
    process.exit(1)
  })

