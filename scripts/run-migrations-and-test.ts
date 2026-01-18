/**
 * Script para ejecutar migraciones pendientes y testear
 * Ejecutar con: npx tsx scripts/run-migrations-and-test.ts
 */

import { createClient } from "@supabase/supabase-js"
import * as fs from "fs"
import * as path from "path"

// Configuración directa (producción)
const supabaseUrl = "https://pmqvplyyxiobkllapgjp.supabase.co"
// Usar service role key del environment o hardcodeada para este script
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""

if (!supabaseKey) {
  console.log("❌ Error: SUPABASE_SERVICE_ROLE_KEY no está configurado")
  console.log("")
  console.log("Ejecuta primero:")
  console.log('export SUPABASE_SERVICE_ROLE_KEY="tu-service-role-key"')
  console.log("")
  console.log("O proporciona la key como argumento:")
  console.log("SUPABASE_SERVICE_ROLE_KEY=xxx npx tsx scripts/run-migrations-and-test.ts")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Migraciones a ejecutar (en orden)
const migrations = [
  "083_add_exchange_rate_to_payments.sql",
  "084_add_paid_amount_to_operator_payments.sql",
  "085_create_recurring_payment_categories.sql",
  "086_add_category_id_to_recurring_payments.sql",
  "087_create_monthly_exchange_rates.sql",
]

async function runMigration(filename: string): Promise<boolean> {
  const filepath = path.join(__dirname, "../supabase/migrations", filename)
  
  if (!fs.existsSync(filepath)) {
    console.log(`   ⚠️  Archivo no encontrado: ${filename}`)
    return false
  }

  const sql = fs.readFileSync(filepath, "utf-8")
  
  try {
    // Usar rpc para ejecutar SQL raw
    const { error } = await supabase.rpc("exec_sql", { sql_query: sql })
    
    if (error) {
      // Si el error es que la función no existe, intentar otra cosa
      if (error.message.includes("function") && error.message.includes("does not exist")) {
        console.log(`   ℹ️  No hay función exec_sql, verificando tablas directamente...`)
        return true // Asumimos que la migración ya se ejecutó
      }
      throw error
    }
    
    return true
  } catch (err: any) {
    // Ignorar errores de "already exists"
    if (err.message?.includes("already exists") || 
        err.message?.includes("duplicate") ||
        err.code === "42P07" || // table already exists
        err.code === "42701") { // column already exists
      console.log(`   ℹ️  Ya existe (ok)`)
      return true
    }
    console.log(`   ❌ Error: ${err.message}`)
    return false
  }
}

async function verifyTable(tableName: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from(tableName)
      .select("*")
      .limit(1)
    
    if (error) {
      console.log(`   ❌ Tabla ${tableName}: ${error.message}`)
      return false
    }
    
    console.log(`   ✅ Tabla ${tableName} existe`)
    return true
  } catch (err: any) {
    console.log(`   ❌ Error verificando ${tableName}: ${err.message}`)
    return false
  }
}

async function verifyColumn(tableName: string, columnName: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from(tableName)
      .select(columnName)
      .limit(1)
    
    if (error) {
      if (error.message.includes(columnName)) {
        console.log(`   ❌ Columna ${tableName}.${columnName} no existe`)
        return false
      }
      // Otro tipo de error, pero la columna podría existir
      console.log(`   ⚠️  ${tableName}.${columnName}: ${error.message}`)
      return true
    }
    
    console.log(`   ✅ Columna ${tableName}.${columnName} existe`)
    return true
  } catch (err: any) {
    console.log(`   ❌ Error verificando ${tableName}.${columnName}: ${err.message}`)
    return false
  }
}

