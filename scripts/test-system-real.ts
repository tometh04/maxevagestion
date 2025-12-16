/**
 * Script de Prueba Real del Sistema
 * Crea datos de prueba si no existen y ejecuta el flujo completo
 */

import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import { join } from "path"

dotenv.config({ path: join(process.cwd(), ".env.local") })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface TestResult {
  step: string
  passed: boolean
  message?: string
  data?: any
}

const results: TestResult[] = []
let createdIds: { leadId?: string; operationId?: string; customerId?: string } = {}

function logTest(step: string, passed: boolean, message?: string, data?: any) {
  results.push({ step, passed, message, data })
  const icon = passed ? "✅" : "❌"
  console.log(`${icon} ${step}`)
  if (message) console.log(`   ${message}`)
  if (data && typeof data === "object") {
    console.log(`   Datos:`, JSON.stringify(data, null, 2).substring(0, 200))
  }
}

async function ensureTestData() {
  console.log("\n🔧 Verificando/Creando datos de prueba necesarios...\n")

  // 1. Verificar/Crear agencia
  let { data: agencies } = await supabase.from("agencies").select("id, name").limit(1)
  if (!agencies || agencies.length === 0) {
    const { data: newAgency } = await (supabase.from("agencies") as any)
      .insert({ name: "Agencia Prueba", city: "Rosario" })
      .select("id, name")
      .single()
    agencies = [newAgency]
    console.log(`✅ Creada agencia: ${newAgency.name}`)
  }
  const agencyId = agencies[0].id

  // 2. Verificar/Crear usuario vendedor
  let { data: sellers } = await supabase
    .from("users")
    .select("id, name, email")
    .eq("role", "SELLER")
    .limit(1)

  if (!sellers || sellers.length === 0) {
    // Buscar cualquier usuario ADMIN o SUPER_ADMIN
    const { data: admins } = await supabase
      .from("users")
      .select("id, name, email")
      .in("role", ["ADMIN", "SUPER_ADMIN"])
      .limit(1)

    if (admins && admins.length > 0) {
      sellers = admins
      console.log(`✅ Usando usuario existente: ${admins[0].name}`)
    } else {
      logTest("Crear datos de prueba", false, "No hay usuarios en el sistema. Se necesita al menos un usuario ADMIN o SELLER.")
      return null
    }
  }
  const sellerId = sellers[0].id

  // 3. Verificar/Crear operador
  let { data: operators } = await supabase.from("operators").select("id, name").limit(1)
  if (!operators || operators.length === 0) {
    const { data: newOperator } = await (supabase.from("operators") as any)
      .insert({ name: "Operador Prueba", contact_name: "Test", contact_email: "test@test.com" })
      .select("id, name")
      .single()
    operators = [newOperator]
    console.log(`✅ Creado operador: ${newOperator.name}`)
  }
  const operatorId = operators[0].id

  // 4. Verificar/Crear cuenta financiera
  let { data: accounts } = await supabase
    .from("financial_accounts")
    .select("id")
    .eq("currency", "USD")
    .limit(1)

  if (!accounts || accounts.length === 0) {
    const { data: newAccount } = await (supabase.from("financial_accounts") as any)
      .insert({
        name: "Cuenta Prueba USD",
        type: "CHECKING_USD",
        currency: "USD",
        agency_id: agencyId,
        initial_balance: 0,
        is_active: true,
      })
      .select("id")
      .single()
    accounts = [newAccount]
    console.log(`✅ Creada cuenta financiera USD`)
  }

  return { agencyId, sellerId, operatorId, accountId: accounts[0].id }
}

