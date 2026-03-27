/**
 * Script para aplicar las optimizaciones de Emilia a la BD
 * Ejecuta: npx tsx scripts/run-emilia-optimizations.ts
 */

import { createClient } from "@supabase/supabase-js"
import * as fs from "fs"
import * as path from "path"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Faltan variables de entorno:")
  console.error("   NEXT_PUBLIC_SUPABASE_URL")
  console.error("   SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runMigration(filePath: string) {
  const fileName = path.basename(filePath)
  console.log(`\n📄 Ejecutando: ${fileName}`)

  try {
    const sql = fs.readFileSync(filePath, "utf-8")

    // Ejecutar SQL
    const { error } = await supabase.rpc("exec_sql", { sql_query: sql }).catch(async () => {
      // Si falla RPC, intentar con from (menos eficiente pero funciona)
      // Dividir en statements y ejecutar uno por uno
      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)

      for (const statement of statements) {
        const { error: stmtError } = await supabase.rpc("exec_sql", { sql_query: statement })
        if (stmtError) throw stmtError
      }

      return { error: null }
    })

    if (error) {
      console.error(`❌ Error en ${fileName}:`, error.message)
      return false
    }

    console.log(`✅ ${fileName} aplicado correctamente`)
    return true
  } catch (error: any) {
    console.error(`❌ Error ejecutando ${fileName}:`, error.message)
    return false
  }
}

async function main() {
  console.log("🚀 Aplicando optimizaciones de Emilia...\n")

  const migrationsDir = path.join(process.cwd(), "supabase", "migrations")

  const migrations = [
    "054_optimize_emilia_indexes.sql",
    "055_create_conversation_rpc.sql",
  ]

  let successCount = 0
  let failCount = 0

  for (const migration of migrations) {
    const filePath = path.join(migrationsDir, migration)

    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ Migración no encontrada: ${migration}`)
      continue
    }

    const success = await runMigration(filePath)
    if (success) {
      successCount++
    } else {
      failCount++
    }
  }

  console.log("\n" + "=".repeat(50))
  console.log(`\n✅ Migraciones exitosas: ${successCount}`)
  console.log(`❌ Migraciones fallidas: ${failCount}`)

  if (failCount === 0) {
    console.log("\n🎉 Todas las optimizaciones fueron aplicadas correctamente!")
    console.log("\nPróximos pasos:")
    console.log("1. Verificá que los índices se crearon: SELECT * FROM pg_indexes WHERE tablename IN ('conversations', 'messages');")
    console.log("2. Verificá la función RPC: SELECT proname FROM pg_proc WHERE proname = 'create_conversation_fast';")
    console.log("3. Probá crear una nueva conversación y verificá los logs de telemetría en la consola del navegador")
  } else {
    console.log("\n⚠️ Algunas migraciones fallaron. Revisá los errores arriba.")
    process.exit(1)
  }
}

main().catch((error) => {
  console.error("❌ Error fatal:", error)
  process.exit(1)
})
