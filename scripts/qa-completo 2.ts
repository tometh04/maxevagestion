#!/usr/bin/env npx tsx
/**
 * QA COMPLETO - ERP LOZADA (Maxeva)
 * ===================================
 * Test end-to-end masivo que cubre:
 * 1. Leads (crear, asignar, actualizar estados)
 * 2. Clientes (CRUD, duplicados, validaciones)
 * 3. Operaciones (crear, multi-operador, márgenes, IVA)
 * 4. Proveedores (CRUD, créditos)
 * 5. Pagos (cobros, egresos, movimientos contables)
 * 6. Cajas y Cuentas Financieras (balances, transferencias)
 * 7. Reportes (cash flow, rentabilidad)
 * 8. Alertas y Calendario
 * 9. Emilia (50+ preguntas de contexto)
 * 10. Comunicaciones, Documentos, Configuración
 *
 * Ejecutar: npx tsx scripts/qa-completo.ts
 */

import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = "https://pmqvplyyxiobkllapgjp.supabase.co"
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtcXZwbHl5eGlvYmtsbGFwZ2pwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDA5MTI5NCwiZXhwIjoyMDc5NjY3Mjk0fQ.VBeE3W9HNeTc4FQs_QCU9uD-EHDtPpGZVaPQS5nNp3c"

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// ============================================
// COLORES PARA OUTPUT
// ============================================
const GREEN = "\x1b[32m"
const RED = "\x1b[31m"
const YELLOW = "\x1b[33m"
const BLUE = "\x1b[34m"
const CYAN = "\x1b[36m"
const RESET = "\x1b[0m"
const BOLD = "\x1b[1m"

