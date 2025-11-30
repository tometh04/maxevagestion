import { readFileSync, writeFileSync } from "fs"
import { join } from "path"

const migrations = [
  "014_create_quotations.sql",
  "015_create_tariffs_and_quotas.sql",
  "016_create_multiple_cash_boxes.sql",
  "017_create_payment_coupons.sql",
  "018_create_card_transactions.sql",
  "019_create_non_touristic_movements.sql",
]

const outputFile = join(process.cwd(), "supabase", "migrations", "ALL_NEW_MIGRATIONS.sql")

let combinedSQL = `-- =====================================================
-- MIGRACIONES COMBINADAS - FUNCIONALIDADES DE SAVIA
-- =====================================================
-- Este archivo contiene todas las migraciones nuevas
-- Ejecuta este archivo completo en el SQL Editor de Supabase
-- Fecha: ${new Date().toISOString()}
-- =====================================================

`

migrations.forEach((filename, index) => {
  const filePath = join(process.cwd(), "supabase", "migrations", filename)
  const sql = readFileSync(filePath, "utf-8")
  
  combinedSQL += `\n-- =====================================================\n`
  combinedSQL += `-- MIGRACIÓN ${index + 1}/${migrations.length}: ${filename}\n`
  combinedSQL += `-- =====================================================\n\n`
  combinedSQL += sql
  combinedSQL += `\n\n`
})

writeFileSync(outputFile, combinedSQL, "utf-8")

console.log("✅ Archivo combinado creado exitosamente!")
console.log(`📄 Ubicación: ${outputFile}`)
console.log("\n💡 Instrucciones:")
console.log("   1. Abre el SQL Editor en tu proyecto de Supabase")
console.log("   2. Copia y pega el contenido del archivo ALL_NEW_MIGRATIONS.sql")
console.log("   3. Ejecuta el SQL completo")
console.log("\n🚀 ¡Listo para ejecutar!")

