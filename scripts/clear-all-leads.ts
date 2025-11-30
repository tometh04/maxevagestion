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
  
  // Borrar todos los leads en batches (Supabase tiene límites)
  let deleted = 0
  let hasMore = true
  
  while (hasMore) {
    // Obtener un batch de IDs
    const { data: batch } = await supabase
      .from("leads")
      .select("id")
      .limit(1000)
    
    if (!batch || batch.length === 0) {
      hasMore = false
      break
    }
    
    const ids = batch.map(l => l.id)
    
    // Borrar el batch
    const { error } = await supabase
      .from("leads")
      .delete()
      .in("id", ids)
    
    if (error) {
      console.error("❌ Error al borrar batch:", error)
      throw error
    }
    
    deleted += ids.length
    console.log(`🗑️  Borrados ${deleted} leads...`)
  }
  
  if (error) {
    console.error("❌ Error al borrar leads:", error)
    process.exit(1)
  }
  
  // Verificar que se borraron
  const { count: afterCount } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
  
  console.log(`✅ Leads después: ${afterCount || 0}`)
  console.log(`✅ Total borrados: ${deleted} leads`)
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

