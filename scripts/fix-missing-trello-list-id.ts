/**
 * Script para corregir leads de Trello que no tienen trello_list_id
 * Esto puede pasar si fueron creados antes de agregar ese campo o si hubo un error en la sincronización
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

async function fixMissingTrelloListId() {
  console.log("🔧 Corrigiendo leads sin trello_list_id...")
  console.log("=".repeat(70))

  // Obtener todas las agencias
  const { data: agencies } = await supabase.from("agencies").select("id, name")

  for (const agency of agencies || []) {
    console.log(`\n📋 Procesando ${agency.name}...`)

    // Obtener leads de Trello sin trello_list_id
    const { data: leadsWithoutListId } = await supabase
      .from("leads")
      .select("id, external_id, agency_id")
      .eq("agency_id", agency.id)
      .eq("source", "Trello")
      .is("trello_list_id", null)
      .not("external_id", "is", null)

    if (!leadsWithoutListId || leadsWithoutListId.length === 0) {
      console.log(`   ✓ No hay leads sin trello_list_id`)
      continue
    }

    console.log(`   ⚠️  Encontrados ${leadsWithoutListId.length} leads sin trello_list_id`)

    // Obtener configuración de Trello para esta agencia
    const { data: trelloSettings } = await supabase
      .from("settings_trello")
      .select("board_id")
      .eq("agency_id", agency.id)
      .single()

    if (!trelloSettings) {
      console.log(`   ⚠️  No hay configuración de Trello, saltando...`)
      continue
    }

    const boardId = (trelloSettings as any).board_id
    console.log(`   Board ID: ${boardId}`)

    // Procesar en lotes de 100
    let fixed = 0
    let errors = 0

    for (let i = 0; i < leadsWithoutListId.length; i += 100) {
      const batch = leadsWithoutListId.slice(i, i + 100)

      for (const lead of batch) {
        try {
          // Obtener la tarjeta de Trello
          const cardResponse = await fetch(
            `https://api.trello.com/1/cards/${lead.external_id}?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&fields=idList`
          )

          if (cardResponse.ok) {
            const card = await cardResponse.json()
            if (card.idList) {
              // Actualizar el lead con el trello_list_id
              await supabase
                .from("leads")
                .update({ trello_list_id: card.idList })
                .eq("id", lead.id)

              fixed++
              if (fixed % 50 === 0) {
                console.log(`   📊 Progreso: ${fixed}/${leadsWithoutListId.length} corregidos...`)
              }
            } else {
              console.warn(`   ⚠️  Tarjeta ${lead.external_id} no tiene idList`)
              errors++
            }
          } else if (cardResponse.status === 404) {
            // La tarjeta fue eliminada en Trello, podemos marcarla o eliminarla
            console.warn(`   ⚠️  Tarjeta ${lead.external_id} no existe en Trello (eliminada)`)
            errors++
          } else {
            console.error(`   ❌ Error al obtener tarjeta ${lead.external_id}`)
            errors++
          }
        } catch (error: any) {
          console.error(`   ❌ Error procesando lead ${lead.id}:`, error.message)
          errors++
        }
      }
    }

    console.log(`\n   ✅ ${agency.name}:`)
    console.log(`      Corregidos: ${fixed}`)
    console.log(`      Errores: ${errors}`)
  }

  console.log("\n" + "=".repeat(70))
  console.log("✅ Corrección completada!")
  console.log("=".repeat(70))
}

fixMissingTrelloListId()
  .then(() => {
    console.log("\n✅ Script completado")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n❌ Error:", error)
    process.exit(1)
  })

