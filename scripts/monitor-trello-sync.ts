#!/usr/bin/env tsx
/**
 * Script para monitorear el progreso de la sincronización de Trello
 * 
 * Uso:
 *   npx tsx scripts/monitor-trello-sync.ts
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

async function monitorSync() {
  console.log("📊 MONITOR DE SINCRONIZACIÓN DE TRELLO")
  console.log("=".repeat(60))
  console.log("")

  // 1. Verificar configuración de Trello
  console.log("1️⃣ Configuración de Trello:")
  const { data: settings } = await supabase
    .from("settings_trello")
    .select("*, agencies(name)")
  
  if (!settings || settings.length === 0) {
    console.log("   ❌ No hay configuración de Trello")
  } else {
    for (const setting of settings) {
      const agency = (setting as any).agencies
      console.log(`   ✅ ${agency?.name || "Agencia desconocida"}:`)
      console.log(`      Board ID: ${(setting as any).board_id}`)
      console.log(`      Listas mapeadas: ${Object.keys((setting as any).list_status_mapping || {}).length}`)
      console.log(`      Última sincronización: ${(setting as any).last_sync_at || "Nunca"}`)
    }
  }

  console.log("")

  // 2. Contar leads de Trello
  console.log("2️⃣ Leads de Trello:")
  const { count: totalLeads } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("source", "Trello")
  
  console.log(`   Total: ${totalLeads || 0}`)

  // Contar por agencia
  const { data: agencies } = await supabase
    .from("agencies")
    .select("id, name")
  
  if (agencies) {
    for (const agency of agencies) {
      const { count } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("source", "Trello")
        .eq("agency_id", agency.id)
      
      console.log(`   ${agency.name}: ${count || 0}`)
    }
  }

  console.log("")

  // 3. Contar por status
  console.log("3️⃣ Leads por Status:")
  const statuses = ["NEW", "IN_PROGRESS", "QUOTED", "WON", "LOST"]
  for (const status of statuses) {
    const { count } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("source", "Trello")
      .eq("status", status)
    
    console.log(`   ${status}: ${count || 0}`)
  }

  console.log("")

  // 4. Contar por región
  console.log("4️⃣ Leads por Región:")
  const regions = ["ARGENTINA", "CARIBE", "BRASIL", "EUROPA", "EEUU", "OTROS", "CRUCEROS"]
  for (const region of regions) {
    const { count } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("source", "Trello")
      .eq("region", region)
    
    if ((count || 0) > 0) {
      console.log(`   ${region}: ${count || 0}`)
    }
  }

  console.log("")

  // 5. Verificar leads con lista asignada
  console.log("5️⃣ Leads con Lista de Trello Asignada:")
  const { count: withList } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("source", "Trello")
    .not("trello_list_id", "is", null)
  
  const { count: withoutList } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("source", "Trello")
    .is("trello_list_id", null)
  
  console.log(`   Con lista: ${withList || 0}`)
  console.log(`   Sin lista: ${withoutList || 0}`)

  console.log("")

  // 6. Verificar leads con datos completos
  console.log("6️⃣ Leads con Datos Completos:")
  const { count: withFullData } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("source", "Trello")
    .not("trello_full_data", "is", null)
  
  console.log(`   Con trello_full_data: ${withFullData || 0}`)

  // 7. Verificar leads recientes (últimos 10)
  console.log("")
  console.log("7️⃣ Últimos 10 Leads Sincronizados:")
  const { data: recentLeads } = await supabase
    .from("leads")
    .select("contact_name, status, region, trello_list_id, created_at, updated_at")
    .eq("source", "Trello")
    .order("updated_at", { ascending: false })
    .limit(10)
  
  if (recentLeads && recentLeads.length > 0) {
    for (const lead of recentLeads) {
      console.log(`   ${(lead as any).contact_name} - ${(lead as any).status} / ${(lead as any).region}`)
      console.log(`      Lista ID: ${(lead as any).trello_list_id || "Sin lista"}`)
      console.log(`      Actualizado: ${new Date((lead as any).updated_at).toLocaleString()}`)
    }
  } else {
    console.log("   No hay leads sincronizados aún")
  }

  console.log("")
  console.log("=".repeat(60))
}

// Ejecutar cada 5 segundos
const interval = setInterval(async () => {
  console.clear()
  await monitorSync()
  console.log("")
  console.log("⏱️  Actualizando cada 5 segundos... (Ctrl+C para salir)")
}, 5000)

// Primera ejecución inmediata
monitorSync().then(() => {
  console.log("")
  console.log("⏱️  Actualizando cada 5 segundos... (Ctrl+C para salir)")
})

// Manejar Ctrl+C
process.on("SIGINT", () => {
  clearInterval(interval)
  console.log("\n\n✅ Monitor detenido")
  process.exit(0)
})

