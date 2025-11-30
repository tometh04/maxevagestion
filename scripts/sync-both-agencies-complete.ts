/**
 * Script para sincronizar COMPLETAMENTE ambas agencias (Rosario y Madero)
 * Trae TODA la data de Trello tal cual está reflejada allí
 */

import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"
import { resolve } from "path"
import { fetchTrelloCard, syncTrelloCardToLead } from "../lib/trello/sync"

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

// Configuración de agencias
const AGENCIES = [
  { name: "Rosario", boardId: "kZh4zJ0J" },
  { name: "Madero", boardId: "X4IFL8rx" },
]

async function syncAgency(agencyName: string, boardId: string) {
  console.log("\n" + "=".repeat(70))
  console.log(`🔄 Sincronizando ${agencyName} (Board: ${boardId})`)
  console.log("=".repeat(70))

  // 1. Obtener agencia
  console.log(`\n1. Obteniendo agencia ${agencyName}...`)
  const { data: agency } = await supabase
    .from("agencies")
    .select("id, name")
    .eq("name", agencyName)
    .single()

  if (!agency) {
    console.error(`   ❌ No se encontró agencia ${agencyName}`)
    return { success: false, agencyName, synced: 0, created: 0, updated: 0, errors: 0 }
  }

  const agencyId = agency.id
  console.log(`   ✓ Agencia: ${agency.name} (${agencyId})`)

  // 2. Obtener configuración de Trello
  console.log(`\n2. Obteniendo configuración de Trello...`)
  const { data: trelloSettings } = await supabase
    .from("settings_trello")
    .select("*")
    .eq("agency_id", agencyId)
    .single()

  if (!trelloSettings) {
    console.error(`   ❌ No hay configuración de Trello para ${agencyName}`)
    return { success: false, agencyName, synced: 0, created: 0, updated: 0, errors: 0 }
  }

  console.log(`   ✓ Board ID: ${(trelloSettings as any).board_id}`)
  console.log(`   ✓ Mapeos configurados: ${Object.keys((trelloSettings as any).list_status_mapping || {}).length} listas`)

  const settings = {
    agency_id: agencyId,
    trello_api_key: TRELLO_API_KEY,
    trello_token: TRELLO_TOKEN,
    board_id: boardId,
    list_status_mapping: (trelloSettings.list_status_mapping as Record<string, string>) || {},
    list_region_mapping: (trelloSettings.list_region_mapping as Record<string, string>) || {},
  }

  // 3. Obtener todas las tarjetas del board
  console.log(`\n3. Obteniendo todas las tarjetas de Trello...`)
  const cardsResponse = await fetch(
    `https://api.trello.com/1/boards/${boardId}/cards?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&fields=id,name`
  )

  if (!cardsResponse.ok) {
    const errorText = await cardsResponse.text()
    console.error(`   ❌ Error al obtener tarjetas: ${errorText}`)
    return { success: false, agencyName, synced: 0, created: 0, updated: 0, errors: 0 }
  }

  const cards = await cardsResponse.json()
  console.log(`   ✓ ${cards.length} tarjetas encontradas en Trello`)

  if (cards.length === 0) {
    console.log(`   ⚠️  No hay tarjetas para sincronizar`)
    return { success: true, agencyName, synced: 0, created: 0, updated: 0, errors: 0 }
  }

  // 4. Sincronizar cada tarjeta
  console.log(`\n4. Sincronizando tarjetas...`)
  let synced = 0
  let created = 0
  let updated = 0
  let errors = 0

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]
    try {
      // Fetch full card details with ALL information
      const fullCard = await fetchTrelloCard(card.id, TRELLO_API_KEY, TRELLO_TOKEN)

      if (!fullCard) {
        console.warn(`   ⚠️  [${i + 1}/${cards.length}] Tarjeta ${card.id} no encontrada o eliminada`)
        errors++
        continue
      }

      // Sync to lead - esto guarda con el agency_id correcto
      const result = await syncTrelloCardToLead(fullCard, settings, supabase as any)

      if (result.created) {
        created++
        if ((i + 1) % 50 === 0 || i === 0) {
          console.log(`   ✓ [${i + 1}/${cards.length}] Creado: ${card.name.substring(0, 50)}...`)
        }
      } else {
        updated++
        if ((i + 1) % 50 === 0 || i === 0) {
          console.log(`   ✓ [${i + 1}/${cards.length}] Actualizado: ${card.name.substring(0, 50)}...`)
        }
      }
      synced++

      // Log progress every 50 cards
      if ((i + 1) % 50 === 0) {
        console.log(`   📊 Progreso: ${i + 1}/${cards.length} tarjetas procesadas...`)
      }
    } catch (error: any) {
      console.error(`   ❌ [${i + 1}/${cards.length}] Error sincronizando ${card.name}:`, error.message)
      errors++
    }
  }

  console.log(`\n   ✅ Sincronización de ${agencyName} completada:`)
  console.log(`      Total procesadas: ${synced}`)
  console.log(`      Creadas: ${created}`)
  console.log(`      Actualizadas: ${updated}`)
  console.log(`      Errores: ${errors}`)

  // 5. Verificar leads en la BD
  console.log(`\n5. Verificando leads en la base de datos...`)
  const { data: leads, count } = await supabase
    .from("leads")
    .select("*", { count: "exact" })
    .eq("agency_id", agencyId)
    .eq("source", "Trello")

  console.log(`   ✓ Leads encontrados en BD: ${count || 0}`)
  if (count && count > 0) {
    const withTrelloListId = leads?.filter((l: any) => l.trello_list_id) || []
    console.log(`   ✓ Leads con trello_list_id: ${withTrelloListId.length}`)
  }

  return { success: true, agencyName, synced, created, updated, errors, totalInDb: count || 0 }
}

