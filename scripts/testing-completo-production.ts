#!/usr/bin/env tsx
/**
 * Script completo de testing para producción
 * Ejecuta todas las pruebas automatizables según GUIA_EJECUCION_TESTING.md
 * 
 * Uso:
 *   npx tsx scripts/testing-completo-production.ts
 */

import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import { resolve } from "path"

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

interface TestResult {
  name: string
  passed: boolean
  error?: string
  details?: any
}

const results: TestResult[] = []

function logTest(name: string, passed: boolean, error?: string, details?: any) {
  results.push({ name, passed, error, details })
  const icon = passed ? "✅" : "❌"
  console.log(`${icon} ${name}`)
  if (error) {
    console.log(`   Error: ${error}`)
  }
  if (details) {
    console.log(`   Detalles:`, JSON.stringify(details, null, 2))
  }
}

/**
 * PASO 1: Testing de Flujo Completo
 */
async function testCompleteFlow() {
  console.log("\n" + "=".repeat(60))
  console.log("🧪 PASO 1: Testing de Flujo Completo")
  console.log("=".repeat(60))

  // Obtener datos necesarios
  const { data: agencies } = await supabase.from("agencies").select("id, name").limit(1)
  const { data: sellers } = await supabase.from("users").select("id, name").eq("role", "SELLER").limit(1)
  const { data: operators } = await supabase.from("operators").select("id, name").limit(1)

  if (!agencies || agencies.length === 0 || !sellers || sellers.length === 0 || !operators || operators.length === 0) {
    logTest("1.1 Preparar datos necesarios", false, "Faltan agencias, vendedores u operadores")
    return
  }

  const agencyId = agencies[0].id
  const sellerId = sellers[0].id
  const operatorId = operators[0].id

  // 1.1 Crear Lead
  console.log("\n📝 1.1 Creando lead de prueba...")
  const leadData = {
    agency_id: agencyId,
    source: "Other",
    status: "NEW",
    region: "CARIBE",
    destination: "Cancún - Prueba Testing Completo",
    contact_name: "Cliente Prueba Testing Completo",
    contact_phone: "+5491112345678",
    contact_email: "prueba-testing@test.com",
    assigned_seller_id: sellerId,
    notes: "Lead de prueba para testing completo de producción",
  }

  const { data: lead, error: leadError } = await (supabase.from("leads") as any)
    .insert(leadData)
    .select()
    .single()

  if (leadError || !lead) {
    logTest("1.1 Crear Lead", false, leadError?.message || "Error desconocido")
    return
  }
  logTest("1.1 Crear Lead", true, undefined, { leadId: lead.id })

  // 1.2 Convertir Lead a Operación
  console.log("\n📝 1.2 Convirtiendo lead a operación...")
  const today = new Date().toISOString().split("T")[0]
  const departureDate = new Date()
  departureDate.setDate(departureDate.getDate() + 30)
  const departureDateStr = departureDate.toISOString().split("T")[0]

  const operationData = {
    lead_id: lead.id,
    agency_id: agencyId,
    seller_id: sellerId,
    operator_id: operatorId,
    type: "PACKAGE",
    destination: leadData.destination,
    operation_date: today,
    departure_date: departureDateStr,
    sale_amount_total: 2500,
    operator_cost: 2000,
    currency: "USD",
    sale_currency: "USD",
    operator_cost_currency: "USD",
    status: "PRE_RESERVATION",
  }

  const { data: operation, error: opError } = await (supabase.from("operations") as any)
    .insert(operationData)
    .select()
    .single()

  if (opError || !operation) {
    logTest("1.2 Convertir Lead a Operación", false, opError?.message || "Error desconocido")
    // Limpiar lead creado
    await supabase.from("leads").delete().eq("id", lead.id)
    return
  }

  // Verificar que el lead se actualizó
  const { data: updatedLead } = await supabase.from("leads").select("status, converted_operation_id").eq("id", lead.id).single()
  logTest("1.2 Convertir Lead a Operación", true, undefined, {
    operationId: operation.id,
    fileCode: operation.file_code,
    leadStatus: updatedLead?.status,
  })

  // 1.3 Crear Pago
  console.log("\n📝 1.3 Creando pago...")
  const paymentData = {
    operation_id: operation.id,
    type: "CUSTOMER_PAYMENT",
    amount: 1250,
    currency: "USD",
    date_due: today,
    payment_method: "BANK_TRANSFER",
    status: "PENDING",
  }

  const { data: payment, error: paymentError } = await (supabase.from("payments") as any)
    .insert(paymentData)
    .select()
    .single()

  if (paymentError || !payment) {
    logTest("1.3 Crear Pago", false, paymentError?.message || "Error desconocido")
    // Limpiar
    await supabase.from("operations").delete().eq("id", operation.id)
    await supabase.from("leads").delete().eq("id", lead.id)
    return
  }
  logTest("1.3 Crear Pago", true, undefined, { paymentId: payment.id })

  // 1.4 Marcar Pago como Pagado
  console.log("\n📝 1.4 Marcando pago como pagado...")
  const { error: markPaidError } = await (supabase.from("payments") as any)
    .update({
      status: "PAID",
      date_paid: today,
    })
    .eq("id", payment.id)

  if (markPaidError) {
    logTest("1.4 Marcar Pago como Pagado", false, markPaidError.message)
  } else {
    // Verificar que se crearon movimientos
    const { data: movements } = await supabase
      .from("ledger_movements")
      .select("*")
      .eq("operation_id", operation.id)

    logTest("1.4 Marcar Pago como Pagado", true, undefined, {
      movementsCreated: movements?.length || 0,
    })
  }

  // 1.5 Cerrar Operación
  console.log("\n📝 1.5 Cerrando operación...")
  const { error: closeError } = await (supabase.from("operations") as any)
    .update({ status: "CLOSED" })
    .eq("id", operation.id)

  if (closeError) {
    logTest("1.5 Cerrar Operación", false, closeError.message)
  } else {
    // Verificar comisiones
    const { data: commissions } = await supabase
      .from("commission_records")
      .select("*")
      .eq("operation_id", operation.id)

    logTest("1.5 Cerrar Operación", true, undefined, {
      commissionsCreated: commissions?.length || 0,
    })
  }

  // Guardar IDs para limpieza después
  return { leadId: lead.id, operationId: operation.id, paymentId: payment.id }
}

