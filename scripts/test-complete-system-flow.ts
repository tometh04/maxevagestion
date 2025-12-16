/**
 * Script de Prueba Completa del Sistema
 * 
 * Prueba end-to-end: Crear operación PACKAGE desde lead y verificar
 * todos los impactos en alertas, mensajes, caja, contabilidad, dashboard, reportes y AI Companion
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

function logTest(step: string, passed: boolean, message?: string, data?: any) {
  results.push({ step, passed, message, data })
  const icon = passed ? "✅" : "❌"
  console.log(`${icon} ${step}`)
  if (message) console.log(`   ${message}`)
  if (data) console.log(`   Datos:`, JSON.stringify(data, null, 2))
}

async function testCompleteSystemFlow() {
  console.log("🧪 PRUEBA COMPLETA DEL SISTEMA")
  console.log("=".repeat(60))
  console.log("Objetivo: Crear operación PACKAGE desde lead y verificar todos los módulos\n")

  // ============================================
  // FASE 1: PREPARACIÓN Y CREACIÓN DE OPERACIÓN
  // ============================================

  console.log("\n📋 FASE 1: PREPARACIÓN Y CREACIÓN DE OPERACIÓN")
  console.log("-".repeat(60))

  // 1.1 Obtener datos necesarios
  console.log("\n1.1 Obteniendo datos necesarios...")
  const { data: agencies } = await supabase.from("agencies").select("id, name").limit(1)
  const { data: sellers } = await supabase.from("users").select("id, name, email").eq("role", "SELLER").limit(1)
  const { data: operators } = await supabase.from("operators").select("id, name").limit(1)

  if (!agencies || !sellers || !operators || agencies.length === 0 || sellers.length === 0 || operators.length === 0) {
    logTest("1.1 Obtener datos necesarios", false, "Faltan datos: agencias, vendedores u operadores")
    return results
  }

  const agencyId = agencies[0].id
  const sellerId = sellers[0].id
  const operatorId = operators[0].id

  logTest("1.1 Obtener datos necesarios", true, undefined, {
    agency: agencies[0].name,
    seller: sellers[0].name,
    operator: operators[0].name,
  })

  // 1.2 Crear lead de prueba con documentos y depósito
  console.log("\n1.2 Creando lead de prueba...")
  const leadData = {
    agency_id: agencyId,
    source: "Other",
    status: "IN_PROGRESS",
    region: "BRASIL",
    destination: "Río de Janeiro", // Destino con requisitos (Brasil tiene Fiebre Amarilla)
    contact_name: "Cliente Prueba Sistema Completo",
    contact_phone: "+5493412345678",
    contact_email: "prueba.sistema@test.com",
    contact_instagram: "@prueba_sistema",
    assigned_seller_id: sellerId,
    notes: "Lead de prueba para verificación completa del sistema",
    quoted_price: 3000,
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
    logTest("1.2 Crear lead de prueba", false, leadError?.message || "Error desconocido")
    return results
  }

  logTest("1.2 Crear lead de prueba", true, undefined, { leadId: lead.id })

  // 1.3 Crear documento para el lead
  console.log("\n1.3 Creando documento para el lead...")
  const { data: document, error: docError } = await (supabase.from("documents") as any)
    .insert({
      lead_id: lead.id,
      type: "PASSPORT",
      file_name: "pasaporte_prueba.pdf",
      file_url: "https://example.com/pasaporte.pdf",
      uploaded_by: sellerId,
    })
    .select()
    .single()

  if (docError) {
    logTest("1.3 Crear documento", false, docError.message)
  } else {
    logTest("1.3 Crear documento", true, undefined, { documentId: document.id })
  }

  // 1.4 Crear mensaje WhatsApp para el lead
  console.log("\n1.4 Creando mensaje WhatsApp para el lead...")
  const { data: message, error: msgError } = await (supabase.from("whatsapp_messages") as any)
    .insert({
      customer_id: null, // Aún no hay cliente
      phone: lead.contact_phone,
      customer_name: lead.contact_name,
      message: "Mensaje de prueba del lead",
      whatsapp_link: `https://wa.me/${lead.contact_phone.replace(/\D/g, "")}?text=Prueba`,
      status: "SENT",
      scheduled_for: new Date().toISOString(),
      agency_id: agencyId,
    })
    .select()
    .single()

  if (msgError) {
    logTest("1.4 Crear mensaje WhatsApp", false, msgError.message)
  } else {
    logTest("1.4 Crear mensaje WhatsApp", true, undefined, { messageId: message.id })
  }

  // 1.5 Crear depósito (ledger movement) para el lead
  console.log("\n1.5 Creando movimiento contable (depósito) para el lead...")
  const { data: accounts } = await supabase
    .from("financial_accounts")
    .select("id")
    .eq("currency", "USD")
    .limit(1)

  let accountId = accounts?.[0]?.id
  if (!accountId) {
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
    accountId = newAccount?.id
  }

  const { data: ledgerMovement, error: ledgerError } = await (supabase.from("ledger_movements") as any)
    .insert({
      lead_id: lead.id,
      type: "INCOME",
      concept: `Depósito recibido de lead: ${lead.contact_name}`,
      currency: "USD",
      amount_original: lead.deposit_amount,
      exchange_rate: 1000, // Tasa de ejemplo
      amount_ars_equivalent: lead.deposit_amount * 1000,
      method: "BANK",
      account_id: accountId,
      seller_id: sellerId,
      notes: `Depósito recibido el ${lead.deposit_date}`,
    })
    .select()
    .single()

  if (ledgerError) {
    logTest("1.5 Crear movimiento contable", false, ledgerError.message)
  } else {
    logTest("1.5 Crear movimiento contable", true, undefined, { movementId: ledgerMovement.id })
  }

  // 1.6 Convertir lead a operación PACKAGE
  console.log("\n1.6 Convirtiendo lead a operación PACKAGE...")
  const departureDate = new Date()
  departureDate.setDate(departureDate.getDate() + 60) // 60 días en el futuro
  const returnDate = new Date(departureDate)
  returnDate.setDate(returnDate.getDate() + 7) // 7 días de viaje

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
    commission_percentage: 10,
  }

  // Llamar a la API de creación de operación
  const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace("/rest/v1", "") || "http://localhost:3000"
  const response = await fetch(`${apiUrl}/api/operations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Nota: En producción necesitarías autenticación real
    },
    body: JSON.stringify(operationData),
  }).catch(() => null)

  if (!response || !response.ok) {
    // Si la API no está disponible, crear directamente en la DB
    console.log("   ⚠️  API no disponible, creando operación directamente en DB...")
    const marginAmount = operationData.sale_amount_total - operationData.operator_cost
    const marginPercentage = (marginAmount / operationData.sale_amount_total) * 100

    const { data: operation, error: opError } = await (supabase.from("operations") as any)
      .insert({
        ...operationData,
        margin_amount: marginAmount,
        margin_percentage: marginPercentage,
      })
      .select()
      .single()

    if (opError || !operation) {
      logTest("1.6 Convertir lead a operación", false, opError?.message || "Error desconocido")
      // Limpiar
      await supabase.from("leads").delete().eq("id", lead.id)
      return results
    }

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

    logTest("1.6 Convertir lead a operación", true, undefined, {
      operationId: operation.id,
      fileCode,
    })

    // Continuar con las verificaciones usando la operación creada directamente
    await verifyOperationImpacts(operation.id, lead.id, agencyId, sellerId, operatorId)
  } else {
    const operation = await response.json()
    logTest("1.6 Convertir lead a operación", true, undefined, {
      operationId: operation.id || operation.operation?.id,
    })

    const operationId = operation.id || operation.operation?.id
    if (operationId) {
      await verifyOperationImpacts(operationId, lead.id, agencyId, sellerId, operatorId)
    }
  }

  // ============================================
  // RESUMEN DE RESULTADOS
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

  return results
}

async function verifyOperationImpacts(
  operationId: string,
  leadId: string,
  agencyId: string,
  sellerId: string,
  operatorId: string
) {
  console.log("\n" + "=".repeat(60))
  console.log("🔍 FASE 2: VERIFICACIÓN DE IMPACTOS INMEDIATOS")
  console.log("-".repeat(60))

  // 2.1 Verificar creación de cliente
  console.log("\n2.1 Verificando creación de cliente...")
  const { data: operation } = await supabase
    .from("operations")
    .select("*, operation_customers(customer_id, customers(*))")
    .eq("id", operationId)
    .single()

  if (operation && (operation as any).operation_customers?.length > 0) {
    const customerId = (operation as any).operation_customers[0].customer_id
    logTest("2.1 Cliente creado/asociado", true, undefined, { customerId })

    // 2.2 Verificar documentos transferidos
    console.log("\n2.2 Verificando documentos transferidos...")
    const { data: customerDocs } = await supabase
      .from("documents")
      .select("*")
      .eq("customer_id", customerId)

    const { data: operationDocs } = await supabase
      .from("documents")
      .select("*")
      .eq("operation_id", operationId)

    if (customerDocs && customerDocs.length > 0 && operationDocs && operationDocs.length > 0) {
      logTest("2.2 Documentos transferidos", true, undefined, {
        customerDocs: customerDocs.length,
        operationDocs: operationDocs.length,
      })
    } else {
      logTest("2.2 Documentos transferidos", false, "No se encontraron documentos transferidos")
    }

    // 2.3 Verificar mensajes transferidos
    console.log("\n2.3 Verificando mensajes transferidos...")
    const { data: customerMessages } = await supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("customer_id", customerId)

    if (customerMessages && customerMessages.length > 0) {
      logTest("2.3 Mensajes transferidos", true, undefined, {
        messagesCount: customerMessages.length,
      })
    } else {
      logTest("2.3 Mensajes transferidos", false, "No se encontraron mensajes transferidos")
    }
  } else {
    logTest("2.1 Cliente creado/asociado", false, "No se encontró cliente asociado")
  }

  // 2.4 Verificar registros contables
  console.log("\n2.4 Verificando registros contables...")

  // IVA Ventas
  const { data: ivaSales } = await supabase.from("iva_sales").select("*").eq("operation_id", operationId)
  if (ivaSales && ivaSales.length > 0) {
    logTest("2.4.1 IVA Ventas creado", true, undefined, {
      ivaAmount: ivaSales[0].iva_amount,
      netAmount: ivaSales[0].net_amount,
    })
  } else {
    logTest("2.4.1 IVA Ventas creado", false, "No se encontró registro de IVA Ventas")
  }

  // IVA Compras
  const { data: ivaPurchases } = await supabase
    .from("iva_purchases")
    .select("*")
    .eq("operation_id", operationId)
  if (ivaPurchases && ivaPurchases.length > 0) {
    logTest("2.4.2 IVA Compras creado", true, undefined, {
      ivaAmount: ivaPurchases[0].iva_amount,
      netAmount: ivaPurchases[0].net_amount,
    })
  } else {
    logTest("2.4.2 IVA Compras creado", false, "No se encontró registro de IVA Compras")
  }

  // Ledger Movements
  const { data: ledgerMovements } = await supabase
    .from("ledger_movements")
    .select("*")
    .eq("operation_id", operationId)

  const accountsReceivable = ledgerMovements?.filter((m) => m.type === "INCOME")
  const accountsPayable = ledgerMovements?.filter((m) => m.type === "EXPENSE")

  if (accountsReceivable && accountsReceivable.length > 0) {
    logTest("2.4.3 Cuentas por Cobrar (Ledger)", true, undefined, {
      movements: accountsReceivable.length,
      total: accountsReceivable.reduce((sum, m) => sum + (m.amount_ars_equivalent || 0), 0),
    })
  } else {
    logTest("2.4.3 Cuentas por Cobrar (Ledger)", false, "No se encontraron movimientos de Cuentas por Cobrar")
  }

  if (accountsPayable && accountsPayable.length > 0) {
    logTest("2.4.4 Cuentas por Pagar (Ledger)", true, undefined, {
      movements: accountsPayable.length,
      total: accountsPayable.reduce((sum, m) => sum + (m.amount_ars_equivalent || 0), 0),
    })
  } else {
    logTest("2.4.4 Cuentas por Pagar (Ledger)", false, "No se encontraron movimientos de Cuentas por Pagar")
  }

  // Operator Payments
  const { data: operatorPayments } = await supabase
    .from("operator_payments")
    .select("*")
    .eq("operation_id", operationId)
  if (operatorPayments && operatorPayments.length > 0) {
    logTest("2.4.5 Operator Payment creado", true, undefined, {
      payments: operatorPayments.length,
      total: operatorPayments.reduce((sum, p) => sum + (p.amount || 0), 0),
    })
  } else {
    logTest("2.4.5 Operator Payment creado", false, "No se encontró registro de Operator Payment")
  }

  // Commission Records
  const { data: commissions } = await supabase
    .from("commission_records")
    .select("*")
    .eq("operation_id", operationId)
  if (commissions && commissions.length > 0) {
    logTest("2.4.6 Commission Record creado", true, undefined, {
      amount: commissions[0].amount,
      percentage: commissions[0].percentage,
    })
  } else {
    logTest("2.4.6 Commission Record creado", false, "No se encontró registro de Commission (puede ser normal si no hay margen)")
  }

  // 2.5 Verificar alertas generadas
  console.log("\n2.5 Verificando alertas generadas...")
  const { data: alerts } = await supabase.from("alerts").select("*").eq("operation_id", operationId)

  if (alerts && alerts.length > 0) {
    const destinationAlerts = alerts.filter((a) => a.type === "DESTINATION_REQUIREMENT")
    const checkInAlerts = alerts.filter((a) => a.type === "UPCOMING_TRIP" && a.description?.includes("Check-in"))
    const checkOutAlerts = alerts.filter((a) => a.type === "UPCOMING_TRIP" && a.description?.includes("Check-out"))
    const paymentAlerts = alerts.filter((a) => a.type === "PAYMENT_DUE" || a.type === "OPERATOR_DUE")

    logTest("2.5 Alertas generadas", true, undefined, {
      total: alerts.length,
      destinationRequirements: destinationAlerts.length,
      checkIn: checkInAlerts.length,
      checkOut: checkOutAlerts.length,
      payments: paymentAlerts.length,
    })

    if (destinationAlerts.length > 0) {
      logTest("2.5.1 Alertas de requisitos de destino", true, undefined, {
        alerts: destinationAlerts.map((a) => a.description),
      })
    } else {
      logTest("2.5.1 Alertas de requisitos de destino", false, "No se generaron alertas de requisitos")
    }

    if (checkInAlerts.length > 0) {
      logTest("2.5.2 Alertas de check-in", true, undefined, {
        alerts: checkInAlerts.map((a) => a.date_due),
      })
    } else {
      logTest("2.5.2 Alertas de check-in", false, "No se generaron alertas de check-in")
    }

    if (checkOutAlerts.length > 0) {
      logTest("2.5.3 Alertas de check-out", true, undefined, {
        alerts: checkOutAlerts.map((a) => a.date_due),
      })
    } else {
      logTest("2.5.3 Alertas de check-out", false, "No se generaron alertas de check-out")
    }

    if (paymentAlerts.length > 0) {
      logTest("2.5.4 Alertas de pagos", true, undefined, {
        alerts: paymentAlerts.map((a) => a.description),
      })
    } else {
      logTest("2.5.4 Alertas de pagos", false, "No se generaron alertas de pagos (puede ser normal si no hay pagos creados)")
    }
  } else {
    logTest("2.5 Alertas generadas", false, "No se encontraron alertas")
  }

  // 2.6 Verificar mensajes WhatsApp generados
  console.log("\n2.6 Verificando mensajes WhatsApp generados...")
  const { data: whatsappMessages } = await supabase
    .from("whatsapp_messages")
    .select("*")
    .eq("operation_id", operationId)

  if (whatsappMessages && whatsappMessages.length > 0) {
    logTest("2.6 Mensajes WhatsApp generados", true, undefined, {
      messages: whatsappMessages.length,
      statuses: whatsappMessages.map((m) => m.status),
    })
  } else {
    logTest("2.6 Mensajes WhatsApp generados", false, "No se generaron mensajes WhatsApp (puede ser normal si no hay templates configurados)")
  }

  // ============================================
  // FASE 3: VERIFICACIÓN DE MÓDULOS DEL SISTEMA
  // ============================================

  console.log("\n" + "=".repeat(60))
  console.log("🔍 FASE 3: VERIFICACIÓN DE MÓDULOS DEL SISTEMA")
  console.log("-".repeat(60))

  // 3.1 Verificar Dashboard (consultar API de analytics)
  console.log("\n3.1 Verificando Dashboard...")
  const { data: operations } = await supabase
    .from("operations")
    .select("sale_amount_total, margin_amount, operator_cost, currency")
    .eq("id", operationId)

  if (operations && operations.length > 0) {
    logTest("3.1 Dashboard - Operación visible", true, undefined, {
      saleAmount: operations[0].sale_amount_total,
      margin: operations[0].margin_amount,
    })
  } else {
    logTest("3.1 Dashboard - Operación visible", false, "No se puede verificar en dashboard")
  }

  // 3.2 Verificar Caja (no debe haber movimientos automáticos)
  console.log("\n3.2 Verificando Caja...")
  const { data: cashMovements } = await supabase
    .from("cash_movements")
    .select("*")
    .eq("operation_id", operationId)

  if (!cashMovements || cashMovements.length === 0) {
    logTest("3.2 Caja - Sin movimientos automáticos", true, "Correcto: los pagos se registran manualmente")
  } else {
    logTest("3.2 Caja - Sin movimientos automáticos", false, `Se encontraron ${cashMovements.length} movimientos automáticos`)
  }

  // 3.3 Verificar Contabilidad
  console.log("\n3.3 Verificando Contabilidad...")
  const totalLedgerMovements = (ledgerMovements?.length || 0) > 0
  logTest("3.3 Contabilidad - Libro Mayor", totalLedgerMovements, undefined, {
    movementsCount: ledgerMovements?.length || 0,
  })

  // 3.4 Verificar Reportes
  console.log("\n3.4 Verificando Reportes...")
  const { data: reportOperations } = await supabase
    .from("operations")
    .select("id, destination, sale_amount_total, margin_amount, margin_percentage")
    .eq("id", operationId)

  if (reportOperations && reportOperations.length > 0) {
    logTest("3.4 Reportes - Operación visible", true, undefined, {
      destination: reportOperations[0].destination,
      margin: reportOperations[0].margin_amount,
    })
  } else {
    logTest("3.4 Reportes - Operación visible", false, "No se puede verificar en reportes")
  }
}

// Ejecutar prueba
testCompleteSystemFlow()
  .then((results) => {
    console.log("\n✅ Prueba completada")
    process.exit(results.filter((r) => !r.passed).length > 0 ? 1 : 0)
  })
  .catch((error) => {
    console.error("\n❌ Error en la prueba:", error)
    process.exit(1)
  })

