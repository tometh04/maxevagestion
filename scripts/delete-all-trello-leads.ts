#!/usr/bin/env tsx
/**
 * Script para borrar TODOS los leads de Trello de forma limpia
 * 
 * Uso:
 *   npx tsx scripts/delete-all-trello-leads.ts
 */

import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import { resolve } from "path"
import { readFileSync } from "fs"

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

async function deleteAllTrelloLeads() {
  console.log("🗑️  BORRANDO TODOS LOS LEADS DE TRELLO")
  console.log("=".repeat(60))
  console.log("")

  // 1. Verificar conteo antes
  const { count: beforeCount } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("source", "Trello")

  console.log(`📊 Leads de Trello encontrados: ${beforeCount || 0}`)
  console.log("")

  if ((beforeCount || 0) === 0) {
    console.log("✅ No hay leads de Trello para borrar")
    return
  }

  // 2. Borrar documentos asociados
  console.log("🗑️  Borrando documentos asociados...")
  const { data: docsToDelete } = await supabase
    .from("documents")
    .select("id")
    .in(
      "lead_id",
      (await supabase.from("leads").select("id").eq("source", "Trello")).data?.map((l: any) => l.id) || []
    )

  if (docsToDelete && docsToDelete.length > 0) {
    const { error: docsError } = await supabase
      .from("documents")
      .delete()
      .in("id", docsToDelete.map((d: any) => d.id))
    console.log(`   ${docsError ? "❌" : "✅"} Documentos: ${docsError ? "Error" : `${docsToDelete.length} borrados`}`)
  } else {
    console.log("   ✅ No hay documentos asociados")
  }

  // 3. Borrar alertas asociadas
  console.log("🗑️  Borrando alertas asociadas...")
  const { data: alertsToDelete } = await supabase
    .from("alerts")
    .select("id")
    .in(
      "lead_id",
      (await supabase.from("leads").select("id").eq("source", "Trello")).data?.map((l: any) => l.id) || []
    )

  if (alertsToDelete && alertsToDelete.length > 0) {
    const { error: alertsError } = await supabase
      .from("alerts")
      .delete()
      .in("id", alertsToDelete.map((a: any) => a.id))
    console.log(`   ${alertsError ? "❌" : "✅"} Alertas: ${alertsError ? "Error" : `${alertsToDelete.length} borradas`}`)
  } else {
    console.log("   ✅ No hay alertas asociadas")
  }

  // 4. Borrar comunicaciones asociadas
  console.log("🗑️  Borrando comunicaciones asociadas...")
  const { data: commsToDelete } = await supabase
    .from("communications")
    .select("id")
    .in(
      "lead_id",
      (await supabase.from("leads").select("id").eq("source", "Trello")).data?.map((l: any) => l.id) || []
    )

  if (commsToDelete && commsToDelete.length > 0) {
    const { error: commsError } = await supabase
      .from("communications")
      .delete()
      .in("id", commsToDelete.map((c: any) => c.id))
    console.log(`   ${commsError ? "❌" : "✅"} Comunicaciones: ${commsError ? "Error" : `${commsToDelete.length} borradas`}`)
  } else {
    console.log("   ✅ No hay comunicaciones asociadas")
  }

  // 5. Borrar cotizaciones asociadas
  console.log("🗑️  Borrando cotizaciones asociadas...")
  const { data: quotesToDelete } = await supabase
    .from("quotations")
    .select("id")
    .in(
      "lead_id",
      (await supabase.from("leads").select("id").eq("source", "Trello")).data?.map((l: any) => l.id) || []
    )

  if (quotesToDelete && quotesToDelete.length > 0) {
    const { error: quotesError } = await supabase
      .from("quotations")
      .delete()
      .in("id", quotesToDelete.map((q: any) => q.id))
    console.log(`   ${quotesError ? "❌" : "✅"} Cotizaciones: ${quotesError ? "Error" : `${quotesToDelete.length} borradas`}`)
  } else {
    console.log("   ✅ No hay cotizaciones asociadas")
  }

  // 6. Limpiar referencias en ledger_movements
  console.log("🔄 Limpiando referencias en ledger_movements...")
  const { error: ledgerError } = await supabase
    .from("ledger_movements")
    .update({ lead_id: null })
    .in(
      "lead_id",
      (await supabase.from("leads").select("id").eq("source", "Trello")).data?.map((l: any) => l.id) || []
    )
  console.log(`   ${ledgerError ? "❌" : "✅"} Referencias limpiadas`)

  // 7. Limpiar referencias en operations
  console.log("🔄 Limpiando referencias en operations...")
  const { error: opsError } = await supabase
    .from("operations")
    .update({ lead_id: null })
    .in(
      "lead_id",
      (await supabase.from("leads").select("id").eq("source", "Trello")).data?.map((l: any) => l.id) || []
    )
  console.log(`   ${opsError ? "❌" : "✅"} Referencias limpiadas`)

  // 8. BORRAR TODOS LOS LEADS DE TRELLO
  console.log("")
  console.log("🗑️  BORRANDO TODOS LOS LEADS DE TRELLO...")
  const { error: deleteError } = await supabase.from("leads").delete().eq("source", "Trello")

  if (deleteError) {
    console.error("❌ Error borrando leads:", deleteError)
    process.exit(1)
  }

  console.log(`✅ ${beforeCount || 0} leads borrados`)

  // 9. Resetear last_sync_at
  console.log("")
  console.log("🔄 Reseteando last_sync_at en settings_trello...")
  const { error: resetError } = await supabase
    .from("settings_trello")
    .update({
      last_sync_at: null,
      updated_at: new Date().toISOString(),
    })

  console.log(`   ${resetError ? "❌" : "✅"} last_sync_at reseteado`)

  // 10. Verificar resultado
  console.log("")
  console.log("🔍 Verificando resultado...")
  const { count: afterCount } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("source", "Trello")

  console.log("")
  console.log("=".repeat(60))
  if ((afterCount || 0) === 0) {
    console.log("✅ ¡TODOS LOS LEADS DE TRELLO FUERON BORRADOS EXITOSAMENTE!")
  } else {
    console.log(`⚠️  Aún quedan ${afterCount || 0} leads de Trello`)
  }
  console.log("=".repeat(60))
  console.log("")
  console.log("📊 Resumen:")
  console.log(`   Antes: ${beforeCount || 0} leads`)
  console.log(`   Después: ${afterCount || 0} leads`)
  console.log(`   Borrados: ${(beforeCount || 0) - (afterCount || 0)} leads`)
  console.log("")
  console.log("💡 Ahora puedes ejecutar la sincronización completa desde cero")
}

deleteAllTrelloLeads()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error("❌ Error fatal:", error)
    process.exit(1)
  })