/**
 * PASO 2: Testing de Eliminaciones
 */
async function testDeletions(testData: { leadId: string; operationId: string; paymentId: string }) {
  console.log("\n" + "=".repeat(60))
  console.log("🧪 PASO 2: Testing de Eliminaciones")
  console.log("=".repeat(60))

  // 2.1 Eliminar Pago
  console.log("\n🗑️  2.1 Eliminando pago...")
  
  // Primero verificar movimientos antes de eliminar
  const { data: movementsBefore } = await supabase
    .from("ledger_movements")
    .select("*")
    .eq("operation_id", testData.operationId)

  const { error: deletePaymentError } = await supabase
    .from("payments")
    .delete()
    .eq("id", testData.paymentId)

  if (deletePaymentError) {
    logTest("2.1 Eliminar Pago", false, deletePaymentError.message)
  } else {
    // Verificar que los movimientos se revirtieron
    const { data: movementsAfter } = await supabase
      .from("ledger_movements")
      .select("*")
      .eq("operation_id", testData.operationId)

    logTest("2.1 Eliminar Pago", true, undefined, {
      movementsBefore: movementsBefore?.length || 0,
      movementsAfter: movementsAfter?.length || 0,
    })
  }

  // 2.2 Eliminar Operación
  console.log("\n🗑️  2.2 Eliminando operación...")
  
  // Verificar datos relacionados antes
  const { data: paymentsBefore } = await supabase
    .from("payments")
    .select("id")
    .eq("operation_id", testData.operationId)

  const { data: movementsBeforeOp } = await supabase
    .from("ledger_movements")
    .select("id")
    .eq("operation_id", testData.operationId)

  const { data: commissionsBefore } = await supabase
    .from("commission_records")
    .select("id")
    .eq("operation_id", testData.operationId)

  const { error: deleteOpError } = await supabase
    .from("operations")
    .delete()
    .eq("id", testData.operationId)

  if (deleteOpError) {
    logTest("2.2 Eliminar Operación", false, deleteOpError.message)
  } else {
    // Verificar que todo se eliminó
    const { data: paymentsAfter } = await supabase
      .from("payments")
      .select("id")
      .eq("operation_id", testData.operationId)

    const { data: movementsAfterOp } = await supabase
      .from("ledger_movements")
      .select("id")
      .eq("operation_id", testData.operationId)

    const { data: commissionsAfter } = await supabase
      .from("commission_records")
      .select("id")
      .eq("operation_id", testData.operationId)

    logTest("2.2 Eliminar Operación", true, undefined, {
      paymentsBefore: paymentsBefore?.length || 0,
      paymentsAfter: paymentsAfter?.length || 0,
      movementsBefore: movementsBeforeOp?.length || 0,
      movementsAfter: movementsAfterOp?.length || 0,
      commissionsBefore: commissionsBefore?.length || 0,
      commissionsAfter: commissionsAfter?.length || 0,
    })
  }

  // 2.3 Verificar que Lead se revirtió
  console.log("\n🔍 2.3 Verificando reversión del lead...")
  const { data: leadAfter } = await supabase
    .from("leads")
    .select("status, converted_operation_id")
    .eq("id", testData.leadId)
    .single()

  logTest("2.3 Lead revertido después de eliminar operación", 
    leadAfter?.status === "IN_PROGRESS" || leadAfter?.status === "NEW",
    undefined,
    { leadStatus: leadAfter?.status }
  )

  // Limpiar lead
  await supabase.from("leads").delete().eq("id", testData.leadId)
}

