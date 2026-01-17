/**
 * Script para ejecutar la migración 048: partner_accounts
 * 
 * Este script crea las tablas necesarias para el módulo de Cuentas Socios.
 * 
 * USO:
 *   1. Asegúrate de tener las variables de entorno configuradas:
 *      - NEXT_PUBLIC_SUPABASE_URL
 *      - SUPABASE_SERVICE_ROLE_KEY
 * 
 *   2. Ejecuta: npx tsx scripts/run-partner-accounts-migration.ts
 */

import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "fs"
import { join } from "path"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Error: Faltan variables de entorno")
  console.error("   Requiere: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  db: { schema: "public" },
  auth: { autoRefreshToken: false, persistSession: false }
})

async function executeMigration() {
  console.log("🔄 Ejecutando migración 048: partner_accounts...")
  console.log("")

  const sqlPath = join(process.cwd(), "supabase/migrations/048_partner_accounts.sql")
  const sql = readFileSync(sqlPath, "utf-8")

  // Dividir SQL en statements individuales
  const statements = sql
    .split(";")
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith("--"))

  console.log(`📝 Encontrados ${statements.length} statements SQL`)
  console.log("")

  let successCount = 0
  let errorCount = 0

  for (const statement of statements) {
    if (statement.trim()) {
      try {
        console.log(`▶️  Ejecutando: ${statement.substring(0, 60).replace(/\n/g, " ")}...`)
        
        // Usar rpc si está disponible, sino intentar query directo
        const { error } = await supabase.rpc("exec_sql", { sql_query: statement }).catch(() => {
          // Si no hay función rpc, intentar método alternativo
          return { error: { message: "exec_sql no disponible" } }
        })

        if (error && error.message === "exec_sql no disponible") {
          // Método alternativo: ejecutar directamente (no siempre funciona)
          console.log("   ⚠️  No se puede ejecutar automáticamente")
          console.log("   💡 Necesitas ejecutarlo manualmente en Supabase SQL Editor")
          errorCount++
        } else if (error) {
          console.error(`   ❌ Error: ${error.message}`)
          errorCount++
        } else {
          console.log(`   ✅ Ejecutado correctamente`)
          successCount++
        }
      } catch (err: any) {
        console.error(`   ❌ Error: ${err.message}`)
        errorCount++
      }
    }
  }

  console.log("")
  console.log("=".repeat(60))
  console.log("📊 Resumen:")
  console.log(`   ✅ Exitosos: ${successCount}`)
  console.log(`   ❌ Errores: ${errorCount}`)
  console.log("=".repeat(60))

  if (errorCount > 0 || successCount === 0) {
    console.log("")
    console.log("⚠️  No se pudo ejecutar automáticamente.")
    console.log("")
    console.log("📋 INSTRUCCIONES MANUALES:")
    console.log("")
    console.log("1. Abre el SQL Editor de Supabase:")
    console.log("   https://supabase.com/dashboard/project/pmqvplyyxiobkllapgjp/sql/new")
    console.log("")
    console.log("2. Copia y pega TODO este SQL:")
    console.log("")
    console.log("-".repeat(60))
    console.log(sql)
    console.log("-".repeat(60))
    console.log("")
    console.log("3. Presiona Cmd+Enter (Mac) o Ctrl+Enter (Windows/Linux)")
    console.log("")
    console.log("4. Espera a ver 'Success' o 'Success. No rows returned'")
    console.log("")
    console.log("5. ¡Listo! Las tablas estarán creadas.")
    console.log("")
  } else {
    console.log("")
    console.log("✅ ¡Migración completada exitosamente!")
    console.log("   Las tablas partner_accounts y partner_withdrawals están listas para usar.")
  }
}

executeMigration().catch((error) => {
  console.error("❌ Error fatal:", error)
  process.exit(1)
})