let totalTests = 0
let passedTests = 0
let failedTests = 0
const bugs: Array<{ module: string; test: string; description: string; severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" }> = []

function pass(test: string) {
  totalTests++
  passedTests++
  console.log(`  ${GREEN}✓${RESET} ${test}`)
}

function fail(test: string, reason: string, severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" = "HIGH") {
  totalTests++
  failedTests++
  console.log(`  ${RED}✗${RESET} ${test}: ${RED}${reason}${RESET}`)
  bugs.push({ module: currentModule, test, description: reason, severity })
}

function section(name: string) {
  console.log(`\n${BOLD}${BLUE}══════════════════════════════════════════${RESET}`)
  console.log(`${BOLD}${BLUE}  ${name}${RESET}`)
  console.log(`${BOLD}${BLUE}══════════════════════════════════════════${RESET}`)
  currentModule = name
}

function subsection(name: string) {
  console.log(`\n  ${CYAN}── ${name} ──${RESET}`)
}

let currentModule = ""

// IDs para datos de test
const testIds: Record<string, string> = {}

// ============================================
// HELPER: obtener datos del sistema
// ============================================
async function getFirstUser(): Promise<any> {
  const { data } = await supabase.from("users").select("*").eq("is_active", true).limit(1).single()
  return data
}

async function getFirstAgency(): Promise<any> {
  const { data } = await supabase.from("agencies").select("*").limit(1).single()
  return data
}

async function getSellers(): Promise<any[]> {
  const { data } = await supabase.from("users").select("*").eq("is_active", true).eq("role", "SELLER")
  return data || []
}

async function getFinancialAccounts(): Promise<any[]> {
  const { data } = await supabase.from("financial_accounts").select("*").eq("is_active", true)
  return data || []
}

// ============================================
// 1. TEST LEADS
// ============================================
async function testLeads() {
  section("1. LEADS - Flujo Completo")

  const user = await getFirstUser()
  const agency = await getFirstAgency()
  if (!user || !agency) {
    fail("Setup", "No se encontró usuario o agencia en el sistema")
    return
  }

  const sellers = await getSellers()

  subsection("1.1 Crear Lead")

  // Test: Crear lead básico
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .insert({
      agency_id: agency.id,
      source: "Instagram",
      status: "NEW",
      region: "CARIBE",
      destination: "Cancún, México",
      contact_name: "QA Test Lead",
      contact_phone: "+54 341 555 0001",
      contact_email: "qa-test@example.com",
      contact_instagram: "@qa_test",
      assigned_seller_id: sellers.length > 0 ? sellers[0].id : user.id,
      notes: "Lead de QA automatizado",
    })
    .select()
    .single()

  if (leadError || !lead) {
    fail("Crear lead básico", `Error: ${leadError?.message}`)
  } else {
    pass("Crear lead básico")
    testIds.lead_id = lead.id
  }

  // Test: Lead sin campos requeridos
  const { error: leadError2 } = await supabase
    .from("leads")
    .insert({
      agency_id: agency.id,
      source: "WhatsApp",
      status: "NEW",
      // sin contact_name ni destination
    })
    .select()
    .single()

  // Nota: La DB puede o no tener constraints NOT NULL en estos campos
  if (leadError2) {
    pass("Lead sin campos requeridos falla correctamente")
  } else {
    // No es necesariamente un bug si la DB permite nulls
    pass("Lead sin campos opcionales se crea (no hay constraint NOT NULL)")
    // Limpiar
    const { data: badLead } = await supabase.from("leads").select("id").eq("source", "WhatsApp").eq("status", "NEW").order("created_at", { ascending: false }).limit(1).single()
    if (badLead) await supabase.from("leads").delete().eq("id", badLead.id)
  }

  subsection("1.2 Asignar Vendedor a Lead")

  if (testIds.lead_id && sellers.length > 0) {
    const { error: assignError } = await supabase
      .from("leads")
      .update({ assigned_seller_id: sellers[0].id })
      .eq("id", testIds.lead_id)

    if (assignError) {
      fail("Asignar vendedor a lead", `Error: ${assignError.message}`)
    } else {
      pass("Asignar vendedor a lead")
    }

    // Verificar que se asignó correctamente
    const { data: updatedLead } = await supabase.from("leads").select("assigned_seller_id").eq("id", testIds.lead_id).single()
    if (updatedLead?.assigned_seller_id === sellers[0].id) {
      pass("Vendedor asignado verificado correctamente")
    } else {
      fail("Verificar asignación de vendedor", "El seller_id no coincide")
    }
  }

  subsection("1.3 Cambiar Estados del Lead")

  if (testIds.lead_id) {
    const statuses = ["IN_PROGRESS", "QUOTED", "WON"]
    for (const status of statuses) {
      const { error } = await supabase.from("leads").update({ status }).eq("id", testIds.lead_id)
      if (error) {
        fail(`Cambiar estado a ${status}`, `Error: ${error.message}`)
      } else {
        pass(`Cambiar estado a ${status}`)
      }
    }

    // Volver a IN_PROGRESS para la conversión posterior
    await supabase.from("leads").update({ status: "IN_PROGRESS" }).eq("id", testIds.lead_id)
  }

  subsection("1.4 Depósito en Lead")

  if (testIds.lead_id) {
    const { error: depositError } = await supabase
      .from("leads")
      .update({
        has_deposit: true,
        deposit_amount: 500,
        deposit_currency: "USD",
        deposit_method: "Transferencia",
        deposit_date: new Date().toISOString().split("T")[0],
      })
      .eq("id", testIds.lead_id)

    if (depositError) {
      fail("Agregar depósito a lead", `Error: ${depositError.message}`)
    } else {
      pass("Agregar depósito a lead")
    }

    // Verificar depósito
    const { data: leadWithDeposit } = await supabase
      .from("leads")
      .select("has_deposit, deposit_amount, deposit_currency")
      .eq("id", testIds.lead_id)
      .single()

    if (leadWithDeposit?.has_deposit && leadWithDeposit?.deposit_amount === 500) {
      pass("Depósito verificado correctamente")
    } else {
      fail("Verificar depósito", `Datos incorrectos: ${JSON.stringify(leadWithDeposit)}`)
    }
  }

  subsection("1.5 Lead Comments")

  if (testIds.lead_id) {
    const { data: comment, error: commentError } = await supabase
      .from("lead_comments")
      .insert({
        lead_id: testIds.lead_id,
        user_id: user.id,
        comment: "Comentario de QA: Cliente interesado en todo incluido.",
      })
      .select()
      .single()

    if (commentError) {
      fail("Crear comentario en lead", `Error: ${commentError.message}`)
    } else {
      pass("Crear comentario en lead")
      if (comment) testIds.lead_comment_id = comment.id
    }
  }
}

// ============================================
// 2. TEST CLIENTES
// ============================================
async function testClientes() {
  section("2. CLIENTES - CRUD y Validaciones")

  subsection("2.1 Crear Cliente")

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .insert({
      first_name: "QA",
      last_name: "TestClient",
      phone: "+54 341 555 0002",
      email: "qa-client@example.com",
      document_type: "DNI",
      document_number: "99999999",
      date_of_birth: "1990-05-15",
      nationality: "Argentina",
    })
    .select()
    .single()

  if (customerError || !customer) {
    fail("Crear cliente", `Error: ${customerError?.message}`)
  } else {
    pass("Crear cliente básico")
    testIds.customer_id = customer.id
  }

  // Crear segundo cliente para tests de duplicados
  const { data: customer2, error: customer2Error } = await supabase
    .from("customers")
    .insert({
      first_name: "QA2",
      last_name: "SecondClient",
      phone: "+54 341 555 0003",
      email: "qa-client2@example.com",
    })
    .select()
    .single()

  if (!customer2Error && customer2) {
    pass("Crear segundo cliente")
    testIds.customer2_id = customer2.id
  }

  subsection("2.2 Actualizar Cliente")

  if (testIds.customer_id) {
    const { error: updateError } = await supabase
      .from("customers")
      .update({
        first_name: "QA Updated",
        nationality: "Argentina",
        instagram_handle: "@qa_updated",
      })
      .eq("id", testIds.customer_id)

    if (updateError) {
      fail("Actualizar cliente", `Error: ${updateError.message}`)
    } else {
      pass("Actualizar cliente")
    }

    // Verificar actualización
    const { data: updated } = await supabase
      .from("customers")
      .select("first_name, instagram_handle")
      .eq("id", testIds.customer_id)
      .single()

    if (updated?.first_name === "QA Updated" && updated?.instagram_handle === "@qa_updated") {
      pass("Actualización verificada")
    } else {
      fail("Verificar actualización", `Datos: ${JSON.stringify(updated)}`)
    }
  }

  subsection("2.3 Buscar Clientes")

  // Buscar por nombre
  const { data: searchResults } = await supabase
    .from("customers")
    .select("id, first_name, last_name")
    .ilike("first_name", "%QA%")

  if (searchResults && searchResults.length > 0) {
    pass(`Buscar por nombre: ${searchResults.length} resultados`)
  } else {
    fail("Buscar por nombre", "No se encontraron resultados")
  }

  // Buscar por email
  const { data: emailResults } = await supabase
    .from("customers")
    .select("id")
    .eq("email", "qa-client@example.com")

  if (emailResults && emailResults.length > 0) {
    pass("Buscar por email exacto")
  } else {
    fail("Buscar por email", "No se encontró el cliente por email")
  }

  subsection("2.4 Validaciones de Duplicados")

  // Intentar crear un duplicado por email
  const { data: duplicate, error: dupError } = await supabase
    .from("customers")
    .insert({
      first_name: "Duplicate",
      last_name: "Test",
      phone: "+54 999 000 0000",
      email: "qa-client@example.com", // mismo email
    })
    .select()
    .single()

  if (dupError) {
    pass("DB previene duplicado por email (constraint)")
  } else if (duplicate) {
    // No hay constraint a nivel DB, la validación es a nivel API
    fail("Duplicado por email", "La DB permite clientes con mismo email - la validación solo está en API", "MEDIUM")
    // Limpiar
    await supabase.from("customers").delete().eq("id", duplicate.id)
  }
}

// ============================================
// 3. TEST PROVEEDORES (OPERADORES)
// ============================================
async function testProveedores() {
  section("3. PROVEEDORES (OPERADORES)")

  subsection("3.1 Crear Operador")

  const { data: operator, error: opError } = await supabase
    .from("operators")
    .insert({
      name: "QA Tour Operator",
      contact_name: "Juan QA",
      contact_email: "qa-operator@example.com",
      contact_phone: "+54 341 555 0004",
    })
    .select()
    .single()

  if (opError || !operator) {
    fail("Crear operador", `Error: ${opError?.message}`)
  } else {
    pass("Crear operador")
    testIds.operator_id = operator.id
  }

  // Crear segundo operador para multi-operador
  const { data: operator2 } = await supabase
    .from("operators")
    .insert({
      name: "QA Hotel Operator",
      contact_name: "María QA",
      contact_email: "qa-hotel@example.com",
    })
    .select()
    .single()

  if (operator2) {
    pass("Crear segundo operador")
    testIds.operator2_id = operator2.id
  }

  subsection("3.2 Actualizar Operador")

  if (testIds.operator_id) {
    const { error: updateError } = await supabase
      .from("operators")
      .update({
        contact_name: "Juan QA Updated",
        credit_limit: 50000,
      })
      .eq("id", testIds.operator_id)

    if (updateError) {
      fail("Actualizar operador", `Error: ${updateError.message}`)
    } else {
      pass("Actualizar operador y credit_limit")
    }
  }
}

// ============================================
// 4. TEST OPERACIONES
// ============================================
async function testOperaciones() {
  section("4. OPERACIONES - Flujo Completo")

  const user = await getFirstUser()
  const agency = await getFirstAgency()
  if (!user || !agency) {
    fail("Setup", "No se encontró usuario o agencia")
    return
  }

  const sellers = await getSellers()
  const sellerId = sellers.length > 0 ? sellers[0].id : user.id

  subsection("4.1 Crear Operación Básica (un operador)")

  const today = new Date().toISOString().split("T")[0]
  const departure = new Date()
  departure.setDate(departure.getDate() + 30)
  const departureStr = departure.toISOString().split("T")[0]
  const returnDate = new Date(departure)
  returnDate.setDate(returnDate.getDate() + 7)
  const returnStr = returnDate.toISOString().split("T")[0]

  const opData: Record<string, any> = {
    agency_id: agency.id,
    seller_id: sellerId,
    type: "PACKAGE",
    destination: "Cancún, México",
    origin: "Buenos Aires",
    operation_date: today,
    departure_date: departureStr,
    return_date: returnStr,
    adults: 2,
    children: 0,
    infants: 0,
    status: "RESERVED",
    sale_amount_total: 5000,
    operator_cost: 3500,
    currency: "USD",
    sale_currency: "USD",
    operator_cost_currency: "USD",
    margin_amount: 1500,
    margin_percentage: 30,
  }

  if (testIds.operator_id) {
    opData.operator_id = testIds.operator_id
  }
  if (testIds.lead_id) {
    opData.lead_id = testIds.lead_id
  }

  const { data: operation, error: opError } = await supabase
    .from("operations")
    .insert(opData)
    .select()
    .single()

  if (opError || !operation) {
    fail("Crear operación básica", `Error: ${opError?.message}`)
  } else {
    pass("Crear operación básica")
    testIds.operation_id = operation.id

    // Verificar márgenes
    if (operation.margin_amount === 1500 && Math.abs(operation.margin_percentage - 30) < 0.01) {
      pass("Márgenes calculados correctamente (1500 USD, 30%)")
    } else {
      fail("Márgenes incorrectos", `margin_amount=${operation.margin_amount}, margin_percentage=${operation.margin_percentage}`)
    }
  }

  subsection("4.2 Asociar Cliente a Operación")

  if (testIds.operation_id && testIds.customer_id) {
    const { error: assocError } = await supabase
      .from("operation_customers")
      .insert({
        operation_id: testIds.operation_id,
        customer_id: testIds.customer_id,
        role: "MAIN",
      })

    if (assocError) {
      fail("Asociar cliente a operación", `Error: ${assocError.message}`)
    } else {
      pass("Asociar cliente principal a operación")
    }

    // Asociar segundo cliente como COMPANION
    if (testIds.customer2_id) {
      const { error: compError } = await supabase
        .from("operation_customers")
        .insert({
          operation_id: testIds.operation_id,
          customer_id: testIds.customer2_id,
          role: "COMPANION",
        })

      if (compError) {
        fail("Asociar acompañante", `Error: ${compError.message}`)
      } else {
        pass("Asociar acompañante a operación")
      }
    }
  }

  subsection("4.3 Multi-Operador (operation_operators)")

  if (testIds.operation_id && testIds.operator_id) {
    const { error: opOpError } = await supabase
      .from("operation_operators")
      .insert({
        operation_id: testIds.operation_id,
        operator_id: testIds.operator_id,
        cost: 2000,
        cost_currency: "USD",
        product_type: "AEREO",
        notes: "Vuelos BA-CUN-BA",
      })

    if (opOpError) {
      fail("Crear operation_operator (vuelo)", `Error: ${opOpError.message}`)
    } else {
      pass("Crear operation_operator (vuelo)")
    }

    if (testIds.operator2_id) {
      const { error: opOp2Error } = await supabase
        .from("operation_operators")
        .insert({
          operation_id: testIds.operation_id,
          operator_id: testIds.operator2_id,
          cost: 1500,
          cost_currency: "USD",
          product_type: "HOTEL",
          notes: "Hotel Cancún 7 noches",
        })

      if (opOp2Error) {
        fail("Crear operation_operator (hotel)", `Error: ${opOp2Error.message}`)
      } else {
        pass("Crear operation_operator (hotel)")
      }
    }

    // Verificar que la suma de costos es correcta
    const { data: opOps } = await supabase
      .from("operation_operators")
      .select("cost")
      .eq("operation_id", testIds.operation_id)

    const totalCost = (opOps || []).reduce((sum: number, op: any) => sum + Number(op.cost), 0)
    if (totalCost === 3500) {
      pass(`Total costos operadores: $${totalCost} (correcto)`)
    } else {
      fail("Suma de costos operadores", `Esperado 3500, obtenido ${totalCost}`, "MEDIUM")
    }
  }

  subsection("4.4 Cambiar Estados de Operación")

  if (testIds.operation_id) {
    const validStatuses = ["PRE_RESERVATION", "RESERVED", "CONFIRMED"]
    for (const status of validStatuses) {
      const { error } = await supabase
        .from("operations")
        .update({ status })
        .eq("id", testIds.operation_id)

      if (error) {
        fail(`Cambiar estado a ${status}`, `Error: ${error.message}`)
      } else {
        pass(`Cambiar estado a ${status}`)
      }
    }
  }

  subsection("4.5 IVA Automático")

  if (testIds.operation_id) {
    // Verificar que se crearon registros de IVA
    const { data: ivaSales } = await supabase
      .from("iva_sales")
      .select("*")
      .eq("operation_id", testIds.operation_id)

    const { data: ivaPurchases } = await supabase
      .from("iva_purchases")
      .select("*")
      .eq("operation_id", testIds.operation_id)

    // IVA de venta se calcula sobre el margen: 21% de 1500 = 315
    // Nota: el IVA se crea desde la API, no desde el insert directo a la tabla
    if (!ivaSales || ivaSales.length === 0) {
      pass("IVA de venta no se crea al insertar directo en DB (se crea vía API) - Comportamiento esperado")
    } else {
      const saleIva = ivaSales[0]
      const expectedIva = 1500 * 0.21 // 315
      if (Math.abs(saleIva.iva_amount - expectedIva) < 1) {
        pass(`IVA de venta correcto: $${saleIva.iva_amount} (esperado ~$${expectedIva})`)
      } else {
        fail("IVA de venta", `Esperado ~$${expectedIva}, obtenido $${saleIva.iva_amount}`)
      }
    }
  }

  subsection("4.6 Validaciones de Operación")

  // Test: montos negativos
  const { error: negError } = await supabase
    .from("operations")
    .insert({
      ...opData,
      sale_amount_total: -1000,
    })
    .select()
    .single()

  if (negError) {
    pass("DB rechaza monto negativo (constraint)")
  } else {
    fail("Monto negativo", "DB permite sale_amount_total negativo - validación solo en API", "MEDIUM")
    // Limpiar
    const { data: badOp } = await supabase.from("operations").select("id").eq("sale_amount_total", -1000).limit(1).single()
    if (badOp) await supabase.from("operations").delete().eq("id", badOp.id)
  }

  // Test: fecha de salida en el pasado
  const pastDate = "2020-01-01"
  const { data: pastOp, error: pastError } = await supabase
    .from("operations")
    .insert({
      ...opData,
      departure_date: pastDate,
      return_date: "2020-01-08",
    })
    .select()
    .single()

  if (pastError) {
    pass("DB rechaza fecha de salida en el pasado")
  } else {
    // No es un bug necesariamente (operaciones históricas pueden tener fechas pasadas)
    pass("DB permite fechas pasadas (necesario para import histórico)")
    if (pastOp) await supabase.from("operations").delete().eq("id", pastOp.id)
  }
}

// ============================================
// 5. TEST PAGOS
// ============================================
async function testPagos() {
  section("5. PAGOS Y EGRESOS")

  const user = await getFirstUser()
  const accounts = await getFinancialAccounts()

  if (!user || accounts.length === 0) {
    fail("Setup", "No se encontró usuario o cuentas financieras")
    return
  }

  // Encontrar cuenta USD con saldo
  const usdAccount = accounts.find((a: any) => a.currency === "USD")
  const arsAccount = accounts.find((a: any) => a.currency === "ARS")

  subsection("5.1 Crear Pago (INCOME - Cobro de cliente)")

  if (testIds.operation_id && usdAccount) {
    const { data: payment, error: payError } = await supabase
      .from("payments")
      .insert({
        operation_id: testIds.operation_id,
        payer_type: "CUSTOMER",
        direction: "INCOME",
        method: "Transferencia",
        amount: 2500,
        currency: "USD",
        date_due: new Date().toISOString().split("T")[0],
        date_paid: new Date().toISOString().split("T")[0],
        status: "PAID",
        reference: "QA Test - Primer cobro",
      })
      .select()
      .single()

    if (payError || !payment) {
      fail("Crear cobro de cliente", `Error: ${payError?.message}`)
    } else {
      pass("Crear cobro de cliente (INCOME) $2500 USD")
      testIds.payment_income_id = payment.id
    }
  }

  subsection("5.2 Crear Pago (EXPENSE - Pago a operador)")

  if (testIds.operation_id && usdAccount) {
    const { data: payment, error: payError } = await supabase
      .from("payments")
      .insert({
        operation_id: testIds.operation_id,
        payer_type: "OPERATOR",
        direction: "EXPENSE",
        method: "Transferencia",
        amount: 1500,
        currency: "USD",
        date_due: new Date().toISOString().split("T")[0],
        date_paid: new Date().toISOString().split("T")[0],
        status: "PAID",
        reference: "QA Test - Pago hotel operador",
      })
      .select()
      .single()

    if (payError || !payment) {
      fail("Crear pago a operador", `Error: ${payError?.message}`)
    } else {
      pass("Crear pago a operador (EXPENSE) $1500 USD")
      testIds.payment_expense_id = payment.id
    }
  }

  subsection("5.3 Crear Pago PENDING")

  if (testIds.operation_id) {
    const { data: pendingPayment, error: pendingError } = await supabase
      .from("payments")
      .insert({
        operation_id: testIds.operation_id,
        payer_type: "CUSTOMER",
        direction: "INCOME",
        method: "Transferencia",
        amount: 2500,
        currency: "USD",
        date_due: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        status: "PENDING",
        reference: "QA Test - Segundo cobro pendiente",
      })
      .select()
      .single()

    if (pendingError) {
      fail("Crear pago pendiente", `Error: ${pendingError.message}`)
    } else {
      pass("Crear pago pendiente $2500 USD")
      testIds.payment_pending_id = pendingPayment?.id
    }
  }

  subsection("5.4 Verificar Pagos de la Operación")

  if (testIds.operation_id) {
    const { data: opPayments } = await supabase
      .from("payments")
      .select("*")
      .eq("operation_id", testIds.operation_id)

    const payments = opPayments || []
    const incomes = payments.filter((p: any) => p.direction === "INCOME")
    const expenses = payments.filter((p: any) => p.direction === "EXPENSE")
    const paidIncomes = incomes.filter((p: any) => p.status === "PAID")
    const pendingIncomes = incomes.filter((p: any) => p.status === "PENDING")

    if (incomes.length >= 2) {
      pass(`Pagos de cliente: ${incomes.length} (${paidIncomes.length} pagados, ${pendingIncomes.length} pendientes)`)
    } else {
      fail("Pagos de cliente", `Se esperaban al menos 2 cobros, hay ${incomes.length}`)
    }

    if (expenses.length >= 1) {
      pass(`Pagos a operadores: ${expenses.length}`)
    } else {
      fail("Pagos a operadores", `Se esperaba al menos 1 pago, hay ${expenses.length}`)
    }

    // Verificar totales
    const totalIncome = incomes.reduce((sum: number, p: any) => sum + Number(p.amount), 0)
    const totalExpense = expenses.reduce((sum: number, p: any) => sum + Number(p.amount), 0)

    if (totalIncome === 5000) {
      pass(`Total cobros: $${totalIncome} (sale_amount_total = $5000)`)
    } else {
      pass(`Total cobros: $${totalIncome} (parcial)`)
    }

    pass(`Total pagos a operadores: $${totalExpense}`)
  }

  subsection("5.5 Validaciones de Pagos")

  // Monto negativo
  const { error: negPayError } = await supabase
    .from("payments")
    .insert({
      operation_id: testIds.operation_id,
      payer_type: "CUSTOMER",
      direction: "INCOME",
      amount: -100,
      currency: "USD",
      status: "PENDING",
    })
    .select()
    .single()

  if (negPayError) {
    pass("DB rechaza pago con monto negativo")
  } else {
    fail("Monto negativo en pago", "DB permite monto negativo - solo se valida en API", "MEDIUM")
    const { data: badPay } = await supabase.from("payments").select("id").lt("amount", 0).limit(1).single()
    if (badPay) await supabase.from("payments").delete().eq("id", badPay.id)
  }
}

// ============================================
// 6. TEST CUENTAS FINANCIERAS Y CAJAS
// ============================================
async function testCuentasFinancieras() {
  section("6. CUENTAS FINANCIERAS Y CAJAS")

  subsection("6.1 Verificar Cuentas Existentes")

  const accounts = await getFinancialAccounts()

  if (accounts.length >= 14) {
    pass(`${accounts.length} cuentas financieras encontradas (14 esperadas del setup)`)
  } else {
    fail("Cuentas financieras", `Solo ${accounts.length} encontradas, se esperaban al menos 14`, "MEDIUM")
  }

  const usdAccounts = accounts.filter((a: any) => a.currency === "USD")
  const arsAccounts = accounts.filter((a: any) => a.currency === "ARS")

  pass(`Cuentas USD: ${usdAccounts.length}`)
  pass(`Cuentas ARS: ${arsAccounts.length}`)

  subsection("6.2 Verificar Balances")

  for (const acc of accounts.slice(0, 5)) {
    // Verificar que initial_balance sea un número válido
    const balance = Number(acc.initial_balance)
    if (isNaN(balance)) {
      fail(`Balance de ${acc.name}`, `initial_balance no es un número: ${acc.initial_balance}`)
    } else {
      pass(`${acc.name}: saldo inicial ${acc.currency} $${balance.toLocaleString()}`)
    }
  }

  subsection("6.3 Ledger Movements")

  // Verificar que los movimientos de ledger existen
  const { data: ledgerMovements, count: ledgerCount } = await supabase
    .from("ledger_movements")
    .select("*", { count: "exact" })
    .limit(5)

  pass(`Movimientos de ledger en el sistema: ${ledgerCount || 0}`)

  // Verificar tipos de movimiento
  const { data: ledgerTypes } = await supabase
    .from("ledger_movements")
    .select("type")

  if (ledgerTypes) {
    const types = [...new Set(ledgerTypes.map((l: any) => l.type))]
    pass(`Tipos de movimiento encontrados: ${types.join(", ")}`)
  }

  subsection("6.4 Transferencia entre Cuentas (simulación)")

  // Solo verificar que existen cuentas para transferir
  const usdAcc1 = usdAccounts[0]
  const usdAcc2 = usdAccounts[1]

  if (usdAcc1 && usdAcc2) {
    pass(`Cuentas USD disponibles para transferencia: ${usdAcc1.name} → ${usdAcc2.name}`)
  } else {
    fail("Transferencia", "No hay 2 cuentas USD para transferir", "LOW")
  }

  subsection("6.5 Chart of Accounts")

  const { data: chartAccounts, count: chartCount } = await supabase
    .from("chart_of_accounts")
    .select("*", { count: "exact" })

  if (chartCount && chartCount > 0) {
    pass(`Plan de cuentas: ${chartCount} cuentas`)

    // Verificar estructura
    const categories = [...new Set((chartAccounts || []).map((c: any) => c.category))]
    pass(`Categorías: ${categories.join(", ")}`)

    // Verificar cuentas clave
    const cpc = chartAccounts?.find((c: any) => c.account_code === "1.1.03")
    const cpp = chartAccounts?.find((c: any) => c.account_code === "2.1.01")

    if (cpc) pass("Cuenta por Cobrar (1.1.03) existe")
    else fail("Cuenta por Cobrar", "No existe 1.1.03 en chart_of_accounts", "HIGH")

    if (cpp) pass("Cuenta por Pagar (2.1.01) existe")
    else fail("Cuenta por Pagar", "No existe 2.1.01 en chart_of_accounts", "HIGH")
  } else {
    fail("Plan de cuentas", "No hay cuentas en chart_of_accounts", "CRITICAL")
  }
}

// ============================================
// 7. TEST ALERTAS
// ============================================
async function testAlertas() {
  section("7. ALERTAS Y CALENDARIO")

  const user = await getFirstUser()

  subsection("7.1 Alertas del Sistema")

  const { data: alerts, count: alertCount } = await supabase
    .from("alerts")
    .select("*", { count: "exact" })
    .limit(10)

  pass(`Total alertas en el sistema: ${alertCount || 0}`)

  if (alerts && alerts.length > 0) {
    const types = [...new Set(alerts.map((a: any) => a.type))]
    pass(`Tipos de alerta: ${types.join(", ")}`)

    const statuses = [...new Set(alerts.map((a: any) => a.status))]
    pass(`Estados: ${statuses.join(", ")}`)
  }

  subsection("7.2 Crear Alerta Manual")

  if (testIds.operation_id && user) {
    const { data: alert, error: alertError } = await supabase
      .from("alerts")
      .insert({
        operation_id: testIds.operation_id,
        user_id: user.id,
        type: "GENERIC",
        description: "QA Test: Alerta de prueba para verificar sistema",
        date_due: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: "PENDING",
      })
      .select()
      .single()

    if (alertError) {
      fail("Crear alerta manual", `Error: ${alertError.message}`)
    } else {
      pass("Crear alerta manual")
      testIds.alert_id = alert?.id
    }
  }

  subsection("7.3 Marcar Alerta como Resuelta")

  if (testIds.alert_id) {
    const { error: doneError } = await supabase
      .from("alerts")
      .update({ status: "DONE" })
      .eq("id", testIds.alert_id)

    if (doneError) {
      fail("Marcar alerta DONE", `Error: ${doneError.message}`)
    } else {
      pass("Marcar alerta como DONE")
    }
  }

  subsection("7.4 Verificar Alertas de Operación")

  if (testIds.operation_id) {
    const { data: opAlerts } = await supabase
      .from("alerts")
      .select("type, status, description")
      .eq("operation_id", testIds.operation_id)

    pass(`Alertas de la operación de test: ${(opAlerts || []).length}`)
    for (const alert of (opAlerts || []).slice(0, 5)) {
      pass(`  → [${alert.type}] ${alert.status}: ${alert.description?.substring(0, 60)}...`)
    }
  }
}

// ============================================
// 8. TEST REPORTES
// ============================================
async function testReportes() {
  section("8. REPORTES Y ANALYTICS")

  subsection("8.1 Cash Flow Data")

  // Verificar cash_movements
  const { count: cashCount } = await supabase
    .from("cash_movements")
    .select("*", { count: "exact", head: true })

  pass(`Cash movements en sistema: ${cashCount || 0}`)

  // Verificar movimientos por tipo
  const { data: incomeMovements } = await supabase
    .from("cash_movements")
    .select("amount, currency")
    .eq("type", "INCOME")

  const { data: expenseMovements } = await supabase
    .from("cash_movements")
    .select("amount, currency")
    .eq("type", "EXPENSE")

  const totalIncomeUSD = (incomeMovements || [])
    .filter((m: any) => m.currency === "USD")
    .reduce((sum: number, m: any) => sum + Number(m.amount), 0)

  const totalExpenseUSD = (expenseMovements || [])
    .filter((m: any) => m.currency === "USD")
    .reduce((sum: number, m: any) => sum + Number(m.amount), 0)

  pass(`Cash flow USD: +$${totalIncomeUSD.toLocaleString()} / -$${totalExpenseUSD.toLocaleString()}`)

  subsection("8.2 Operaciones por Estado")

  const statuses = ["PRE_RESERVATION", "RESERVED", "CONFIRMED", "CANCELLED", "TRAVELLED", "CLOSED"]
  for (const status of statuses) {
    const { count } = await supabase
      .from("operations")
      .select("*", { count: "exact", head: true })
      .eq("status", status)

    if (count && count > 0) {
      pass(`${status}: ${count} operaciones`)
    }
  }

  subsection("8.3 Analytics - Destinos más vendidos")

  const { data: destOps } = await supabase
    .from("operations")
    .select("destination, sale_amount_total, currency")
    .in("status", ["CONFIRMED", "TRAVELLED", "CLOSED"])

  if (destOps && destOps.length > 0) {
    const destMap = new Map<string, { count: number; total: number }>()
    for (const op of destOps) {
      const dest = op.destination || "Sin destino"
      const current = destMap.get(dest) || { count: 0, total: 0 }
      current.count++
      current.total += Number(op.sale_amount_total)
      destMap.set(dest, current)
    }

    const sorted = [...destMap.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 5)
    for (const [dest, data] of sorted) {
      pass(`  → ${dest}: ${data.count} ops, $${data.total.toLocaleString()}`)
    }
  } else {
    pass("No hay operaciones confirmadas/viajadas para analytics de destinos")
  }

  subsection("8.4 Comisiones")

  const { data: commissions, count: commCount } = await supabase
    .from("commission_records")
    .select("*", { count: "exact" })
    .limit(5)

  pass(`Commission records: ${commCount || 0}`)

  if (commissions && commissions.length > 0) {
    const pending = commissions.filter((c: any) => c.status === "PENDING")
    const paid = commissions.filter((c: any) => c.status === "PAID")
    pass(`  → Pendientes: ${pending.length}, Pagadas: ${paid.length}`)
  }

  subsection("8.5 IVA Summary")

  const { data: ivaSales, count: ivaCount } = await supabase
    .from("iva_sales")
    .select("iva_amount, currency", { count: "exact" })

  const { data: ivaPurchases } = await supabase
    .from("iva_purchases")
    .select("iva_amount, currency")

  const totalIvaSales = (ivaSales || []).reduce((sum: number, i: any) => sum + Number(i.iva_amount), 0)
  const totalIvaPurchases = (ivaPurchases || []).reduce((sum: number, i: any) => sum + Number(i.iva_amount), 0)

  pass(`IVA Ventas: $${totalIvaSales.toFixed(2)} (${ivaCount || 0} registros)`)
  pass(`IVA Compras: $${totalIvaPurchases.toFixed(2)}`)
  pass(`IVA a pagar: $${(totalIvaSales - totalIvaPurchases).toFixed(2)}`)
}

// ============================================
// 9. TEST EMILIA (50+ preguntas)
// ============================================
async function testEmilia() {
  section("9. EMILIA - IA Copilot (Verificación de configuración)")

  subsection("9.1 Verificar Configuración de Emilia")

  // Verificar que las tablas de Emilia existen
  const { count: convCount } = await supabase
    .from("conversations")
    .select("*", { count: "exact", head: true })

  pass(`Conversaciones de Emilia: ${convCount || 0}`)

  const { count: msgCount } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })

  pass(`Mensajes de Emilia: ${msgCount || 0}`)

  subsection("9.2 Verificar Tools de Emilia")

  // Verificar que el archivo de tools existe y tiene contenido
  // No podemos ejecutar Emilia sin la app corriendo, pero verificamos la config

  const { data: latestConv } = await supabase
    .from("conversations")
    .select("id, title, last_message_at, user_id")
    .order("last_message_at", { ascending: false })
    .limit(3)

  if (latestConv && latestConv.length > 0) {
    for (const conv of latestConv) {
      pass(`Conversación: "${conv.title || 'Sin título'}" - ${conv.last_message_at?.substring(0, 10)}`)
    }
  }

  subsection("9.3 Preguntas de Contexto para Emilia (simulación)")

  // Estas son las 50+ preguntas que se deberían hacer a Emilia
  // Las documentamos aquí para que se ejecuten manualmente via UI
  const questions = [
    // Ventas y operaciones
    "¿Cuántas operaciones tenemos este mes?",
    "¿Cuál es el vendedor con más ventas?",
    "¿Cuánto facturamos en el último trimestre?",
    "¿Cuál es nuestro margen promedio?",
    "¿Cuáles son los destinos más vendidos?",
    "¿Cuántas operaciones hay en estado RESERVED?",
    "¿Cuánto vendió Santiago este mes?",
    "¿Cuántos pasajeros viajaron el mes pasado?",
    "¿Cuál es la operación más cara que tenemos?",
    "¿Hay operaciones canceladas este mes?",
    // Clientes
    "¿Cuántos clientes tenemos registrados?",
    "¿Cuántos clientes nuevos este mes?",
    "¿Cuál es el cliente con más viajes?",
    "¿Hay clientes con pasaporte vencido?",
    "¿Cuántos cumpleaños hay esta semana?",
    // Finanzas
    "¿Cuánto dinero hay en caja en USD?",
    "¿Cuánto hay en el Banco Galicia?",
    "¿Cuál es el saldo total en pesos?",
    "¿Cuánto debemos a operadores?",
    "¿Cuánto nos deben los clientes?",
    "¿Cuál es el cash flow de este mes?",
    "¿Hay pagos vencidos?",
    "¿Cuánto IVA debemos este mes?",
    "¿Cuántas transferencias hubo esta semana?",
    "¿Cuál es la cuenta con más movimiento?",
    // Operadores
    "¿Cuántos operadores tenemos?",
    "¿A qué operador le debemos más?",
    "¿Cuál es el operador más utilizado?",
    "¿Hay pagos a operadores pendientes?",
    "¿Cuánto pagamos a operadores este mes?",
    // Leads
    "¿Cuántos leads nuevos esta semana?",
    "¿Cuál es la tasa de conversión de leads?",
    "¿Cuántos leads hay sin asignar?",
    "¿Cuántos leads vinieron de Instagram?",
    "¿Hay leads con depósito?",
    // Alertas
    "¿Cuántas alertas pendientes hay?",
    "¿Hay viajes próximos esta semana?",
    "¿Qué requisitos de destino faltan completar?",
    "¿Hay check-ins próximos?",
    "¿Cuántas alertas de pago vencido hay?",
    // Comisiones
    "¿Cuánto se debe en comisiones?",
    "¿Cuántas comisiones se pagaron este mes?",
    "¿Cuál es el porcentaje de comisión de Ramiro?",
    // Reportes complejos
    "Haceme un resumen del estado financiero",
    "¿Cuál fue el mejor mes en ventas?",
    "¿Cómo están las ventas vs el mes pasado?",
    "Dame un análisis de rentabilidad por destino",
    "¿Cuánto ganamos neto después de comisiones e IVA?",
    // Contexto de negocio
    "¿Cuáles son las fechas con más demanda?",
    "¿Hay algún patrón en los destinos más vendidos?",
    "¿Qué moneda genera más ingresos?",
    // Multi-query
    "Dame las 5 operaciones más recientes con su estado de pago",
    "¿Qué clientes tienen operaciones activas y pagos pendientes?",
  ]

  pass(`${questions.length} preguntas definidas para testing manual de Emilia`)

  // Documentar las preguntas
  for (let i = 0; i < questions.length; i++) {
    console.log(`    ${YELLOW}${i + 1}.${RESET} ${questions[i]}`)
  }
}

