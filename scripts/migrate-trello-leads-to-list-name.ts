/**
 * Script de migración: Asignar list_name a leads existentes de Trello
 * 
 * Este script toma una "foto" del estado actual de Trello y asigna list_name
 * a todos los leads que vienen de Trello, basándose en el nombre de la lista
 * de Trello a la que pertenecen.
 * 
 * Esto permite que:
 * 1. Los leads existentes de Trello aparezcan en CRM Manychat con su lista correcta
 * 2. Los nuevos leads de Manychat (que usan determineListName()) coincidan con esos nombres
 *    y aparezcan en las mismas columnas del kanban
 * 
 * Uso:
 *   npx tsx scripts/migrate-trello-leads-to-list-name.ts
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

interface TrelloList {
  id: string
  name: string
  closed: boolean
}

interface TrelloSettings {
  id: string
  agency_id: string
  board_id: string
  trello_api_key: string
  trello_token: string
}

interface Lead {
  id: string
  agency_id: string
  source: string
  trello_list_id: string | null
  list_name: string | null
  contact_name: string
}

async function main() {
  console.log("🚀 Iniciando migración de leads de Trello a list_name...\n")

  // 1. Obtener todas las agencias con configuración de Trello
  console.log("📋 Paso 1: Obteniendo configuraciones de Trello...")
  const { data: trelloSettings, error: settingsError } = await supabase
    .from("settings_trello")
    .select("id, agency_id, board_id, trello_api_key, trello_token")

  if (settingsError || !trelloSettings || trelloSettings.length === 0) {
    console.error("❌ Error obteniendo configuraciones de Trello:", settingsError)
    process.exit(1)
  }

  console.log(`✅ Encontradas ${trelloSettings.length} configuración(es) de Trello\n`)

  let totalProcessed = 0
  let totalUpdated = 0
  let totalErrors = 0

  // 2. Para cada agencia, procesar sus leads
  for (const settings of trelloSettings as TrelloSettings[]) {
    console.log(`\n🏢 Procesando agencia: ${settings.agency_id}`)
    console.log(`   Board ID: ${settings.board_id}`)

    try {
      // 2.1 Obtener listas activas de Trello
      console.log("   📝 Obteniendo listas de Trello...")
      const listsResponse = await fetch(
        `https://api.trello.com/1/boards/${settings.board_id}/lists?key=${settings.trello_api_key}&token=${settings.trello_token}&filter=open&fields=id,name,closed`
      )

      if (!listsResponse.ok) {
        const errorText = await listsResponse.text()
        console.error(`   ❌ Error obteniendo listas de Trello: ${listsResponse.status} - ${errorText}`)
        totalErrors++
        continue
      }

      const lists: TrelloList[] = await listsResponse.json()
      const activeLists = lists.filter(list => !list.closed)

      if (activeLists.length === 0) {
        console.log("   ⚠️ No se encontraron listas activas en Trello")
        continue
      }

      console.log(`   ✅ Encontradas ${activeLists.length} lista(s) activa(s):`)
      activeLists.forEach(list => {
        console.log(`      - ${list.name} (${list.id})`)
      })

      // 2.2 Crear mapa: trello_list_id → list_name
      const listNameMap = new Map<string, string>()
      activeLists.forEach(list => {
        listNameMap.set(list.id, list.name)
      })

      // 2.3 Obtener todos los leads de Trello de esta agencia con trello_list_id
      console.log("\n   🔍 Obteniendo leads de Trello...")
      const { data: leads, error: leadsError } = await supabase
        .from("leads")
        .select("id, agency_id, source, trello_list_id, list_name, contact_name")
        .eq("agency_id", settings.agency_id)
        .eq("source", "Trello")
        .not("trello_list_id", "is", null)

      if (leadsError) {
        console.error(`   ❌ Error obteniendo leads:`, leadsError)
        totalErrors++
        continue
      }

      if (!leads || leads.length === 0) {
        console.log("   ℹ️ No se encontraron leads de Trello para esta agencia")
        continue
      }

      console.log(`   ✅ Encontrados ${leads.length} lead(s) de Trello`)

      // 2.4 Actualizar cada lead con su list_name
      console.log("\n   🔄 Actualizando leads con list_name...")
      let updated = 0
      let skipped = 0
      let errors = 0

      for (const lead of leads as Lead[]) {
        totalProcessed++

        if (!lead.trello_list_id) {
          skipped++
          continue
        }

        const listName = listNameMap.get(lead.trello_list_id)

        if (!listName) {
          console.warn(`   ⚠️ Lead ${lead.id} (${lead.contact_name}) tiene trello_list_id ${lead.trello_list_id} que no existe en las listas activas`)
          errors++
          totalErrors++
          continue
        }

        // Solo actualizar si el list_name es diferente o es null
        if (lead.list_name === listName) {
          skipped++
          continue
        }

        const { error: updateError } = await supabase
          .from("leads")
          .update({ list_name: listName })
          .eq("id", lead.id)

        if (updateError) {
          console.error(`   ❌ Error actualizando lead ${lead.id}:`, updateError)
          errors++
          totalErrors++
        } else {
          updated++
          totalUpdated++
          console.log(`   ✅ Lead "${lead.contact_name}" → list_name: "${listName}"`)
        }
      }

      console.log(`\n   📊 Resumen para agencia ${settings.agency_id}:`)
      console.log(`      - Actualizados: ${updated}`)
      console.log(`      - Omitidos (ya tenían list_name correcto): ${skipped}`)
      console.log(`      - Errores: ${errors}`)

    } catch (error: any) {
      console.error(`   ❌ Error procesando agencia ${settings.agency_id}:`, error.message)
      totalErrors++
    }
  }

  // 3. Resumen final
  console.log("\n" + "=".repeat(60))
  console.log("📊 RESUMEN FINAL")
  console.log("=".repeat(60))
  console.log(`Total de leads procesados: ${totalProcessed}`)
  console.log(`Total de leads actualizados: ${totalUpdated}`)
  console.log(`Total de errores: ${totalErrors}`)
  console.log("=".repeat(60))

  if (totalErrors === 0) {
    console.log("\n✅ Migración completada exitosamente!")
  } else {
    console.log(`\n⚠️ Migración completada con ${totalErrors} error(es)`)
  }
}

// Ejecutar
main()
  .then(() => {
    console.log("\n✨ Script finalizado")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n❌ Error fatal:", error)
    process.exit(1)
  })

