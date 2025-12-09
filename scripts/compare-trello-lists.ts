#!/usr/bin/env tsx
/**
 * Comparar listas de Trello con leads en BD
 */

import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import { resolve } from "path"

dotenv.config({ path: resolve(__dirname, "../.env.local") })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Usar variables de entorno - NO hardcodear tokens
const TRELLO_API_KEY = process.env.TRELLO_API_KEY || ""
const TRELLO_TOKEN = process.env.TRELLO_TOKEN || ""

if (!TRELLO_API_KEY || !TRELLO_TOKEN) {
  console.error("❌ Faltan TRELLO_API_KEY o TRELLO_TOKEN en variables de entorno")
  process.exit(1)
}
const BOARD_ID = "kZh4zJ0J"

async function compareLists() {
  console.log("🔍 Comparando listas de Trello con leads en BD...")
  console.log("")

  // Obtener listas de Trello
  const listsResponse = await fetch(
    `https://api.trello.com/1/boards/${BOARD_ID}/lists?key=${TRELLO_API_KEY}&token=${TRELLO_TOKEN}&filter=open&fields=id,name,pos`
  )
  const trelloLists = await listsResponse.json()

  console.log("📋 Listas en Trello (ordenadas por posición):")
  trelloLists.sort((a: any, b: any) => (a.pos || 0) - (b.pos || 0))
  trelloLists.forEach((list: any, index: number) => {
    console.log(`   ${index + 1}. ${list.name} (ID: ${list.id})`)
  })

  console.log("")
  console.log("📊 Listas con leads en BD:")

  // Obtener todas las listas únicas de los leads
  const { data: leads } = await supabase
    .from("leads")
    .select("trello_list_id")
    .eq("source", "Trello")
    .not("trello_list_id", "is", null)

  const uniqueListIds = new Set(leads?.map((l: any) => l.trello_list_id) || [])

  console.log(`   Total listas con leads: ${uniqueListIds.size}`)
  console.log("")

  // Comparar
  console.log("🔍 Comparación:")
  let matched = 0
  let notMatched = 0

  for (const list of trelloLists) {
    const hasLeads = uniqueListIds.has(list.id)
    if (hasLeads) {
      matched++
      const { count } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("source", "Trello")
        .eq("trello_list_id", list.id)
      console.log(`   ✅ ${list.name}: ${count || 0} leads (ID coincide)`)
    } else {
      notMatched++
      console.log(`   ❌ ${list.name}: 0 leads (ID no coincide o sin leads)`)
    }
  }

  console.log("")
  console.log(`📊 Resumen:`)
  console.log(`   Listas en Trello: ${trelloLists.length}`)
  console.log(`   Listas con coincidencias: ${matched}`)
  console.log(`   Listas sin coincidencias: ${notMatched}`)

  // Verificar IDs que están en BD pero no en Trello
  const trelloListIds = new Set(trelloLists.map((l: any) => l.id))
  const orphanListIds = Array.from(uniqueListIds).filter((id) => !trelloListIds.has(id))

  if (orphanListIds.length > 0) {
    console.log("")
    console.log("⚠️  Listas en BD que NO están en Trello:")
    for (const id of orphanListIds) {
      const { count } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("source", "Trello")
        .eq("trello_list_id", id)
      console.log(`   ID: ${id}: ${count || 0} leads`)
    }
  }
}

compareLists()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error)
    process.exit(1)
  })