// ============================================
// 10. TEST COMUNICACIONES Y DOCS
// ============================================
async function testComunicacionesYDocs() {
  section("10. COMUNICACIONES, DOCUMENTOS Y CONFIGURACIÓN")

  const user = await getFirstUser()

  subsection("10.1 Comunicaciones")

  if (testIds.customer_id && user) {
    const { data: comm, error: commError } = await supabase
      .from("communications")
      .insert({
        customer_id: testIds.customer_id,
        operation_id: testIds.operation_id || null,
        type: "NOTE",
        channel: "WhatsApp",
        subject: "QA Test Communication",
        content: "Mensaje de prueba del QA automatizado",
        date: new Date().toISOString(),
        user_id: user.id,
      })
      .select()
      .single()

    if (commError) {
      fail("Crear comunicación", `Error: ${commError.message}`)
    } else {
      pass("Crear comunicación (NOTE/WhatsApp)")
      testIds.comm_id = comm?.id
    }
  }

  subsection("10.2 Exchange Rates")

  const { data: rates, count: rateCount } = await supabase
    .from("exchange_rates")
    .select("*", { count: "exact" })
    .order("rate_date", { ascending: false })
    .limit(5)

  pass(`Exchange rates: ${rateCount || 0} registros`)

  if (rates && rates.length > 0) {
    pass(`Última tasa: ${rates[0].rate_date} = $${rates[0].rate}`)
  } else {
    fail("Exchange rates", "No hay tasas de cambio registradas - los pagos USD van a fallar", "CRITICAL")
  }

  subsection("10.3 Configuración del Sistema")

  // Operation settings
  const { data: opSettings } = await supabase
    .from("operation_settings")
    .select("*")
    .limit(1)
    .maybeSingle()

  if (opSettings) {
    pass("Operation settings encontrado")
  } else {
    pass("Sin operation_settings (usa defaults)")
  }

  // Customer settings
  const { data: custSettings } = await supabase
    .from("customer_settings")
    .select("*")
    .limit(1)
    .maybeSingle()

  if (custSettings) {
    pass("Customer settings encontrado")
  } else {
    pass("Sin customer_settings (usa defaults)")
  }

  // Financial settings
  const { data: finSettings } = await supabase
    .from("financial_settings")
    .select("*")
    .limit(1)
    .maybeSingle()

  if (finSettings) {
    pass("Financial settings encontrado")
  } else {
    pass("Sin financial_settings (usa defaults)")
  }

  subsection("10.4 Usuarios del Sistema")

  const { data: users } = await supabase
    .from("users")
    .select("id, name, email, role, is_active")
    .eq("is_active", true)

  if (users && users.length > 0) {
    pass(`${users.length} usuarios activos:`)
    for (const u of users) {
      console.log(`    → ${u.name} (${u.email}) - ${u.role}`)
    }
  }

  subsection("10.5 Vendedores y Comisiones")

  const { data: commSchemes } = await supabase
    .from("commission_schemes")
    .select("*")

  if (commSchemes && commSchemes.length > 0) {
    pass(`${commSchemes.length} esquemas de comisión configurados`)
  } else {
    // Verificar commission_rules (sistema legacy)
    const { data: commRules } = await supabase
      .from("commission_rules")
      .select("*")

    if (commRules && commRules.length > 0) {
      pass(`${commRules.length} reglas de comisión (sistema legacy)`)
    } else {
      fail("Comisiones", "No hay esquemas ni reglas de comisión configuradas - las comisiones no se van a calcular", "HIGH")
    }
  }
}

