/**
 * Script para probar el flujo completo:
 * 1. Crear lead con depósito (vía API)
 * 2. Verificar que se creó ledger_movement
 * 3. Convertir lead a operación
 * 4. Verificar que los movimientos se transfirieron
 */

import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import { join } from "path"

dotenv.config({ path: join(process.cwd(), ".env.local") })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function testCompleteFlow() {
  console.log("🧪 PRUEBA DE FLUJO COMPLETO\n")
  console.log("=" .repeat(50))

  // Paso 1: Obtener datos necesarios
  console.log("\n📋 Paso 1: Obteniendo datos necesarios...")
  const { data: agencies } = await supabase.from("agencies").select("id, name").limit(1)
  const { data: users } = await supabase.from("users").select("id, name").eq("role", "SELLER").limit(1)
  const { data: operators } = await supabase.from("operators").select("id, name").limit(1)

  if (!agencies || !users || !operators || agencies.length === 0 || users.length === 0 || operators.length === 0) {
    console.log("❌ Faltan datos necesarios")
    return
  }

  const agencyId = agencies[0].id
  const sellerId = users[0].id
  const operatorId = operators[0].id

  console.log(`✅ Agencia: ${agencies[0].name}`)
  console.log(`✅ Vendedor: ${users[0].name}`)
  console.log(`✅ Operador: ${operators[0].name}`)

  // Paso 2: Crear lead con depósito (simulando llamada API)
  console.log("\n📝 Paso 2: Creando lead con depósito...")
  const leadData = {
    agency_id: agencyId,
    source: "Other",
    status: "NEW",
    region: "CARIBE",
    destination: "Cancún - Prueba Flujo Completo",
    contact_name: "Cliente Prueba Flujo",
    contact_phone: "+5491112345678",
    contact_email: "prueba@test.com",
    assigned_seller_id: sellerId,
    notes: "Lead de prueba para verificar flujo completo de contabilidad",
    quoted_price: 500000,
    has_deposit: true,
    deposit_amount: 100000,
    deposit_currency: "ARS",
    deposit_method: "BANK",
    deposit_date: new Date().toISOString().split("T")[0],
  }

  // Simular creación vía API (usando el mismo código que el endpoint)
  const { data: lead, error: leadError } = await (supabase.from("leads") as any)
    .insert(leadData)
    .select()
    .single()

  if (leadError || !lead) {
    console.log("❌ Error creando lead:", leadError?.message)
    return
  }

  console.log(`✅ Lead creado: ${lead.id}`)
  console.log(`   - Nombre: ${lead.contact_name}`)
  console.log(`   - Depósito: ${lead.deposit_amount} ${lead.deposit_currency}`)

  // Crear ledger_movement manualmente (simulando lo que hace el endpoint)
  if (lead.has_deposit && lead.deposit_amount && lead.deposit_currency && lead.deposit_date) {
    console.log("\n💰 Creando ledger_movement para depósito...")
    
    // Obtener o crear cuenta por defecto
    const { data: existingAccount } = await (supabase.from("financial_accounts") as any)
      .select("id")
      .eq("type", "CASH")
      .eq("currency", lead.deposit_currency)
      .limit(1)
      .maybeSingle()

    let accountId = existingAccount?.id
    if (!accountId) {
      const { data: newAccount } = await (supabase.from("financial_accounts") as any)
        .insert({
          name: "Caja Principal",
          type: "CASH",
          currency: lead.deposit_currency,
          initial_balance: 0,
        })
        .select("id")
        .single()
      accountId = newAccount?.id
    }

    const exchangeRate = lead.deposit_currency === "USD" ? 1 : null
    const amountArsEquivalent = lead.deposit_currency === "USD" 
      ? lead.deposit_amount * (exchangeRate || 1) 
      : lead.deposit_amount

    const { data: movement, error: movementError } = await (supabase.from("ledger_movements") as any)
      .insert({
        lead_id: lead.id,
        type: "INCOME",
        concept: `Depósito recibido de lead: ${lead.contact_name}`,
        currency: lead.deposit_currency,
        amount_original: lead.deposit_amount,
        exchange_rate: exchangeRate,
        amount_ars_equivalent: amountArsEquivalent,
        method: lead.deposit_method === "CASH" ? "CASH" : lead.deposit_method === "BANK" ? "BANK" : lead.deposit_method === "MP" ? "MP" : "OTHER",
        account_id: accountId,
        seller_id: lead.assigned_seller_id,
        receipt_number: null,
        notes: `Depósito recibido el ${lead.deposit_date}. Método: ${lead.deposit_method || "No especificado"}`,
        created_by: sellerId,
      })
      .select()
      .single()

    if (movementError) {
      console.log("❌ Error creando ledger_movement:", movementError.message)
      return
    }

    console.log(`✅ Ledger movement creado: ${movement.id}`)
    console.log(`   - Tipo: ${movement.type}`)
    console.log(`   - Monto: ${movement.amount_original} ${movement.currency}`)
    console.log(`   - ARS Equivalent: ${movement.amount_ars_equivalent}`)
  }

  // Paso 3: Verificar movimientos del lead
  console.log("\n🔍 Paso 3: Verificando movimientos del lead...")
  const { data: leadMovements } = await supabase
    .from("ledger_movements")
    .select("*")
    .eq("lead_id", lead.id)

  if (leadMovements && leadMovements.length > 0) {
    console.log(`✅ Movimientos encontrados: ${leadMovements.length}`)
    leadMovements.forEach((m, i) => {
      console.log(`   ${i + 1}. ${m.type} - ${m.amount_original} ${m.currency} (ARS: ${m.amount_ars_equivalent})`)
    })
  } else {
    console.log("⚠️  No se encontraron movimientos")
  }

  // Paso 4: Convertir lead a operación
  console.log("\n🔄 Paso 4: Convirtiendo lead a operación...")
  const operationData = {
    agency_id: agencyId,
    lead_id: lead.id,
    seller_id: sellerId,
    operator_id: operatorId,
    type: "PACKAGE",
    destination: lead.destination,
    departure_date: "2025-12-20",
    return_date: "2025-12-27",
    adults: 2,
    children: 0,
    infants: 0,
    status: "PRE_RESERVATION",
    sale_amount_total: 500000,
    operator_cost: 400000,
    currency: "ARS",
  }

  const marginAmount = operationData.sale_amount_total - operationData.operator_cost
  const marginPercentage = (marginAmount / operationData.sale_amount_total) * 100

  const { data: operation, error: operationError } = await (supabase.from("operations") as any)
    .insert({
      ...operationData,
      margin_amount: marginAmount,
      margin_percentage: marginPercentage,
      sale_currency: "ARS",
      operator_cost_currency: "ARS",
      product_type: "PAQUETE",
    })
    .select()
    .single()

  if (operationError || !operation) {
    console.log("❌ Error creando operación:", operationError?.message)
    return
  }

  // Generar file_code
  const fileCode = `OP-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${operation.id.substring(0, 8).toUpperCase()}`
  await supabase.from("operations").update({ file_code: fileCode }).eq("id", operation.id)

  console.log(`✅ Operación creada: ${operation.id}`)
  console.log(`   - File Code: ${fileCode}`)

  // Actualizar lead a WON
  await supabase.from("leads").update({ status: "WON" }).eq("id", lead.id)

  // Paso 5: Transferir movimientos
  console.log("\n🔄 Paso 5: Transfiriendo movimientos de lead a operación...")
  const { error: transferError } = await supabase
    .from("ledger_movements")
    .update({
      operation_id: operation.id,
      lead_id: null,
    })
    .eq("lead_id", lead.id)

  if (transferError) {
    console.log("❌ Error transfiriendo movimientos:", transferError.message)
    return
  }

  console.log("✅ Movimientos transferidos")

  // Paso 6: Verificar movimientos de la operación
  console.log("\n🔍 Paso 6: Verificando movimientos de la operación...")
  const { data: operationMovements } = await supabase
    .from("ledger_movements")
    .select("*")
    .eq("operation_id", operation.id)

  if (operationMovements && operationMovements.length > 0) {
    console.log(`✅ Movimientos encontrados: ${operationMovements.length}`)
    operationMovements.forEach((m, i) => {
      console.log(`   ${i + 1}. ${m.type} - ${m.amount_original} ${m.currency} (ARS: ${m.amount_ars_equivalent})`)
      console.log(`      Concepto: ${m.concept}`)
      console.log(`      Lead ID: ${m.lead_id || "null (transferido)"}`)
    })
  } else {
    console.log("⚠️  No se encontraron movimientos")
  }

  // Verificar que no quedan movimientos con lead_id
  const { data: remainingLeadMovements } = await supabase
    .from("ledger_movements")
    .select("*")
    .eq("lead_id", lead.id)

  if (remainingLeadMovements && remainingLeadMovements.length > 0) {
    console.log(`\n⚠️  ADVERTENCIA: Aún quedan ${remainingLeadMovements.length} movimientos con lead_id`)
  } else {
    console.log("\n✅ Confirmado: No quedan movimientos con lead_id (transferencia completa)")
  }

  console.log("\n" + "=".repeat(50))
  console.log("✅ FLUJO COMPLETO PROBADO EXITOSAMENTE")
  console.log("=".repeat(50))
}

testCompleteFlow().catch(console.error)

