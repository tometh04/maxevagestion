import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "fs"
import { join } from "path"
import { config } from "dotenv"

// Load environment variables
config({ path: join(process.cwd(), ".env.local") })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Error: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben estar configurados en .env.local")
  process.exit(1)
}

const supabase = createClient(supabaseUrl!, supabaseServiceKey!, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const migrations = [
  "014_create_quotations.sql",
  "015_create_tariffs_and_quotas.sql",
  "016_create_multiple_cash_boxes.sql",
  "017_create_payment_coupons.sql",
  "018_create_card_transactions.sql",
  "019_create_non_touristic_movements.sql",
]

async function executeSQL(sql: string): Promise<boolean> {
  try {
    // Try to execute via REST API directly
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseServiceKey!,
        "Authorization": `Bearer ${supabaseServiceKey!}`,
      },
      body: JSON.stringify({ sql_query: sql }),
    })

    if (response.ok) {
      return true
    }

    // If that doesn't work, try creating a temporary function
    const createFunctionSQL = `
      CREATE OR REPLACE FUNCTION exec_sql(sql_query text)
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      BEGIN
        EXECUTE sql_query;
      END;
      $$;
    `

    // Try to create the function first
    const funcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseServiceKey!,
        "Authorization": `Bearer ${supabaseServiceKey!}`,
      },
      body: JSON.stringify({ sql_query: createFunctionSQL }),
    })

    // Then try executing the actual SQL
    if (funcResponse.ok) {
      const execResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        "apikey": supabaseServiceKey!,
        "Authorization": `Bearer ${supabaseServiceKey!}`,
        },
        body: JSON.stringify({ sql_query: sql }),
      })

      return execResponse.ok
    }

    return false
  } catch (error) {
    console.error("Error executing SQL:", error)
    return false
  }
}

async function runMigration(filename: string) {
  console.log(`\n📄 Ejecutando migración: ${filename}`)
  
  try {
    const filePath = join(process.cwd(), "supabase", "migrations", filename)
    const sql = readFileSync(filePath, "utf-8")
    
    // Remove comments and empty lines for cleaner output
    const cleanSQL = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--") || line.trim().length === 0)
      .join("\n")
    
    // Execute the SQL
    const success = await executeSQL(cleanSQL)
    
    if (success) {
      console.log(`  ✅ Migración ${filename} ejecutada correctamente`)
      return true
    } else {
      console.log(`  ⚠️  No se pudo ejecutar automáticamente. Mostrando SQL para ejecución manual:`)
      console.log("\n" + "=".repeat(60))
      console.log(cleanSQL)
      console.log("=".repeat(60) + "\n")
      return false
    }
  } catch (error: any) {
    console.error(`  ❌ Error procesando ${filename}:`, error.message)
    return false
  }
}

async function main() {
  console.log("🚀 Iniciando ejecución de migraciones...")
  console.log(`📦 Total de migraciones: ${migrations.length}`)
  console.log(`🔗 Supabase URL: ${supabaseUrl}`)
  
  let successCount = 0
  let failCount = 0
  const failedMigrations: string[] = []
  
  for (const migration of migrations) {
    const success = await runMigration(migration)
    if (success) {
      successCount++
    } else {
      failCount++
      failedMigrations.push(migration)
    }
    
    // Small delay between migrations
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  
  console.log("\n" + "=".repeat(60))
  console.log("📊 Resumen de ejecución:")
  console.log(`  ✅ Exitosas: ${successCount}/${migrations.length}`)
  console.log(`  ❌ Fallidas: ${failCount}/${migrations.length}`)
  console.log("=".repeat(60))
  
  if (failCount > 0) {
    console.log("\n⚠️  Algunas migraciones no se pudieron ejecutar automáticamente.")
    console.log("💡 Opciones:")
    console.log("   1. Ejecuta el SQL mostrado arriba manualmente en el SQL Editor de Supabase")
    console.log("   2. O usa el comando: psql para ejecutar directamente")
    console.log("\n📋 Migraciones que requieren ejecución manual:")
    failedMigrations.forEach((m) => console.log(`   - ${m}`))
  } else {
    console.log("\n✅ Todas las migraciones se ejecutaron correctamente!")
    console.log("🎉 Base de datos actualizada con todas las nuevas funcionalidades!")
  }
}

main().catch((error) => {
  console.error("❌ Error fatal:", error)
  process.exit(1)
})