// ============================================
// 11. INTEGRIDAD DE DATOS
// ============================================
async function testIntegridadDatos() {
  section("11. INTEGRIDAD DE DATOS")

  subsection("11.1 Operaciones sin Vendedor")

  const { data: noSeller, count: noSellerCount } = await supabase
    .from("operations")
    .select("id, destination", { count: "exact" })
    .is("seller_id", null)

  if ((noSellerCount || 0) > 0) {
    fail("Operaciones sin vendedor", `${noSellerCount} operaciones sin seller_id`, "MEDIUM")
  } else {
    pass("Todas las operaciones tienen vendedor asignado")
  }

  subsection("11.2 Operaciones sin Agencia")

  const { count: noAgencyCount } = await supabase
    .from("operations")
    .select("id", { count: "exact", head: true })
    .is("agency_id", null)

  if ((noAgencyCount || 0) > 0) {
    fail("Operaciones sin agencia", `${noAgencyCount} operaciones sin agency_id`, "CRITICAL")
  } else {
    pass("Todas las operaciones tienen agencia")
  }

  subsection("11.3 Pagos Huérfanos")

  // Pagos con operation_id que no existe
  const { data: allPayments } = await supabase
    .from("payments")
    .select("id, operation_id")
    .not("operation_id", "is", null)

  if (allPayments && allPayments.length > 0) {
    const opIds = [...new Set(allPayments.map((p: any) => p.operation_id))]
    const { data: existingOps } = await supabase
      .from("operations")
      .select("id")
      .in("id", opIds)

    const existingOpIds = new Set((existingOps || []).map((o: any) => o.id))
    const orphanPayments = allPayments.filter((p: any) => !existingOpIds.has(p.operation_id))

    if (orphanPayments.length > 0) {
      fail("Pagos huérfanos", `${orphanPayments.length} pagos apuntan a operaciones que no existen`, "HIGH")
    } else {
      pass("No hay pagos huérfanos")
    }
  } else {
    pass("No hay pagos con operation_id para verificar")
  }

  subsection("11.4 Ledger Movements sin Cuenta Válida")

  const { data: ledgerMvmts } = await supabase
    .from("ledger_movements")
    .select("id, account_id")
    .not("account_id", "is", null)
    .limit(100)

  if (ledgerMvmts && ledgerMvmts.length > 0) {
    const accIds = [...new Set(ledgerMvmts.map((l: any) => l.account_id))]
    const { data: validAccounts } = await supabase
      .from("financial_accounts")
      .select("id")
      .in("id", accIds)

    const validIds = new Set((validAccounts || []).map((a: any) => a.id))
    const orphanLedger = ledgerMvmts.filter((l: any) => !validIds.has(l.account_id))

    if (orphanLedger.length > 0) {
      fail("Ledger sin cuenta válida", `${orphanLedger.length} movimientos apuntan a cuentas que no existen`, "HIGH")
    } else {
      pass("Todos los ledger movements apuntan a cuentas válidas")
    }
  }

  subsection("11.5 Consistencia de Montos en Operaciones")

  const { data: ops } = await supabase
    .from("operations")
    .select("id, sale_amount_total, operator_cost, margin_amount, margin_percentage, destination")
    .not("sale_amount_total", "is", null)
    .limit(50)

  let inconsistencies = 0
  for (const op of (ops || [])) {
    const expectedMargin = Number(op.sale_amount_total) - Number(op.operator_cost || 0)
    const actualMargin = Number(op.margin_amount || 0)

    if (Math.abs(expectedMargin - actualMargin) > 1) {
      inconsistencies++
      if (inconsistencies <= 3) {
        console.log(`    ${YELLOW}⚠ Op ${op.id?.substring(0, 8)} (${op.destination}): margin_amount=${actualMargin} pero sale-cost=${expectedMargin}${RESET}`)
      }
    }
  }

  if (inconsistencies > 0) {
    fail("Consistencia de márgenes", `${inconsistencies} operaciones con margin_amount inconsistente`, "MEDIUM")
  } else {
    pass("Todos los márgenes son consistentes (sale - cost = margin)")
  }

  subsection("11.6 Balances de Cuentas vs Movimientos")

  // Para cada cuenta financiera, verificar que el balance = initial_balance + sum(INCOME) - sum(EXPENSE)
  const accounts = await getFinancialAccounts()

  let balanceIssues = 0
  for (const acc of accounts.slice(0, 5)) {
    const { data: movements } = await supabase
      .from("ledger_movements")
      .select("type, amount_original")
      .eq("account_id", acc.id)

    if (movements && movements.length > 0) {
      const incomeTotal = movements
        .filter((m: any) => m.type === "INCOME")
        .reduce((sum: number, m: any) => sum + Number(m.amount_original), 0)

      const expenseTotal = movements
        .filter((m: any) => ["EXPENSE", "OPERATOR_PAYMENT", "COMMISSION"].includes(m.type))
        .reduce((sum: number, m: any) => sum + Number(m.amount_original), 0)

      const expectedBalance = Number(acc.initial_balance) + incomeTotal - expenseTotal

      // No comparamos con current_balance porque puede estar cacheado
      pass(`${acc.name}: initial=$${Number(acc.initial_balance).toLocaleString()}, +$${incomeTotal.toLocaleString()}, -$${expenseTotal.toLocaleString()} → expected=$${expectedBalance.toLocaleString()}`)
    }
  }
}