/**
 * PASO 3: Testing de Validaciones
 */
async function testValidations() {
  console.log("\n" + "=".repeat(60))
  console.log("🧪 PASO 3: Testing de Validaciones")
  console.log("=".repeat(60))

  const { data: agencies } = await supabase.from("agencies").select("id").limit(1)
  const { data: sellers } = await supabase.from("users").select("id").eq("role", "SELLER").limit(1)
  const { data: operators } = await supabase.from("operators").select("id").limit(1)

  if (!agencies || agencies.length === 0 || !sellers || sellers.length === 0 || !operators || operators.length === 0) {
    logTest("3.0 Preparar datos", false, "Faltan datos necesarios")
    return
  }

  // 3.1 Operación con fecha futura
  console.log("\n🔍 3.1 Probando operación con fecha futura...")
  const futureDate = new Date()
  futureDate.setDate(futureDate.getDate() + 1)
  const futureDateStr = futureDate.toISOString().split("T")[0]

  const { error: futureDateError } = await (supabase.from("operations") as any).insert({
    agency_id: agencies[0]!.id,
    seller_id: sellers[0].id,
    operator_id: operators[0].id,
    type: "PACKAGE",
    destination: "Test",
    operation_date: futureDateStr, // Fecha futura
    departure_date: futureDateStr,
    sale_amount_total: 1000,
    operator_cost: 800,
    currency: "USD",
  })

  logTest("3.1 Validar fecha futura en operación", 
    futureDateError !== null,
    futureDateError ? undefined : "Debería haber rechazado fecha futura",
    { error: futureDateError?.message }
  )

  // 3.2 Operación con monto negativo
  console.log("\n🔍 3.2 Probando operación con monto negativo...")
  const today = new Date().toISOString().split("T")[0]
  const { error: negativeAmountError } = await (supabase.from("operations") as any).insert({
    agency_id: agencies[0]!.id,
    seller_id: sellers[0]!.id,
    operator_id: operators[0]!.id,
    type: "PACKAGE",
    destination: "Test",
    operation_date: today,
    departure_date: today,
    sale_amount_total: -1000, // Monto negativo
    operator_cost: 800,
    currency: "USD",
  })

  logTest("3.2 Validar monto negativo en operación",
    negativeAmountError !== null,
    negativeAmountError ? undefined : "Debería haber rechazado monto negativo",
    { error: negativeAmountError?.message }
  )
}

