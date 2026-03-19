/**
 * Script para sincronizar pagos históricos al ledger
 *
 * Busca todos los pagos con status='PAID' que NO tienen ledger_movement_id
 * y crea las entradas en ledger_movements correspondientes.
 *
 * Esto permite que movimientos anteriores al 18/02/2026 aparezcan en la Caja.
 *
 * Uso: npx tsx scripts/sync-historical-to-ledger.ts
 * Modo dry-run (solo muestra qué haría): npx tsx scripts/sync-historical-to-ledger.ts --dry-run
 */

import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Faltan variables de entorno: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)
const isDryRun = process.argv.includes("--dry-run")

async function getFinancialAccountForPayment(
  currency: string,
  agencyId: string | null,
  method: string | null
): Promise<string | null> {
  // Try to find the most appropriate account based on method and currency
  let type = "CASH_" + currency.toUpperCase()

  if (method === "Transferencia" || method === "BANK") {
    type = currency === "USD" ? "SAVINGS_USD" : "CHECKING_ARS"
  } else if (method === "Mercado Pago" || method === "MercadoPago" || method === "MP") {
    type = "CREDIT_CARD"
  }

  // First try specific type
  let query = supabase
    .from("financial_accounts")
    .select("id")
    .eq("currency", currency)
    .eq("is_active", true)

  if (agencyId) {
    query = query.eq("agency_id", agencyId)
  }

  query = query.eq("type", type).limit(1)
  const { data: specific } = await query

  if (specific?.length) return specific[0].id

  // Fallback: any account with matching currency and agency
  let fallbackQuery = supabase
    .from("financial_accounts")
    .select("id, chart_account_id")
    .eq("currency", currency)
    .eq("is_active", true)

  if (agencyId) {
    fallbackQuery = fallbackQuery.eq("agency_id", agencyId)
  }

  const { data: fallback } = await fallbackQuery.limit(5)

  // Exclude CpC/CpP accounts
  const { data: accountingCharts } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .in("account_code", ["1.1.03", "2.1.01"])
    .eq("is_active", true)

  const accountingChartIds = new Set((accountingCharts || []).map((c: any) => c.id))

  const nonAccountingAccounts = (fallback || []).filter(
    (a: any) => !accountingChartIds.has(a.chart_account_id)
  )

  return nonAccountingAccounts.length > 0 ? nonAccountingAccounts[0].id : null
}

