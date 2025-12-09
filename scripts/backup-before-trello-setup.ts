#!/usr/bin/env tsx
/**
 * Script de backup antes de configurar Trello
 * Crea un backup completo de la base de datos
 */

import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import { resolve } from "path"
import { writeFileSync } from "fs"

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

async function createBackup() {
  console.log("💾 Creando backup de la base de datos...")
  console.log("=".repeat(60))
  console.log("")

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const backupDir = resolve(__dirname, "../backups")
  
  // Crear directorio de backups si no existe
  try {
    const { mkdirSync } = require("fs")
    mkdirSync(backupDir, { recursive: true })
  } catch (e) {
    // Ya existe
  }

  const backup: any = {
    timestamp,
    tables: {},
  }

  // Tablas importantes a respaldar
  const tables = [
    "leads",
    "operations",
    "customers",
    "payments",
    "documents",
    "settings_trello",
    "agencies",
    "users",
    "operators",
  ]

  for (const table of tables) {
    console.log(`📦 Respaldando tabla: ${table}...`)
    
    const { data, error } = await supabase.from(table).select("*")
    
    if (error) {
      console.error(`   ❌ Error en ${table}:`, error.message)
      backup.tables[table] = { error: error.message }
    } else {
      backup.tables[table] = data || []
      console.log(`   ✅ ${data?.length || 0} registros respaldados`)
    }
  }

  // Guardar backup
  const backupFile = resolve(backupDir, `backup-${timestamp}.json`)
  writeFileSync(backupFile, JSON.stringify(backup, null, 2))

  console.log("")
  console.log("=".repeat(60))
  console.log(`✅ Backup creado exitosamente`)
  console.log(`📁 Archivo: ${backupFile}`)
  console.log("=".repeat(60))

  // Resumen
  let totalRecords = 0
  for (const [table, data] of Object.entries(backup.tables)) {
    if (Array.isArray(data)) {
      totalRecords += data.length
    }
  }

  console.log("")
  console.log("📊 Resumen del backup:")
  console.log(`   Tablas respaldadas: ${tables.length}`)
  console.log(`   Total de registros: ${totalRecords}`)
  console.log("")
}

createBackup()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error("❌ Error fatal:", error)
    process.exit(1)
  })

