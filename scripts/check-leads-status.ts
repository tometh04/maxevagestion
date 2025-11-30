#!/usr/bin/env tsx
/**
 * Script para verificar el estado de los leads importados
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

async function checkLeads() {
  // Total leads
  const { count: total } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
  
  // Leads de Trello
  const { count: trelloLeads } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("source", "Trello")
  
  // Leads con trello_list_id
  const { count: withListId } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .not("trello_list_id", "is", null)
  
  // Leads sin trello_list_id pero de Trello
  const { count: trelloWithoutList } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("source", "Trello")
    .is("trello_list_id", null)
  
  // Leads por agencia
  const { data: byAgency } = await supabase
    .from("leads")
    .select("agency_id, agencies(name)")
    .eq("source", "Trello")
  
  const agencyCounts = (byAgency || []).reduce((acc: any, lead: any) => {
    const agencyName = lead.agencies?.name || "Unknown"
    acc[agencyName] = (acc[agencyName] || 0) + 1
    return acc
  }, {})
  
  console.log("\n📊 ESTADO DE LEADS:")
  console.log("=".repeat(60))
  console.log(`Total leads: ${total || 0}`)
  console.log(`Leads de Trello: ${trelloLeads || 0}`)
  console.log(`Con trello_list_id: ${withListId || 0}`)
  console.log(`Sin trello_list_id (Trello): ${trelloWithoutList || 0}`)
  console.log("\n📋 Por agencia:")
  Object.entries(agencyCounts).forEach(([name, count]) => {
    console.log(`  ${name}: ${count}`)
  })
  console.log("=".repeat(60))
  
  // Muestra algunos ejemplos
  const { data: sample } = await supabase
    .from("leads")
    .select("contact_name, trello_list_id, source, agencies(name)")
    .eq("source", "Trello")
    .limit(10)
  
  console.log("\n📋 Ejemplos de leads:")
  sample?.forEach((lead: any) => {
    console.log(`  - ${lead.contact_name} | Lista: ${lead.trello_list_id || "SIN LISTA"} | Agencia: ${lead.agencies?.name}`)
  })
}

checkLeads()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error)
    process.exit(1)
  })

