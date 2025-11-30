import { readFileSync } from "fs"
import { join } from "path"
import * as dotenv from "dotenv"

// Cargar variables de entorno
dotenv.config({ path: join(process.cwd(), ".env.local") })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Faltan variables de entorno")
  process.exit(1)
}

// Extraer project reference de la URL
const projectRef = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1]

if (!projectRef) {
  console.error("❌ No se pudo extraer project reference de la URL")
  process.exit(1)
}

async function executeMigration(sql: string, description: string) {
  console.log(`\n🔄 ${description}`)
  console.log("-".repeat(60))

  try {
    // Usar Management API de Supabase
    // Nota: Esto requiere un access token del Management API, no la service role key
    // Por ahora, mostramos el SQL para ejecutar manualmente
    
    console.log("📋 SQL a ejecutar:")
    console.log("")
    console.log(sql)
    console.log("")
    console.log("=" .repeat(60))
    
    return true
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`)
    return false
  }
}

async function main() {
  console.log("🚀 FASE 1: MIGRACIONES CONTABLES")
  console.log("=" .repeat(60))
  console.log("")
  console.log("⚠️  NOTA: Supabase no permite ejecutar SQL directamente desde scripts.")
  console.log("   Debes ejecutar estas migraciones manualmente en el SQL Editor.")
  console.log("")
  console.log("📝 Pasos:")
  console.log("   1. Abre: https://supabase.com/dashboard/project/" + projectRef + "/sql/new")
  console.log("   2. Ejecuta PRIMERO la migración 006")
  console.log("   3. Luego ejecuta la migración 005")
  console.log("")
  console.log("=" .repeat(60))

  // Leer migraciones
  const migration006Path = join(
    process.cwd(),
    "supabase/migrations/006_create_financial_accounts.sql"
  )
  const migration005Path = join(
    process.cwd(),
    "supabase/migrations/005_create_ledger_movements.sql"
  )

  const migration006SQL = readFileSync(migration006Path, "utf-8")
  const migration005SQL = readFileSync(migration005Path, "utf-8")

  await executeMigration(migration006SQL, "MIGRACIÓN 006: financial_accounts (EJECUTAR PRIMERO)")
  await executeMigration(migration005SQL, "MIGRACIÓN 005: ledger_movements (EJECUTAR SEGUNDO)")

  console.log("\n✅ Instrucciones mostradas arriba")
  console.log("📋 Copia cada SQL y ejecútalo en el SQL Editor de Supabase")
  console.log("\n🎯 Después de ejecutar ambas, continuamos con la Fase 2")
}

main().catch(console.error)

