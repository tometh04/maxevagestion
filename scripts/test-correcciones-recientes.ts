/**
 * Script de testeo de correcciones recientes
 * Ejecutar con: npx tsx scripts/test-correcciones-recientes.ts
 */

import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import * as path from "path"

// Cargar variables de entorno
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Error: Falta configuración de Supabase")
  console.log("NEXT_PUBLIC_SUPABASE_URL:", supabaseUrl ? "✅" : "❌")
  console.log("SUPABASE_SERVICE_ROLE_KEY:", supabaseKey ? "✅" : "❌")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

interface TestResult {
  test: string
  passed: boolean
  message: string
  data?: any
}

const results: TestResult[] = []

function logTest(test: string, passed: boolean, message: string, data?: any) {
  const icon = passed ? "✅" : "❌"
  console.log(`${icon} ${test}: ${message}`)
  if (data && !passed) {
    console.log("   Datos:", JSON.stringify(data, null, 2).substring(0, 500))
  }
  results.push({ test, passed, message, data })
}

async function testRecurringPaymentCategories() {
  console.log("\n📋 TEST 1: Categorías de Gastos Recurrentes")
  console.log("=" .repeat(50))

  try {
    // Verificar que la tabla existe
    const { data, error } = await supabase
      .from("recurring_payment_categories")
      .select("*")
      .limit(10)

    if (error) {
      logTest("Tabla recurring_payment_categories", false, `Error: ${error.message}`, error)
      return
    }

    logTest("Tabla recurring_payment_categories existe", true, `${data.length} categorías encontradas`)

    // Verificar categorías iniciales
    const expectedCategories = ["Servicios", "Alquiler", "Marketing", "Salarios", "Impuestos", "Otros"]
    const foundCategories = data.map((c: any) => c.name)
    const missingCategories = expectedCategories.filter(c => !foundCategories.includes(c))

    if (missingCategories.length === 0) {
      logTest("Categorías iniciales", true, `Todas las categorías encontradas: ${foundCategories.join(", ")}`)
    } else {
      logTest("Categorías iniciales", false, `Faltan: ${missingCategories.join(", ")}`, { found: foundCategories })
    }
  } catch (err) {
    logTest("Tabla recurring_payment_categories", false, `Excepción: ${err}`)
  }
}

async function testRecurringPaymentsCategoryId() {
  console.log("\n📋 TEST 2: Campo category_id en recurring_payments")
  console.log("=" .repeat(50))

  try {
    // Verificar que se puede consultar con category_id
    const { data, error } = await supabase
      .from("recurring_payments")
      .select("id, concept, category_id, recurring_payment_categories(name)")
      .limit(5)

    if (error) {
      if (error.message.includes("category_id")) {
        logTest("Campo category_id", false, `Columna no existe: ${error.message}`)
      } else {
        logTest("Campo category_id", false, `Error: ${error.message}`, error)
      }
      return
    }

    logTest("Campo category_id existe", true, `Query exitoso, ${data.length} pagos encontrados`)

    // Verificar si hay pagos con categoría asignada
    const withCategory = data.filter((p: any) => p.category_id)
    logTest("Pagos con categoría", true, `${withCategory.length}/${data.length} tienen categoría asignada`)
  } catch (err) {
    logTest("Campo category_id", false, `Excepción: ${err}`)
  }
}

async function testMonthlyExchangeRates() {
  console.log("\n📋 TEST 3: Tabla monthly_exchange_rates")
  console.log("=" .repeat(50))

  try {
    // Verificar que la tabla existe
    const { data, error } = await supabase
      .from("monthly_exchange_rates")
      .select("*")
      .limit(5)

    if (error) {
      logTest("Tabla monthly_exchange_rates", false, `Error: ${error.message}`, error)
      return
    }

    logTest("Tabla monthly_exchange_rates existe", true, `${data.length} registros encontrados`)

    // Intentar insertar un registro de prueba
    const testYear = 2025
    const testMonth = 1
    const testRate = 1200.0000

    const { data: insertData, error: insertError } = await supabase
      .from("monthly_exchange_rates")
      .upsert({
        year: testYear,
        month: testMonth,
        usd_to_ars_rate: testRate,
      }, {
        onConflict: "year,month"
      })
      .select()

    if (insertError) {
      // Verificar si es error de foreign key
      if (insertError.message.includes("foreign key") || insertError.message.includes("auth.users")) {
        logTest("Inserción TC mensual", false, `Error de foreign key (auth.users en lugar de users): ${insertError.message}`)
      } else {
        logTest("Inserción TC mensual", false, `Error: ${insertError.message}`, insertError)
      }
      return
    }

    logTest("Inserción TC mensual", true, `Registro creado/actualizado para ${testMonth}/${testYear}`)

    // Verificar lectura
    const { data: readData, error: readError } = await supabase
      .from("monthly_exchange_rates")
      .select("*")
      .eq("year", testYear)
      .eq("month", testMonth)
      .single()

    if (readError) {
      logTest("Lectura TC mensual", false, `Error: ${readError.message}`)
      return
    }

    logTest("Lectura TC mensual", true, `TC: ${readData.usd_to_ars_rate} para ${readData.month}/${readData.year}`)
  } catch (err) {
    logTest("Tabla monthly_exchange_rates", false, `Excepción: ${err}`)
  }
}

