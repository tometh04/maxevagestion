import { readFileSync } from "fs"
import { join } from "path"

console.log("📘 FASE 1: MIGRACIONES CONTABLES")
console.log("=" .repeat(70))
console.log("")

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

console.log("📋 INSTRUCCIONES:")
console.log("")
console.log("1. Abre el SQL Editor en Supabase:")
console.log("   https://supabase.com/dashboard/project/_/sql/new")
console.log("")
console.log("2. Ejecuta PRIMERO la migración 006 (financial_accounts)")
console.log("3. Luego ejecuta la migración 005 (ledger_movements)")
console.log("")
console.log("=" .repeat(70))
console.log("")
console.log("📄 MIGRACIÓN 006: financial_accounts (EJECUTAR PRIMERO)")
console.log("=" .repeat(70))
console.log(migration006SQL)
console.log("")
console.log("=" .repeat(70))
console.log("")
console.log("📄 MIGRACIÓN 005: ledger_movements (EJECUTAR SEGUNDO)")
console.log("=" .repeat(70))
console.log(migration005SQL)
console.log("")
console.log("=" .repeat(70))
console.log("")
console.log("✅ Después de ejecutar ambas migraciones, continúa con la Fase 2")