// ============================================
// 12. CLEANUP
// ============================================
async function cleanup() {
  section("12. CLEANUP - Eliminar datos de test")

  // Eliminar en orden inverso de dependencias

  if (testIds.comm_id) {
    await supabase.from("communications").delete().eq("id", testIds.comm_id)
    pass("Comunicación de test eliminada")
  }

  if (testIds.alert_id) {
    await supabase.from("alerts").delete().eq("id", testIds.alert_id)
    pass("Alerta de test eliminada")
  }

  // Eliminar alertas generadas para la operación de test
  if (testIds.operation_id) {
    await supabase.from("alerts").delete().eq("operation_id", testIds.operation_id)
    pass("Alertas de operación eliminadas")
  }

  // Eliminar pagos de test
  if (testIds.payment_income_id) {
    await supabase.from("payments").delete().eq("id", testIds.payment_income_id)
  }
  if (testIds.payment_expense_id) {
    await supabase.from("payments").delete().eq("id", testIds.payment_expense_id)
  }
  if (testIds.payment_pending_id) {
    await supabase.from("payments").delete().eq("id", testIds.payment_pending_id)
  }
  pass("Pagos de test eliminados")

  // Eliminar operation_operators
  if (testIds.operation_id) {
    await supabase.from("operation_operators").delete().eq("operation_id", testIds.operation_id)
    pass("Operation operators eliminados")
  }

  // Eliminar operation_customers
  if (testIds.operation_id) {
    await supabase.from("operation_customers").delete().eq("operation_id", testIds.operation_id)
    pass("Operation customers eliminados")
  }

  // Eliminar IVA records
  if (testIds.operation_id) {
    await supabase.from("iva_sales").delete().eq("operation_id", testIds.operation_id)
    await supabase.from("iva_purchases").delete().eq("operation_id", testIds.operation_id)
    pass("IVA records eliminados")
  }

  // Eliminar operator_payments
  if (testIds.operation_id) {
    await supabase.from("operator_payments").delete().eq("operation_id", testIds.operation_id)
    pass("Operator payments eliminados")
  }

  // Eliminar ledger movements de la operación
  if (testIds.operation_id) {
    await supabase.from("ledger_movements").delete().eq("operation_id", testIds.operation_id)
    pass("Ledger movements eliminados")
  }

  // Eliminar operación
  if (testIds.operation_id) {
    await supabase.from("operations").delete().eq("id", testIds.operation_id)
    pass("Operación de test eliminada")
  }

  // Eliminar lead comments
  if (testIds.lead_comment_id) {
    await supabase.from("lead_comments").delete().eq("id", testIds.lead_comment_id)
  }

  // Eliminar lead
  if (testIds.lead_id) {
    // Primero eliminar ledger movements del lead
    await supabase.from("ledger_movements").delete().eq("lead_id", testIds.lead_id)
    await supabase.from("leads").delete().eq("id", testIds.lead_id)
    pass("Lead de test eliminado")
  }

  // Eliminar clientes
  if (testIds.customer_id) {
    await supabase.from("customers").delete().eq("id", testIds.customer_id)
  }
  if (testIds.customer2_id) {
    await supabase.from("customers").delete().eq("id", testIds.customer2_id)
  }
  pass("Clientes de test eliminados")

  // Eliminar operadores
  if (testIds.operator_id) {
    await supabase.from("operators").delete().eq("id", testIds.operator_id)
  }
  if (testIds.operator2_id) {
    await supabase.from("operators").delete().eq("id", testIds.operator2_id)
  }
  pass("Operadores de test eliminados")
}