async function testOperatorPaymentsPaidAmount() {
  console.log("\n📋 TEST 4: Campo paid_amount en operator_payments")
  console.log("=" .repeat(50))

  try {
    const { data, error } = await supabase
      .from("operator_payments")
      .select("id, amount, paid_amount, status")
      .limit(5)

    if (error) {
      if (error.message.includes("paid_amount")) {
        logTest("Campo paid_amount", false, `Columna no existe: ${error.message}`)
      } else {
        logTest("Campo paid_amount", false, `Error: ${error.message}`, error)
      }
      return
    }

    logTest("Campo paid_amount existe", true, `Query exitoso, ${data.length} pagos encontrados`)

    // Verificar valores
    if (data.length > 0) {
      const sample = data[0] as any
      logTest("Estructura de datos", true, `Ejemplo: amount=${sample.amount}, paid_amount=${sample.paid_amount}, status=${sample.status}`)
    }
  } catch (err) {
    logTest("Campo paid_amount", false, `Excepción: ${err}`)
  }
}

async function testPaymentsExchangeRate() {
  console.log("\n📋 TEST 5: Campos exchange_rate y amount_usd en payments")
  console.log("=" .repeat(50))

  try {
    const { data, error } = await supabase
      .from("payments")
      .select("id, amount, currency, exchange_rate, amount_usd")
      .limit(10)

    if (error) {
      logTest("Campos exchange_rate/amount_usd", false, `Error: ${error.message}`, error)
      return
    }

    logTest("Campos exchange_rate/amount_usd existen", true, `Query exitoso, ${data.length} pagos encontrados`)

    // Verificar si hay pagos ARS con exchange_rate
    const arsPayments = data.filter((p: any) => p.currency === "ARS")
    const arsWithRate = arsPayments.filter((p: any) => p.exchange_rate)
    
    if (arsPayments.length > 0) {
      logTest("Pagos ARS con TC", true, `${arsWithRate.length}/${arsPayments.length} pagos ARS tienen tipo de cambio`)
    } else {
      logTest("Pagos ARS con TC", true, "No hay pagos ARS para verificar")
    }

    // Verificar si hay pagos USD con amount_usd
    const usdPayments = data.filter((p: any) => p.currency === "USD")
    if (usdPayments.length > 0) {
      const sample = usdPayments[0] as any
      logTest("Pagos USD", true, `Ejemplo: amount=${sample.amount}, amount_usd=${sample.amount_usd}`)
    }
  } catch (err) {
    logTest("Campos exchange_rate/amount_usd", false, `Excepción: ${err}`)
  }
}

async function testDebtsSalesCalculation() {
  console.log("\n📋 TEST 6: Cálculo de Deudas por Ventas")
  console.log("=" .repeat(50))

  try {
    // Obtener operaciones con pagos
    const { data: operations, error } = await supabase
      .from("operations")
      .select(`
        id,
        sale_amount_total,
        sale_currency,
        departure_date,
        payments (
          id,
          amount,
          currency,
          exchange_rate,
          amount_usd,
          type,
          status
        )
      `)
      .eq("status", "CONFIRMED")
      .limit(5)

    if (error) {
      logTest("Query deudas", false, `Error: ${error.message}`, error)
      return
    }

    logTest("Query operaciones con pagos", true, `${operations.length} operaciones encontradas`)

    // Verificar cálculos
    for (const op of operations as any[]) {
      const payments = op.payments || []
      const incomePayments = payments.filter((p: any) => p.type === "INCOME" && p.status === "PAID")
      
      // Calcular monto pagado en USD
      let paidUsd = 0
      for (const p of incomePayments) {
        if (p.amount_usd) {
          paidUsd += Number(p.amount_usd)
        } else if (p.currency === "USD") {
          paidUsd += Number(p.amount)
        } else if (p.currency === "ARS" && p.exchange_rate) {
          paidUsd += Number(p.amount) / Number(p.exchange_rate)
        }
      }

      // Monto de venta en USD
      let saleUsd = 0
      if (op.sale_currency === "USD") {
        saleUsd = Number(op.sale_amount_total)
      } else {
        // Para ARS necesitaríamos el TC histórico
        saleUsd = Number(op.sale_amount_total) // Placeholder
      }

      const debtUsd = saleUsd - paidUsd
      
      console.log(`   Op ${op.id.substring(0, 8)}: Venta ${op.sale_currency} ${op.sale_amount_total}, Pagado USD ${paidUsd.toFixed(2)}, Deuda USD ${debtUsd.toFixed(2)}`)
    }

    logTest("Estructura de deudas", true, "Cálculos ejecutados correctamente")
  } catch (err) {
    logTest("Cálculo de deudas", false, `Excepción: ${err}`)
  }
}