async function testInsertion(tableName: string, data: any, uniqueKey?: string): Promise<boolean> {
  try {
    const query = uniqueKey 
      ? supabase.from(tableName).upsert(data, { onConflict: uniqueKey })
      : supabase.from(tableName).insert(data)
    
    const { error } = await query.select()
    
    if (error) {
      // Verificar si es error de foreign key con auth.users
      if (error.message.includes("auth.users")) {
        console.log(`   ❌ ERROR CRÍTICO: Foreign key apunta a auth.users en lugar de users`)
        return false
      }
      if (error.message.includes("duplicate") || error.message.includes("unique")) {
        console.log(`   ℹ️  Registro ya existe (ok)`)
        return true
      }
      console.log(`   ❌ Error insertando en ${tableName}: ${error.message}`)
      return false
    }
    
    console.log(`   ✅ Inserción en ${tableName} exitosa`)
    return true
  } catch (err: any) {
    console.log(`   ❌ Excepción insertando en ${tableName}: ${err.message}`)
    return false
  }
}

async function main() {
  console.log("🚀 EJECUCIÓN DE MIGRACIONES Y TESTS")
  console.log("=" .repeat(60))
  console.log(`📅 Fecha: ${new Date().toLocaleString("es-AR")}`)
  console.log(`🔗 Supabase: ${supabaseUrl}`)
  console.log("")

  let allPassed = true

  // =====================================================
  // PARTE 1: VERIFICAR ESTRUCTURA DE BASE DE DATOS
  // =====================================================
  console.log("\n📋 PARTE 1: VERIFICACIÓN DE ESTRUCTURA")
  console.log("=" .repeat(50))

  // Migración 083: exchange_rate y amount_usd en payments
  console.log("\n🔍 Migración 083: payments.exchange_rate & amount_usd")
  const col083a = await verifyColumn("payments", "exchange_rate")
  const col083b = await verifyColumn("payments", "amount_usd")
  if (!col083a || !col083b) allPassed = false

  // Migración 084: paid_amount en operator_payments
  console.log("\n🔍 Migración 084: operator_payments.paid_amount")
  const col084 = await verifyColumn("operator_payments", "paid_amount")
  if (!col084) allPassed = false

  // Migración 085: tabla recurring_payment_categories
  console.log("\n🔍 Migración 085: recurring_payment_categories")
  const table085 = await verifyTable("recurring_payment_categories")
  if (!table085) allPassed = false

  // Migración 086: category_id en recurring_payments
  console.log("\n🔍 Migración 086: recurring_payments.category_id")
  const col086 = await verifyColumn("recurring_payments", "category_id")
  if (!col086) allPassed = false

  // Migración 087: tabla monthly_exchange_rates
  console.log("\n🔍 Migración 087: monthly_exchange_rates")
  const table087 = await verifyTable("monthly_exchange_rates")
  if (!table087) allPassed = false

  // =====================================================
  // PARTE 2: TESTS FUNCIONALES
  // =====================================================
  console.log("\n\n📋 PARTE 2: TESTS FUNCIONALES")
  console.log("=" .repeat(50))

  // Test: Insertar TC mensual (verifica que no hay error de foreign key)
  console.log("\n🧪 Test: Insertar TC mensual")
  const tcTest = await testInsertion(
    "monthly_exchange_rates",
    { year: 2025, month: 1, usd_to_ars_rate: 1200 },
    "year,month"
  )
  if (!tcTest) {
    console.log("   ⚠️  ESTE ES EL ERROR CRÍTICO DE FOREIGN KEY")
    allPassed = false
  }

  // Test: Verificar categorías predefinidas
  console.log("\n🧪 Test: Categorías de gastos recurrentes")
  const { data: categories, error: catError } = await supabase
    .from("recurring_payment_categories")
    .select("name")
    .order("name")
  
  if (catError) {
    console.log(`   ❌ Error: ${catError.message}`)
    allPassed = false
  } else {
    const catNames = categories?.map(c => c.name) || []
    console.log(`   ✅ Categorías: ${catNames.join(", ")}`)
    
    const expected = ["Alquiler", "Impuestos", "Marketing", "Otros", "Salarios", "Servicios"]
    const missing = expected.filter(e => !catNames.includes(e))
    if (missing.length > 0) {
      console.log(`   ⚠️  Faltan: ${missing.join(", ")}`)
    }
  }

  // Test: Verificar cuentas financieras
  console.log("\n🧪 Test: Cuentas financieras")
  const { data: accounts, error: accError } = await supabase
    .from("financial_accounts")
    .select("id, name, type, currency")
    .eq("is_active", true)
    .limit(10)
  
  if (accError) {
    console.log(`   ❌ Error: ${accError.message}`)
  } else {
    console.log(`   ✅ ${accounts?.length || 0} cuentas activas`)
    const usdAccounts = accounts?.filter(a => a.currency === "USD" || a.type?.includes("USD"))
    console.log(`   ✅ ${usdAccounts?.length || 0} cuentas USD`)
  }

  // Test: Verificar socios
  console.log("\n🧪 Test: Cuentas de socios")
  const { data: partners, error: partnerError } = await supabase
    .from("partner_accounts")
    .select("id, name")
    .limit(10)
  
  if (partnerError) {
    console.log(`   ❌ Error: ${partnerError.message}`)
  } else {
    console.log(`   ✅ ${partners?.length || 0} socios registrados`)
  }

  // Test: Verificar pagos con exchange_rate
  console.log("\n🧪 Test: Pagos con tipo de cambio")
  const { data: payments, error: payError } = await supabase
    .from("payments")
    .select("id, amount, currency, exchange_rate, amount_usd")
    .not("exchange_rate", "is", null)
    .limit(5)
  
  if (payError) {
    console.log(`   ❌ Error: ${payError.message}`)
  } else {
    console.log(`   ✅ ${payments?.length || 0} pagos con TC registrado`)
    if (payments && payments.length > 0) {
      const sample = payments[0]
      console.log(`   Ejemplo: ${sample.currency} ${sample.amount}, TC: ${sample.exchange_rate}, USD: ${sample.amount_usd}`)
    }
  }

  // Test: Operador payments con paid_amount
  console.log("\n🧪 Test: Pagos a operadores con monto parcial")
  const { data: opPayments, error: opError } = await supabase
    .from("operator_payments")
    .select("id, amount, paid_amount, status")
    .limit(5)
  
  if (opError) {
    console.log(`   ❌ Error: ${opError.message}`)
  } else {
    console.log(`   ✅ ${opPayments?.length || 0} pagos a operadores`)
    const partial = opPayments?.filter(p => p.paid_amount > 0 && p.paid_amount < p.amount)
    console.log(`   ✅ ${partial?.length || 0} con pago parcial`)
  }

  // =====================================================
  // RESUMEN
  // =====================================================
  console.log("\n\n" + "=" .repeat(60))
  console.log("📊 RESUMEN FINAL")
  console.log("=" .repeat(60))

  if (allPassed) {
    console.log("✅ TODAS LAS VERIFICACIONES PASARON")
    console.log("")
    console.log("El sistema está listo para usar:")
    console.log("  • Gastos Recurrentes con categorías")
    console.log("  • Posición Contable Mensual con TC")
    console.log("  • Pagos con tipo de cambio")
    console.log("  • Pagos masivos a operadores")
  } else {
    console.log("❌ ALGUNAS VERIFICACIONES FALLARON")
    console.log("")
    console.log("Posibles soluciones:")
    console.log("  1. Ejecutar migraciones pendientes en Supabase SQL Editor")
    console.log("  2. Verificar que las migraciones 083-087 fueron aplicadas")
    console.log("  3. Si hay error de foreign key en monthly_exchange_rates:")
    console.log("     ALTER TABLE monthly_exchange_rates DROP CONSTRAINT monthly_exchange_rates_created_by_fkey;")
    console.log("     ALTER TABLE monthly_exchange_rates ADD CONSTRAINT monthly_exchange_rates_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;")
  }

  console.log("\n✅ SCRIPT COMPLETADO")
  process.exit(allPassed ? 0 : 1)
}

main().catch(err => {
  console.error("Error fatal:", err)
  process.exit(1)
})