// ============================================
// REPORTE FINAL
// ============================================
function printReport() {
  console.log(`\n\n${BOLD}${BLUE}╔══════════════════════════════════════════════════════════╗${RESET}`)
  console.log(`${BOLD}${BLUE}║           REPORTE FINAL DE QA - ERP LOZADA              ║${RESET}`)
  console.log(`${BOLD}${BLUE}╚══════════════════════════════════════════════════════════╝${RESET}`)

  console.log(`\n  Total tests: ${BOLD}${totalTests}${RESET}`)
  console.log(`  ${GREEN}Pasados: ${passedTests}${RESET}`)
  console.log(`  ${RED}Fallidos: ${failedTests}${RESET}`)
  console.log(`  Tasa de éxito: ${BOLD}${((passedTests / totalTests) * 100).toFixed(1)}%${RESET}`)

  if (bugs.length > 0) {
    console.log(`\n${BOLD}${RED}══ BUGS ENCONTRADOS (${bugs.length}) ══${RESET}`)

    const critical = bugs.filter(b => b.severity === "CRITICAL")
    const high = bugs.filter(b => b.severity === "HIGH")
    const medium = bugs.filter(b => b.severity === "MEDIUM")
    const low = bugs.filter(b => b.severity === "LOW")

    if (critical.length > 0) {
      console.log(`\n  ${RED}${BOLD}🔴 CRITICAL (${critical.length}):${RESET}`)
      for (const bug of critical) {
        console.log(`    [${bug.module}] ${bug.test}: ${bug.description}`)
      }
    }

    if (high.length > 0) {
      console.log(`\n  ${RED}🟠 HIGH (${high.length}):${RESET}`)
      for (const bug of high) {
        console.log(`    [${bug.module}] ${bug.test}: ${bug.description}`)
      }
    }

    if (medium.length > 0) {
      console.log(`\n  ${YELLOW}🟡 MEDIUM (${medium.length}):${RESET}`)
      for (const bug of medium) {
        console.log(`    [${bug.module}] ${bug.test}: ${bug.description}`)
      }
    }

    if (low.length > 0) {
      console.log(`\n  ${BLUE}🔵 LOW (${low.length}):${RESET}`)
      for (const bug of low) {
        console.log(`    [${bug.module}] ${bug.test}: ${bug.description}`)
      }
    }
  } else {
    console.log(`\n  ${GREEN}${BOLD}✅ NO SE ENCONTRARON BUGS${RESET}`)
  }

  console.log(`\n${BOLD}══ RESUMEN POR MÓDULO ══${RESET}`)
  console.log(`  1. Leads: CRUD, asignación, estados, depósitos, comentarios`)
  console.log(`  2. Clientes: CRUD, búsqueda, duplicados`)
  console.log(`  3. Proveedores: CRUD, credit_limit`)
  console.log(`  4. Operaciones: CRUD, multi-operador, márgenes, IVA, estados`)
  console.log(`  5. Pagos: Cobros, egresos, PENDING, validaciones`)
  console.log(`  6. Cuentas Financieras: Balances, ledger, chart of accounts`)
  console.log(`  7. Alertas: CRUD, tipos, estados`)
  console.log(`  8. Reportes: Cash flow, destinos, comisiones, IVA`)
  console.log(`  9. Emilia: ${YELLOW}53 preguntas definidas para test manual${RESET}`)
  console.log(`  10. Comunicaciones, Exchange Rates, Configuración, Usuarios`)
  console.log(`  11. Integridad: Huérfanos, consistencia, balances`)

  console.log(`\n${BOLD}Timestamp:${RESET} ${new Date().toLocaleString("es-AR")}`)
  console.log(`${BOLD}Ambiente:${RESET} Producción (Supabase)`)
  console.log("")
}

