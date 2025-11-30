#!/usr/bin/env tsx
/**
 * Script para borrar TODOS los leads de la base de datos
 * 
 * Uso:
 *   npx tsx scripts/clear-all-leads.ts
 */

import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import { resolve } from "path"

dotenv.config({ path: resolve(__dirname, "../.env.local") })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Faltan variables de entorno:")
  console.error("   - NEXT_PUBLIC_SUPABASE_URL")
  console.error("   - SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function clearAllLeads() {
  console.log("🗑️  Borrando TODOS los leads...")
  
  // Contar leads antes de borrar
  const { count: beforeCount } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
  
  console.log(`📊 Leads antes: ${beforeCount || 0}`)
  
  // Borrar todos los leads
  const { error, count } = await supabase
    .from("leads")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000") // Delete all (trick to delete all rows)
  
  if (error) {
    console.error("❌ Error al borrar leads:", error)
    process.exit(1)
  }
  
  // Verificar que se borraron
  const { count: afterCount } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
  
  console.log(`✅ Leads después: ${afterCount || 0}`)
  console.log(`✅ Borrados: ${(beforeCount || 0) - (afterCount || 0)} leads`)
}

clearAllLeads()
  .then(() => {
    console.log("\n✅ Proceso completado")
    process.exit(0)
  })
  .catch((error) => {
    console.error("❌ Error:", error)
    process.exit(1)
  })