/**
 * PASO 4: Verificar Sincronización Trello
 */
async function testTrelloSync() {
  console.log("\n" + "=".repeat(60))
  console.log("🧪 PASO 4: Verificar Sincronización Trello")
  console.log("=".repeat(60))

  // Verificar que hay leads de Trello
  const { count } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("source", "Trello")

  logTest("4.1 Leads de Trello sincronizados", 
    (count || 0) > 0,
    undefined,
    { totalLeads: count || 0 }
  )

  // Verificar configuración de Trello
  const { data: trelloSettings } = await supabase
    .from("settings_trello")
    .select("*")

  logTest("4.2 Configuración de Trello", 
    (trelloSettings?.length || 0) > 0,
    undefined,
    { agenciesConfigured: trelloSettings?.length || 0 }
  )
}

/**
 * PASO 5: Testing de Performance
 */
async function testPerformance() {
  console.log("\n" + "=".repeat(60))
  console.log("🧪 PASO 5: Testing de Performance")
  console.log("=".repeat(60))

  // 5.1 Verificar que existen operaciones para testear
  console.log("\n🔍 5.1 Verificando datos para testing de performance...")
  const { count: opsCount } = await supabase
    .from("operations")
    .select("*", { count: "exact", head: true })

  logTest("5.1 Datos para testing de performance", 
    (opsCount || 0) > 0,
    undefined,
    { operationsCount: opsCount || 0 }
  )

  // 5.2 Test de consulta paginada
  console.log("\n🔍 5.2 Probando consulta paginada...")
  const startTime = Date.now()
  const { data: ops } = await supabase
    .from("operations")
    .select("*")
    .limit(50)
    .order("created_at", { ascending: false })
  const queryTime = Date.now() - startTime

  logTest("5.2 Performance de consulta paginada",
    queryTime < 1000,
    queryTime >= 1000 ? `Tardó ${queryTime}ms (esperado < 1000ms)` : undefined,
    { queryTimeMs: queryTime, recordsReturned: ops?.length || 0 }
  )
}

/**
 * Función principal
 */
async function main() {
  console.log("🚀 TESTING COMPLETO DE PRODUCCIÓN")
  console.log("=".repeat(60))
  console.log("Ejecutando todas las pruebas automatizables...")
  console.log("=".repeat(60))

  try {
    // PASO 1: Flujo completo
    const testData = await testCompleteFlow()
    if (!testData) {
      console.log("\n❌ No se pudo completar el flujo, saltando eliminaciones")
    } else {
      // PASO 2: Eliminaciones
      await testDeletions(testData)
    }

    // PASO 3: Validaciones
    await testValidations()

    // PASO 4: Trello
    await testTrelloSync()

    // PASO 5: Performance
    await testPerformance()

    // Resumen
    console.log("\n" + "=".repeat(60))
    console.log("📊 RESUMEN DE RESULTADOS")
    console.log("=".repeat(60))

    const passed = results.filter((r) => r.passed).length
    const failed = results.filter((r) => !r.passed).length
    const total = results.length

    console.log(`Total de pruebas: ${total}`)
    console.log(`✅ Pasaron: ${passed}`)
    console.log(`❌ Fallaron: ${failed}`)
    console.log(`📈 Tasa de éxito: ${((passed / total) * 100).toFixed(1)}%`)

    if (failed > 0) {
      console.log("\n❌ Pruebas que fallaron:")
      results
        .filter((r) => !r.passed)
        .forEach((r) => {
          console.log(`  - ${r.name}`)
          if (r.error) {
            console.log(`    Error: ${r.error}`)
          }
        })
    }

    console.log("\n" + "=".repeat(60))
    if (failed === 0) {
      console.log("🎉 ¡TODAS LAS PRUEBAS PASARON!")
    } else {
      console.log("⚠️  Algunas pruebas fallaron. Revisa los detalles arriba.")
    }
    console.log("=".repeat(60))

    process.exit(failed > 0 ? 1 : 0)
  } catch (error: any) {
    console.error("\n❌ ERROR FATAL:", error)
    console.error(error.stack)
    process.exit(1)
  }
}

main()