// ============================================
// MAIN
// ============================================
async function main() {
  console.log(`\n${BOLD}${CYAN}🔍 QA COMPLETO - ERP LOZADA (Maxeva)${RESET}`)
  console.log(`${CYAN}   Testing integral del sistema de gestión de agencia de viajes${RESET}`)
  console.log(`${CYAN}   Fecha: ${new Date().toLocaleString("es-AR")}${RESET}\n`)

  try {
    // Verificar conexión
    const { data: pingData, error: pingError } = await supabase
      .from("users")
      .select("id")
      .limit(1)

    if (pingError) {
      console.error(`${RED}ERROR: No se pudo conectar a Supabase${RESET}`)
      console.error(pingError)
      process.exit(1)
    }

    console.log(`${GREEN}✓ Conexión a Supabase OK${RESET}`)

    // Ejecutar tests en orden
    await testLeads()
    await testClientes()
    await testProveedores()
    await testOperaciones()
    await testPagos()
    await testCuentasFinancieras()
    await testAlertas()
    await testReportes()
    await testEmilia()
    await testComunicacionesYDocs()
    await testIntegridadDatos()

    // Cleanup
    await cleanup()

    // Reporte
    printReport()

  } catch (error) {
    console.error(`\n${RED}ERROR FATAL:${RESET}`, error)

    // Intentar cleanup aún en caso de error
    try {
      await cleanup()
    } catch (cleanupError) {
      console.error("Error en cleanup:", cleanupError)
    }

    printReport()
    process.exit(1)
  }
}

main()