async function main() {
  console.log("🚀 Sincronización Completa de Ambas Agencias")
  console.log("=".repeat(70))
  console.log("\nEste script traerá TODA la data de Trello tal cual está reflejada allí")
  console.log("para ambas agencias: Rosario y Madero\n")

  const results = []
  for (const agency of AGENCIES) {
    const result = await syncAgency(agency.name, agency.boardId)
    results.push(result)
  }

  // Resumen final
  console.log("\n" + "=".repeat(70))
  console.log("📊 RESUMEN FINAL")
  console.log("=".repeat(70))

  results.forEach((result) => {
    console.log(`\n${result.agencyName}:`)
    if (result.success) {
      console.log(`   ✅ Sincronización exitosa`)
      console.log(`   Total procesadas: ${result.synced}`)
      console.log(`   Creadas: ${result.created}`)
      console.log(`   Actualizadas: ${result.updated}`)
      console.log(`   Errores: ${result.errors}`)
      console.log(`   Total en BD: ${result.totalInDb}`)
    } else {
      console.log(`   ❌ Error en la sincronización`)
    }
  })

  const totalSynced = results.reduce((sum, r) => sum + r.synced, 0)
  const totalCreated = results.reduce((sum, r) => sum + r.created, 0)
  const totalUpdated = results.reduce((sum, r) => sum + r.updated, 0)
  const totalErrors = results.reduce((sum, r) => sum + r.errors, 0)

  console.log("\n" + "=".repeat(70))
  console.log("📈 TOTALES")
  console.log("=".repeat(70))
  console.log(`   Total procesadas: ${totalSynced}`)
  console.log(`   Total creadas: ${totalCreated}`)
  console.log(`   Total actualizadas: ${totalUpdated}`)
  console.log(`   Total errores: ${totalErrors}`)

  console.log("\n" + "=".repeat(70))
  console.log("✅ Sincronización completada!")
  console.log("=".repeat(70))
  console.log("\n💡 Próximos pasos:")
  console.log("   1. Ve a la sección Leads")
  console.log("   2. Selecciona 'Rosario' en el selector de agencias")
  console.log("   3. Deberías ver todos los leads de Rosario")
  console.log("   4. Selecciona 'Madero' para ver los leads de Madero")
  console.log("   5. Selecciona 'Todas las agencias' para ver ambos")
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

