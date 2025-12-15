/**
 * Script de migración: Copiar orden de listas de Trello a manychat_list_order
 * 
 * Este script se ejecuta UNA SOLA VEZ para inicializar el orden de listas
 * en CRM Manychat basándose en el orden actual de Trello.
 * 
 * Después de esto, el orden será completamente independiente y editable desde el CRM.
 * 
 * Uso:
 *   npx tsx scripts/migrate-trello-list-order-to-manychat.ts
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

interface TrelloSettings {
  id: string
  agency_id: string
  board_id: string
  trello_api_key: string
  trello_token: string
}

async function main() {
  console.log("🚀 Iniciando migración de orden de listas de Trello a manychat_list_order...\n")

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
  let totalCreated = 0
  let totalErrors = 0

  // 2. Para cada agencia, copiar el orden de listas
  for (const settings of trelloSettings as TrelloSettings[]) {
    console.log(`\n🏢 Procesando agencia: ${settings.agency_id}`)
    console.log(`   Board ID: ${settings.board_id}`)

    try {
      // 2.1 Obtener listas activas de Trello ordenadas por posición
      console.log("   📝 Obteniendo listas de Trello ordenadas...")
      const listsResponse = await fetch(
        `https://api.trello.com/1/boards/${settings.board_id}/lists?key=${settings.trello_api_key}&token=${settings.trello_token}&filter=open&fields=id,name,closed,pos`
      )

      if (!listsResponse.ok) {
        const errorText = await listsResponse.text()
        console.error(`   ❌ Error obteniendo listas de Trello: ${listsResponse.status} - ${errorText}`)
        totalErrors++
        continue
      }

      const lists: Array<{ id: string; name: string; closed: boolean; pos: number }> = await listsResponse.json()
      const activeLists = lists.filter(list => !list.closed).sort((a, b) => a.pos - b.pos)

      if (activeLists.length === 0) {
        console.log("   ⚠️ No se encontraron listas activas en Trello")
        continue
      }

      console.log(`   ✅ Encontradas ${activeLists.length} lista(s) activa(s):`)
      activeLists.forEach((list, index) => {
        console.log(`      ${index + 1}. ${list.name}`)
      })

      // 2.2 Verificar si ya existe orden para esta agencia
      const { data: existingOrder } = await supabase
        .from("manychat_list_order")
        .select("id")
        .eq("agency_id", settings.agency_id)
        .limit(1)

      if (existingOrder && existingOrder.length > 0) {
        console.log(`   ⚠️ Ya existe orden para esta agencia. Eliminando orden anterior...`)
        const { error: deleteError } = await supabase
          .from("manychat_list_order")
          .delete()
          .eq("agency_id", settings.agency_id)
        
        if (deleteError) {
          console.error(`   ❌ Error eliminando orden anterior:`, deleteError)
          totalErrors++
          continue
        }
      }

      // 2.3 Insertar orden de listas
      console.log("\n   🔄 Insertando orden de listas en manychat_list_order...")
      const orderData = activeLists.map((list, index) => ({
        agency_id: settings.agency_id,
        list_name: list.name,
        position: index,
      }))

      const { error: insertError } = await supabase
        .from("manychat_list_order")
        .insert(orderData)

      if (insertError) {
        console.error(`   ❌ Error insertando orden:`, insertError)
        totalErrors++
        continue
      }

      console.log(`   ✅ Orden insertado correctamente (${orderData.length} listas)`)
      totalProcessed++
      totalCreated += orderData.length

    } catch (error: any) {
      console.error(`   ❌ Error procesando agencia ${settings.agency_id}:`, error.message)
      totalErrors++
    }
  }

  // 3. Resumen final
  console.log("\n" + "=".repeat(60))
  console.log("📊 RESUMEN FINAL")
  console.log("=".repeat(60))
  console.log(`Total de agencias procesadas: ${totalProcessed}`)
  console.log(`Total de listas ordenadas creadas: ${totalCreated}`)
  console.log(`Total de errores: ${totalErrors}`)
  console.log("=".repeat(60))

  if (totalErrors === 0) {
    console.log("\n✅ Migración completada exitosamente!")
    console.log("💡 Ahora el orden de listas en CRM Manychat es completamente independiente de Trello.")
    console.log("💡 Puedes editarlo desde el CRM sin afectar la sincronización de Trello.")
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

