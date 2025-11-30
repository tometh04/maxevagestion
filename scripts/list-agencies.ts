#!/usr/bin/env tsx
/**
 * Script para listar todas las agencias disponibles
 * 
 * Uso:
 *   npx tsx scripts/list-agencies.ts
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

async function listAgencies() {
  const { data: agencies, error } = await supabase
    .from("agencies")
    .select("id, name")
    .order("name")

  if (error) {
    console.error("❌ Error:", error)
    process.exit(1)
  }

  console.log("\n📋 Agencias disponibles:\n")
  agencies?.forEach((agency: any) => {
    console.log(`  ${agency.id} - ${agency.name}`)
  })
  console.log("")
}

listAgencies()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error)
    process.exit(1)
  })