async function getMainPassengerName(operationId: string): Promise<string | null> {
  const { data } = await supabase
    .from("operation_customers")
    .select("customers:customer_id(first_name, last_name)")
    .eq("operation_id", operationId)
    .eq("role", "MAIN")
    .limit(1)
    .maybeSingle()

  if (!data) return null
  const customer = (data as any).customers
  if (!customer) return null
  return `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || null
}

async function syncHistoricalToLedger() {
  console.log(isDryRun ? "🔍 DRY RUN — no se crearán registros\n" : "🚀 Sincronizando pagos históricos al ledger...\n")

  // 1. Get all PAID payments without ledger_movement_id
  const { data: payments, error } = await supabase
    .from("payments")
    .select(`
      id,
      operation_id,
      amount,
      currency,
      direction,
      payer_type,
      method,
      date_paid,
      reference,
      status,
      ledger_movement_id,
      exchange_rate,
      operations:operation_id(
        id,
        agency_id,
        seller_id,
        operator_id
      )
    `)
    .eq("status", "PAID")
    .is("ledger_movement_id", null)
    .not("date_paid", "is", null)
    .order("date_paid", { ascending: true })

  if (error) {
    console.error("❌ Error obteniendo pagos:", error)
    return
  }

  console.log(`📊 Encontrados ${payments?.length || 0} pagos PAID sin ledger_movement_id\n`)

  if (!payments || payments.length === 0) {
    console.log("✅ Todos los pagos ya tienen movimiento en el ledger. Nada que hacer.")
    return
  }

  let created = 0
  let skipped = 0
  let errors = 0

  for (const payment of payments) {
    const operation = (payment as any).operations
    const agencyId = operation?.agency_id || null
    const operationCode = payment.operation_id ? payment.operation_id.slice(0, 8) : "N/A"

    // Find appropriate financial account
    const accountId = await getFinancialAccountForPayment(
      payment.currency,
      agencyId,
      payment.method
    )

    if (!accountId) {
      console.warn(`⚠️ No se encontró cuenta financiera para pago ${payment.id} (${payment.currency}, agency: ${agencyId})`)
      skipped++
      continue
    }

    // Get passenger name for concept
    let passengerName: string | null = null
    if (payment.operation_id) {
      passengerName = await getMainPassengerName(payment.operation_id)
    }
    if (!passengerName && payment.operation_id) {
      // Try to get contact name from leads linked to this operation
      const { data: lead } = await supabase
        .from("leads")
        .select("contact_name")
        .eq("operation_id", payment.operation_id)
        .limit(1)
        .maybeSingle()
      passengerName = (lead as any)?.contact_name || null
    }

    // Determine type
    const ledgerType = payment.direction === "INCOME"
      ? "INCOME"
      : payment.payer_type === "OPERATOR"
        ? "OPERATOR_PAYMENT"
        : "EXPENSE"

    // Calculate ARS equivalent
    const amountNum = parseFloat(payment.amount?.toString() || "0")
    let amountArs = amountNum
    let exchangeRate = payment.exchange_rate || null

    if (payment.currency === "USD") {
      if (!exchangeRate) exchangeRate = 1450 // Fallback
      amountArs = amountNum * exchangeRate
    }

    // Build concept
    const concept = payment.direction === "INCOME"
      ? passengerName
        ? `${passengerName} (${operationCode})`
        : `Cobro de cliente - Op. ${operationCode}`
      : passengerName
        ? `Pago a operador - ${passengerName} (${operationCode})`
        : `Pago a operador - Op. ${operationCode}`

    // Method mapping
    const methodMap: Record<string, string> = {
      "Efectivo": "CASH",
      "Transferencia": "BANK",
      "Mercado Pago": "MP",
      "MercadoPago": "MP",
      "MP": "MP",
      "USD": "USD",
    }
    const ledgerMethod = payment.method ? (methodMap[payment.method] || "OTHER") : "CASH"

    if (isDryRun) {
      console.log(`  [DRY] ${payment.date_paid} | ${concept} | ${payment.currency} ${amountNum} | → cuenta ${accountId}`)
      created++
      continue
    }

    // Create ledger_movement
    const { data: lm, error: lmError } = await supabase
      .from("ledger_movements")
      .insert({
        operation_id: payment.operation_id || null,
        lead_id: null,
        type: ledgerType,
        concept,
        currency: payment.currency,
        amount_original: amountNum,
        exchange_rate: exchangeRate,
        amount_ars_equivalent: amountArs,
        method: ledgerMethod,
        account_id: accountId,
        seller_id: operation?.seller_id || null,
        operator_id: operation?.operator_id || null,
        receipt_number: payment.reference || null,
        notes: `Migrado desde pago histórico ${payment.id}`,
        created_by: null,
        movement_date: new Date(payment.date_paid!).toISOString(),
      })
      .select("id")
      .single()

    if (lmError) {
      console.error(`  ❌ Error creando ledger para pago ${payment.id}:`, lmError.message)
      errors++
      continue
    }

    // Update payment with ledger_movement_id
    await supabase
      .from("payments")
      .update({ ledger_movement_id: lm.id })
      .eq("id", payment.id)

    console.log(`  ✅ ${payment.date_paid} | ${concept} | ${payment.currency} ${amountNum} → ledger ${lm.id}`)
    created++
  }

  console.log(`\n🎉 Sincronización completada:`)
  console.log(`  ✅ Creados: ${created}`)
  console.log(`  ⏭️ Omitidos: ${skipped}`)
  console.log(`  ❌ Errores: ${errors}`)
}

syncHistoricalToLedger().catch(console.error)
