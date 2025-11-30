/**
 * Script para configurar automáticamente el mapeo de listas de Trello
 * Basado en los nombres de las listas, mapea a estados y regiones
 */

import { createClient } from "@supabase/supabase-js"

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
const BOARD_ID = "kZh4zJ0J"

// Mapeo automático basado en nombres de listas
const AUTO_STATUS_MAPPING: Record<string, string> = {
  // Listas que son nombres de vendedores → IN_PROGRESS
  "Ramiro": "IN_PROGRESS",
  "Pau": "IN_PROGRESS",
  "Candela": "IN_PROGRESS",
  "Josefina": "IN_PROGRESS",
  "Micaela": "IN_PROGRESS",
  "Nazarena": "IN_PROGRESS",
  "Santiago": "IN_PROGRESS",
  "Emilia": "IN_PROGRESS",
  "Maximiliano": "IN_PROGRESS",
  "Julieta ✨💕": "IN_PROGRESS",
  
  // Campañas → IN_PROGRESS
  "Campaña - Caribe Marzo/Junio": "IN_PROGRESS",
  "Campaña - Cruceros": "IN_PROGRESS",
  "Campaña - Caribe Marzo/junio": "IN_PROGRESS",
  "Campaña - Pre Venta Brasil Verano": "IN_PROGRESS",
  
  // Leads por región → NEW
  "Leads - Instagram": "NEW",
  "Leads - Caribe": "NEW",
  "Leads - Brasil": "NEW",
  "Leads - Otros": "NEW",
  "Leads - Europa": "NEW",
  "Leads - EEUU": "NEW",
  "Leads - Argentina": "NEW",
  
  // Otras listas
  "Contactos WhatsApp": "NEW",
  "Usuarios Sin Número": "NEW",
  "Clientes a Contactar": "QUOTED",
}

const AUTO_REGION_MAPPING: Record<string, string> = {
  "Europa": "EUROPA",
  "Brasil": "BRASIL",
  "Argentina": "ARGENTINA",
  "Caribe": "CARIBE",
  "Otros": "OTROS",
  "Leads - Caribe": "CARIBE",
  "Leads - Brasil": "BRASIL",
  "Leads - Europa": "EUROPA",
  "Leads - EEUU": "EEUU",
  "Leads - Argentina": "ARGENTINA",
  "Leads - Otros": "OTROS",
  "Campaña - Cruceros": "CRUCEROS",
  "Campaña - Caribe Marzo/Junio": "CARIBE",
  "Campaña - Caribe Marzo/junio": "CARIBE",
  "Campaña - Pre Venta Brasil Verano": "BRASIL",
}

async function configureMapping() {
  console.log("🔄 Configurando mapeo automático de Trello...")
  console.log("")

  // 1. Obtener agencia Rosario
  const { data: agency } = await supabase
    .from("agencies")
    .select("id, name")
    .eq("name", "Rosario")
    .single()

  if (!agency) {
    console.error("❌ No se encontró agencia Rosario")
    process.exit(1)
  }

  // 2. Obtener listas de Trello
  console.log("1. Obteniendo listas de Trello...")
  const listsResponse = await fetch(
    `https://api.trello.com/1/boards/${BOARD_ID}/lists?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&fields=id,name`
  )

  if (!listsResponse.ok) {
    console.error("❌ Error obteniendo listas")
    process.exit(1)
  }

  const lists = await listsResponse.json()
  console.log(`   ✓ ${lists.length} listas encontradas`)

  // 3. Crear mapeos
  const listStatusMapping: Record<string, string> = {}
  const listRegionMapping: Record<string, string> = {}

  lists.forEach((list: any) => {
    const listName = list.name
    
    // Mapeo de estado
    if (AUTO_STATUS_MAPPING[listName]) {
      listStatusMapping[list.id] = AUTO_STATUS_MAPPING[listName]
    } else {
      // Por defecto, si el nombre es un vendedor conocido, IN_PROGRESS
      const isVendedor = ["Ramiro", "Pau", "Candela", "Josefina", "Micaela", "Nazarena", "Santiago", "Emilia", "Maximiliano"].some(
        v => listName.includes(v)
      )
      listStatusMapping[list.id] = isVendedor ? "IN_PROGRESS" : "NEW"
    }

    // Mapeo de región
    if (AUTO_REGION_MAPPING[listName]) {
      listRegionMapping[list.id] = AUTO_REGION_MAPPING[listName]
    } else {
      // Intentar detectar región del nombre
      if (listName.toLowerCase().includes("caribe")) {
        listRegionMapping[list.id] = "CARIBE"
      } else if (listName.toLowerCase().includes("brasil")) {
        listRegionMapping[list.id] = "BRASIL"
      } else if (listName.toLowerCase().includes("europa")) {
        listRegionMapping[list.id] = "EUROPA"
      } else if (listName.toLowerCase().includes("argentina")) {
        listRegionMapping[list.id] = "ARGENTINA"
      } else if (listName.toLowerCase().includes("crucero")) {
        listRegionMapping[list.id] = "CRUCEROS"
      } else if (listName.toLowerCase().includes("eeuu") || listName.toLowerCase().includes("usa")) {
        listRegionMapping[list.id] = "EEUU"
      } else {
        listRegionMapping[list.id] = "OTROS"
      }
    }
  })

  // 4. Actualizar configuración
  console.log("")
  console.log("2. Actualizando configuración de Trello...")
  
  const { data: trelloSettings } = await supabase
    .from("settings_trello")
    .select("*")
    .eq("agency_id", agency.id)
    .single()

  if (!trelloSettings) {
    console.error("❌ No se encontró configuración de Trello")
    process.exit(1)
  }

  const { error: updateError } = await (supabase.from("settings_trello") as any)
    .update({
      list_status_mapping: listStatusMapping,
      list_region_mapping: listRegionMapping,
      updated_at: new Date().toISOString(),
    })
    .eq("id", trelloSettings.id)

  if (updateError) {
    console.error("❌ Error actualizando configuración:", updateError)
    process.exit(1)
  }

  console.log("   ✓ Mapeos configurados")
  console.log("")
  console.log("📋 Mapeos creados:")
  lists.forEach((list: any) => {
    console.log(`   - ${list.name}`)
    console.log(`     Estado: ${listStatusMapping[list.id]}`)
    console.log(`     Región: ${listRegionMapping[list.id]}`)
  })

  console.log("")
  console.log("✅ Configuración completada!")
}

configureMapping().catch(console.error)

