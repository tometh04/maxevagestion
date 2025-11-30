/**
 * Script para sincronizar todos los leads de Madero desde Trello
 * Board ID: X4IFL8rx
 */

import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"
import { resolve } from "path"
import { fetchTrelloCard, syncTrelloCardToLead } from "../lib/trello/sync"

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

async function syncMaderoTrello() {
  console.log("🔄 Sincronizando leads de Madero desde Trello...")
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

  // 2. Obtener configuración de Trello
  console.log("")
  console.log("2. Obteniendo configuración de Trello...")
  const { data: trelloSettings } = await supabase
    .from("settings_trello")
    .select("*")
    .eq("agency_id", agencyId)
    .single()

  if (!trelloSettings) {
    console.error("❌ No hay configuración de Trello para Madero")
    console.error("   Ejecuta primero: npx tsx scripts/setup-trello-madero.ts")
    process.exit(1)
  }

  console.log(`   ✓ Board ID: ${trelloSettings.board_id}`)

  const settings = {
    agency_id: agencyId,
    trello_api_key: TRELLO_API_KEY,
    trello_token: TRELLO_TOKEN,
    board_id: BOARD_ID,
    list_status_mapping: (trelloSettings.list_status_mapping as Record<string, string>) || {},
    list_region_mapping: (trelloSettings.list_region_mapping as Record<string, string>) || {},
  }

  // 3. Obtener todas las tarjetas del board
  console.log("")
  console.log("3. Obteniendo todas las tarjetas de Trello...")
  const cardsResponse = await fetch(
    `https://api.trello.com/1/boards/${BOARD_ID}/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&fields=id,name`
  )

  if (!cardsResponse.ok) {
    console.error("❌ Error al obtener tarjetas de Trello")
    const errorText = await cardsResponse.text()
    console.error(errorText)
    process.exit(1)
  }

  const cards = await cardsResponse.json()
  console.log(`   ✓ ${cards.length} tarjetas encontradas`)

  if (cards.length === 0) {
    console.log("")
    console.log("✅ No hay tarjetas para sincronizar")
    return
  }

  // 4. Sincronizar cada tarjeta
  console.log("")
  console.log("4. Sincronizando tarjetas...")
  let synced = 0
  let created = 0
  let updated = 0
  let errors = 0

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]
    try {
      // Fetch full card details
      const fullCard = await fetchTrelloCard(card.id, TRELLO_API_KEY, TRELLO_TOKEN)

      if (!fullCard) {
        console.error(`   ⚠️  Tarjeta ${card.id} no encontrada o eliminada`)
        errors++
        continue
      }

      // Sync to lead
      const result = await syncTrelloCardToLead(fullCard, settings, supabase as any)

      if (result.created) {
        created++
        console.log(`   ✓ [${i + 1}/${cards.length}] Creado: ${card.name}`)
      } else {
        updated++
        console.log(`   ✓ [${i + 1}/${cards.length}] Actualizado: ${card.name}`)
      }
      synced++

      // Log progress every 10 cards
      if ((i + 1) % 10 === 0) {
        console.log(`   📊 Progreso: ${i + 1}/${cards.length} tarjetas procesadas...`)
      }
    } catch (error: any) {
      console.error(`   ❌ Error sincronizando tarjeta ${card.id} (${card.name}):`, error.message)
      errors++
    }
  }

  console.log("")
  console.log("✅ Sincronización completada!")
  console.log(`   Total procesadas: ${synced}`)
  console.log(`   Creadas: ${created}`)
  console.log(`   Actualizadas: ${updated}`)
  console.log(`   Errores: ${errors}`)
  console.log("")
  console.log("💡 Ahora puedes ver los leads en la página de Leads seleccionando la agencia 'Madero'")
}

syncMaderoTrello()
  .then(() => {
    console.log("✅ Script completado")
    process.exit(0)
  })
  .catch((error) => {
    console.error("❌ Error:", error)
    process.exit(1)
  })