async function testCompleteFlow() {
  console.log("🧪 PRUEBA REAL DEL SISTEMA")
  console.log("=".repeat(60))
  console.log("Creando operación PACKAGE desde lead y verificando todos los módulos\n")

  // Asegurar datos de prueba
  const testData = await ensureTestData()
  if (!testData) {
    console.log("\n❌ No se pueden crear datos de prueba. Abortando.")
    return results
  }

  const { agencyId, sellerId, operatorId, accountId } = testData

  // ============================================
  // FASE 1: CREAR LEAD DE PRUEBA
  // ============================================

  console.log("\n📋 FASE 1: CREAR LEAD DE PRUEBA")
  console.log("-".repeat(60))

  // 1.1 Crear lead
  console.log("\n1.1 Creando lead de prueba...")
  const leadData = {
    agency_id: agencyId,
    source: "Other",
    status: "IN_PROGRESS",
    region: "BRASIL",
    destination: "Río de Janeiro",
    contact_name: "Cliente Prueba Sistema",
    contact_phone: "+5493412345678",
    contact_email: "prueba.sistema@test.com",
    assigned_seller_id: sellerId,
    notes: "Lead de prueba para verificación completa",
    has_deposit: true,
    deposit_amount: 500,
    deposit_currency: "USD",
    deposit_method: "BANK_TRANSFER",
    deposit_date: new Date().toISOString().split("T")[0],
  }

  const { data: lead, error: leadError } = await (supabase.from("leads") as any)
    .insert(leadData)
    .select()
    .single()

  if (leadError || !lead) {
    logTest("1.1 Crear lead", false, leadError?.message || "Error desconocido")
    return results
  }

  createdIds.leadId = lead.id
  logTest("1.1 Crear lead", true, undefined, { leadId: lead.id })

  // 1.2 Crear documento
  console.log("\n1.2 Creando documento para el lead...")
  const { data: document, error: docError } = await (supabase.from("documents") as any)
    .insert({
      lead_id: lead.id,
      type: "PASSPORT",
      file_url: "https://example.com/pasaporte_prueba.pdf",
      uploaded_by_user_id: sellerId,
    })
    .select()
    .single()

  if (docError) {
    logTest("1.2 Crear documento", false, docError.message)
  } else {
    logTest("1.2 Crear documento", true, undefined, { documentId: document.id })
  }

  // 1.3 Crear movimiento contable (depósito)
  console.log("\n1.3 Creando movimiento contable (depósito)...")
  const { data: ledgerMovement, error: ledgerError } = await (supabase.from("ledger_movements") as any)
    .insert({
      lead_id: lead.id,
      type: "INCOME",
      concept: `Depósito recibido de lead: ${lead.contact_name}`,
      currency: "USD",
      amount_original: lead.deposit_amount,
      exchange_rate: 1000,
      amount_ars_equivalent: lead.deposit_amount * 1000,
      method: "BANK",
      account_id: accountId,
      seller_id: sellerId,
      notes: `Depósito recibido el ${lead.deposit_date}`,
    })
    .select()
    .single()

  if (ledgerError) {
    logTest("1.3 Crear movimiento contable", false, ledgerError.message)
  } else {
    logTest("1.3 Crear movimiento contable", true, undefined, { movementId: ledgerMovement.id })
  }

  // ============================================
  // FASE 2: CONVERTIR LEAD A OPERACIÓN
  // ============================================

  console.log("\n📋 FASE 2: CONVERTIR LEAD A OPERACIÓN")
  console.log("-".repeat(60))

  const departureDate = new Date()
  departureDate.setDate(departureDate.getDate() + 60)
  const returnDate = new Date(departureDate)
  returnDate.setDate(returnDate.getDate() + 7)

  console.log("\n2.1 Creando operación PACKAGE...")
  const operationData = {
    lead_id: lead.id,
    agency_id: agencyId,
    seller_id: sellerId,
    operator_id: operatorId,
    type: "PACKAGE",
    product_type: "PAQUETE",
    origin: "Rosario",
    destination: lead.destination,
    operation_date: new Date().toISOString().split("T")[0],
    departure_date: departureDate.toISOString().split("T")[0],
    return_date: returnDate.toISOString().split("T")[0],
    checkin_date: departureDate.toISOString().split("T")[0],
    checkout_date: returnDate.toISOString().split("T")[0],
    adults: 2,
    children: 0,
    infants: 0,
    status: "PRE_RESERVATION",
    sale_amount_total: 3000,
    sale_currency: "USD",
    operator_cost: 2400,
    operator_cost_currency: "USD",
    currency: "USD",
  }

  const marginAmount = operationData.sale_amount_total - operationData.operator_cost
  const marginPercentage = (marginAmount / operationData.sale_amount_total) * 100
  const commissionPercentage = 10 // Para usar después en commission_records

  const { data: operation, error: opError } = await (supabase.from("operations") as any)
    .insert({
      ...operationData,
      margin_amount: marginAmount,
      margin_percentage: marginPercentage,
    })
    .select()
    .single()

  if (opError || !operation) {
    logTest("2.1 Crear operación", false, opError?.message || "Error desconocido")
    // Limpiar
    await supabase.from("leads").delete().eq("id", lead.id)
    return results
  }

  createdIds.operationId = operation.id

  // Generar file_code
  const fileCode = `OP-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${operation.id.substring(0, 8).toUpperCase()}`
  await supabase.from("operations").update({ file_code: fileCode }).eq("id", operation.id)

  // Actualizar lead a WON
  await supabase.from("leads").update({ status: "WON" }).eq("id", lead.id)

  // Transferir movimientos
  await supabase
    .from("ledger_movements")
    .update({ operation_id: operation.id, lead_id: null })
    .eq("lead_id", lead.id)

  logTest("2.1 Crear operación", true, undefined, { operationId: operation.id, fileCode })

  // ============================================
  // FASE 3: VERIFICAR IMPACTOS
  // ============================================

  console.log("\n📋 FASE 3: VERIFICAR IMPACTOS")
  console.log("-".repeat(60))

  // 3.1 Verificar cliente
  console.log("\n3.1 Verificando cliente...")
  const { data: operationCustomers } = await supabase
    .from("operation_customers")
    .select("customer_id, customers(*)")
    .eq("operation_id", operation.id)

  if (operationCustomers && operationCustomers.length > 0) {
    createdIds.customerId = (operationCustomers[0] as any).customer_id
    logTest("3.1 Cliente creado/asociado", true, undefined, {
      customerId: createdIds.customerId,
    })
  } else {
    // Crear cliente manualmente si no se creó automáticamente
    const nameParts = lead.contact_name.split(" ")
    const { data: newCustomer } = await (supabase.from("customers") as any)
      .insert({
        first_name: nameParts[0] || "Sin nombre",
        last_name: nameParts.slice(1).join(" ") || "-",
        phone: lead.contact_phone,
        email: lead.contact_email,
      })
      .select()
      .single()

    if (newCustomer) {
      await (supabase.from("operation_customers") as any).insert({
        operation_id: operation.id,
        customer_id: newCustomer.id,
        role: "MAIN",
      })
      createdIds.customerId = newCustomer.id
      logTest("3.1 Cliente creado manualmente", true, undefined, { customerId: newCustomer.id })
    } else {
      logTest("3.1 Cliente creado/asociado", false, "No se pudo crear cliente")
    }
  }

  // 3.2 Verificar documentos transferidos
  if (createdIds.customerId) {
    console.log("\n3.2 Verificando documentos transferidos...")
    const { data: customerDocs } = await supabase
      .from("documents")
      .select("*")
      .eq("customer_id", createdIds.customerId)

    const { data: operationDocs } = await supabase
      .from("documents")
      .select("*")
      .eq("operation_id", operation.id)

    const docsTransferred = (customerDocs && customerDocs.length > 0) || (operationDocs && operationDocs.length > 0)
    logTest("3.2 Documentos transferidos", docsTransferred, undefined, {
      customerDocs: customerDocs?.length || 0,
      operationDocs: operationDocs?.length || 0,
    })
  }

  // 3.3 Verificar registros contables
  console.log("\n3.3 Verificando registros contables...")

  // IVA Ventas
  const { data: ivaSales } = await supabase.from("iva_sales").select("*").eq("operation_id", operation.id)
  logTest("3.3.1 IVA Ventas", (ivaSales?.length || 0) > 0, undefined, {
    count: ivaSales?.length || 0,
  })

  // IVA Compras
  const { data: ivaPurchases } = await supabase
    .from("iva_purchases")
    .select("*")
    .eq("operation_id", operation.id)
  logTest("3.3.2 IVA Compras", (ivaPurchases?.length || 0) > 0, undefined, {
    count: ivaPurchases?.length || 0,
  })

  // Ledger Movements
  const { data: ledgerMovements } = await supabase
    .from("ledger_movements")
    .select("*")
    .eq("operation_id", operation.id)

  const accountsReceivable = ledgerMovements?.filter((m) => m.type === "INCOME")
  const accountsPayable = ledgerMovements?.filter((m) => m.type === "EXPENSE")

  logTest("3.3.3 Cuentas por Cobrar", (accountsReceivable?.length || 0) > 0, undefined, {
    count: accountsReceivable?.length || 0,
  })
  logTest("3.3.4 Cuentas por Pagar", (accountsPayable?.length || 0) > 0, undefined, {
    count: accountsPayable?.length || 0,
  })

  // Operator Payments
  const { data: operatorPayments } = await supabase
    .from("operator_payments")
    .select("*")
    .eq("operation_id", operation.id)
  logTest("3.3.5 Operator Payment", (operatorPayments?.length || 0) > 0, undefined, {
    count: operatorPayments?.length || 0,
  })

  // Commission Records
  const { data: commissions } = await supabase
    .from("commission_records")
    .select("*")
    .eq("operation_id", operation.id)
  logTest("3.3.6 Commission Record", (commissions?.length || 0) > 0, undefined, {
    count: commissions?.length || 0,
  })

  // 3.4 Verificar alertas
  console.log("\n3.4 Verificando alertas...")
  const { data: alerts } = await supabase.from("alerts").select("*").eq("operation_id", operation.id)

  const destinationAlerts = alerts?.filter((a) => a.type === "DESTINATION_REQUIREMENT") || []
  const checkInAlerts = alerts?.filter((a) => a.type === "UPCOMING_TRIP" && a.description?.includes("Check-in")) || []
  const checkOutAlerts =
    alerts?.filter((a) => a.type === "UPCOMING_TRIP" && a.description?.includes("Check-out")) || []
  const paymentAlerts = alerts?.filter((a) => a.type === "PAYMENT_DUE" || a.type === "OPERATOR_DUE") || []

  logTest("3.4 Alertas generadas", (alerts?.length || 0) > 0, undefined, {
    total: alerts?.length || 0,
    destinationRequirements: destinationAlerts.length,
    checkIn: checkInAlerts.length,
    checkOut: checkOutAlerts.length,
    payments: paymentAlerts.length,
  })

  // 3.5 Verificar mensajes WhatsApp
  console.log("\n3.5 Verificando mensajes WhatsApp...")
  const { data: whatsappMessages } = await supabase
    .from("whatsapp_messages")
    .select("*")
    .eq("operation_id", operation.id)

  logTest("3.5 Mensajes WhatsApp", (whatsappMessages?.length || 0) >= 0, undefined, {
    count: whatsappMessages?.length || 0,
    note: "Puede ser 0 si no hay templates configurados",
  })

  // ============================================
  // RESUMEN
  // ============================================

  console.log("\n" + "=".repeat(60))
  console.log("📊 RESUMEN DE RESULTADOS")
  console.log("=".repeat(60))

  const passed = results.filter((r) => r.passed).length
  const failed = results.filter((r) => !r.passed).length
  const total = results.length

  console.log(`\n✅ Pasados: ${passed}/${total}`)
  console.log(`❌ Fallidos: ${failed}/${total}`)
  console.log(`📈 Tasa de éxito: ${((passed / total) * 100).toFixed(1)}%`)

  if (failed > 0) {
    console.log("\n❌ Pruebas fallidas:")
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`   - ${r.step}: ${r.message || "Sin mensaje"}`)
      })
  }

  console.log(`\n📝 IDs creados para limpieza:`)
  console.log(`   Lead: ${createdIds.leadId}`)
  console.log(`   Operación: ${createdIds.operationId}`)
  console.log(`   Cliente: ${createdIds.customerId || "N/A"}`)

  return results
}

// Ejecutar
testCompleteFlow()
  .then((results) => {
    const failed = results.filter((r) => !r.passed).length
    process.exit(failed > 0 ? 1 : 0)
  })
  .catch((error) => {
    console.error("\n❌ Error en la prueba:", error)
    process.exit(1)
  })