async function testFinancialAccounts() {
  console.log("\n📋 TEST 7: Cuentas Financieras")
  console.log("=" .repeat(50))

  try {
    const { data, error } = await supabase
      .from("financial_accounts")
      .select("id, name, type, currency, is_active")
      .eq("is_active", true)
      .limit(20)

    if (error) {
      logTest("Query cuentas financieras", false, `Error: ${error.message}`, error)
      return
    }

    logTest("Cuentas financieras", true, `${data.length} cuentas activas encontradas`)

    // Agrupar por tipo
    const byType: Record<string, number> = {}
    for (const acc of data as any[]) {
      byType[acc.type] = (byType[acc.type] || 0) + 1
    }

    console.log("   Tipos de cuenta:")
    for (const [type, count] of Object.entries(byType)) {
      console.log(`     - ${type}: ${count}`)
    }

    // Verificar cuentas USD
    const usdAccounts = (data as any[]).filter(a => a.currency === "USD" || a.type?.includes("USD"))
    logTest("Cuentas USD", true, `${usdAccounts.length} cuentas USD encontradas`)
  } catch (err) {
    logTest("Cuentas financieras", false, `Excepción: ${err}`)
  }
}

async function testPartnerAccounts() {
  console.log("\n📋 TEST 8: Cuentas de Socios")
  console.log("=" .repeat(50))

  try {
    const { data, error } = await supabase
      .from("partner_accounts")
      .select("id, name, is_active")
      .limit(10)

    if (error) {
      logTest("Tabla partner_accounts", false, `Error: ${error.message}`, error)
      return
    }

    logTest("Tabla partner_accounts", true, `${data.length} socios encontrados`)

    // Verificar retiros
    const { data: withdrawals, error: wError } = await supabase
      .from("partner_withdrawals")
      .select("id, partner_account_id, amount, currency")
      .limit(10)

    if (wError) {
      logTest("Tabla partner_withdrawals", false, `Error: ${wError.message}`)
      return
    }

    logTest("Tabla partner_withdrawals", true, `${withdrawals.length} retiros encontrados`)
  } catch (err) {
    logTest("Cuentas de socios", false, `Excepción: ${err}`)
  }
}

async function main() {
  console.log("🧪 TESTEO DE CORRECCIONES RECIENTES - CONTABILIDAD")
  console.log("=" .repeat(60))
  console.log(`📅 Fecha: ${new Date().toLocaleString("es-AR")}`)
  console.log(`🔗 Supabase: ${supabaseUrl.substring(0, 40)}...`)
  console.log("")

  await testRecurringPaymentCategories()
  await testRecurringPaymentsCategoryId()
  await testMonthlyExchangeRates()
  await testOperatorPaymentsPaidAmount()
  await testPaymentsExchangeRate()
  await testDebtsSalesCalculation()
  await testFinancialAccounts()
  await testPartnerAccounts()

  // Resumen
  console.log("\n" + "=" .repeat(60))
  console.log("📊 RESUMEN DE RESULTADOS")
  console.log("=" .repeat(60))
  
  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  
  console.log(`✅ Pasaron: ${passed}`)
  console.log(`❌ Fallaron: ${failed}`)
  console.log(`📊 Total: ${results.length}`)
  
  if (failed > 0) {
    console.log("\n❌ Tests fallidos:")
    for (const r of results.filter(r => !r.passed)) {
      console.log(`   - ${r.test}: ${r.message}`)
    }
  }

  console.log("\n✅ TESTEO COMPLETADO")
  
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(console.error)
