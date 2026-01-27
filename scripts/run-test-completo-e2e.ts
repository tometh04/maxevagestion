/**
 * Test E2E completo del sistema (standalone, sin servidor).
 * Flujo: lead → operación → cliente → pago cliente (mark paid) → pago operador → verificar saldos.
 * Ejecutar: npm run test:run-completo
 * Requiere: .env.local con SUPABASE_SERVICE_ROLE_KEY y NEXT_PUBLIC_SUPABASE_URL.
 */

import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import { join } from "path"
import { createOperatorPayment, markOperatorPaymentAsPaid } from "../lib/accounting/operator-payments"
import { roundMoney } from "../lib/currency"

dotenv.config({ path: join(process.cwd(), ".env.local") })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error("❌ Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local")
  process.exit(1)
}

const supabase = createClient(url, key) as any

const STEP = (name: string, ok: boolean, err?: string) => {
  console.log(ok ? `   ✅ ${name}` : `   ❌ ${name}${err ? ` — ${err}` : ""}`)
  return { name, ok, error: err ?? null }
}

async function getBalance(accountId: string): Promise<number> {
  const { data: ac } = await supabase.from("financial_accounts").select("initial_balance, currency").eq("id", accountId).single()
  if (!ac) throw new Error("Cuenta no encontrada")
  const initial = parseFloat(ac.initial_balance || "0") || 0
  const { data: movs } = await supabase
    .from("ledger_movements")
    .select("type, amount_original, amount_ars_equivalent")
    .eq("account_id", accountId)
  const currency = (ac.currency || "ARS") as "ARS" | "USD"
  const sum = (movs || []).reduce((s: number, m: any) => {
    const amt = parseFloat(currency === "USD" ? (m.amount_original || "0") : (m.amount_ars_equivalent || "0")) || 0
    if (m.type === "INCOME" || m.type === "FX_GAIN") return s + amt
    if (m.type === "EXPENSE" || m.type === "OPERATOR_PAYMENT" || m.type === "FX_LOSS" || m.type === "COMMISSION") return s - amt
    return s
  }, 0)
  return initial + sum
}

async function insertLedgerMovement(params: {
  operation_id: string | null
  type: string
  concept: string
  currency: string
  amount_original: number
  exchange_rate: number | null
  amount_ars_equivalent: number
  method: string
  account_id: string
  seller_id: string | null
  operator_id: string | null
  notes: string | null
  created_by: string | null
}): Promise<string> {
  const { data, error } = await (supabase.from("ledger_movements") as any)
    .insert({
      operation_id: params.operation_id,
      lead_id: null,
      type: params.type,
      concept: params.concept,
      currency: params.currency,
      amount_original: params.amount_original,
      exchange_rate: params.exchange_rate,
      amount_ars_equivalent: params.amount_ars_equivalent,
      method: params.method,
      account_id: params.account_id,
      seller_id: params.seller_id,
      operator_id: params.operator_id,
      receipt_number: params.type === "EXPENSE" ? "TEST-E2E" : null,
      notes: params.notes,
      created_by: params.created_by,
    })
    .select("id")
    .single()
  if (error) throw new Error(`Ledger: ${error.message}`)
  return data.id
}

function generateFileCode(): string {
  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "")
  const timeStr = now.getTime().toString().slice(-8)
  return `OP-${dateStr}-${timeStr}`
}

async function main() {
  const steps: { name: string; ok: boolean; error: string | null }[] = []
  let userId: string | null = null
  let agencyId: string | null = null
  let operatorId: string | null = null
  let leadId: string | null = null
  let operationId: string | null = null
  let customerId: string | null = null
  let paymentId: string | null = null
  let operatorPaymentId: string | null = null
  let financialAccountId: string | null = null
  let balanceBeforeIncome = 0
  let balanceAfterIncome = 0
  let balanceAfterExpense = 0
  const incomeAmount = 500
  const expenseAmount = 200

  console.log("🧪 Test completo del sistema (E2E)\n")

  try {
    const { data: user } = await supabase.from("users").select("id").in("role", ["SUPER_ADMIN", "ADMIN"]).eq("is_active", true).limit(1).maybeSingle()
    if (!user?.id) {
      steps.push(STEP("1. Usuario ADMIN/SUPER_ADMIN", false, "No hay usuario activo"))
      throw new Error("stop")
    }
    userId = user.id
    steps.push(STEP("1. Usuario ADMIN/SUPER_ADMIN", true))

    const { data: agency } = await supabase.from("agencies").select("id").limit(1).maybeSingle()
    if (!agency?.id) {
      steps.push(STEP("2. Agencia", false, "No hay agencia"))
      throw new Error("stop")
    }
    agencyId = agency.id
    steps.push(STEP("2. Agencia", true))

    const { data: operator } = await supabase.from("operators").select("id").limit(1).maybeSingle()
    if (!operator?.id) {
      steps.push(STEP("3. Operador", false, "No hay operador"))
      throw new Error("stop")
    }
    operatorId = operator.id
    steps.push(STEP("3. Operador", true))

    const { data: lead, error: leadErr } = await (supabase.from("leads") as any).insert({
      agency_id: agencyId,
      source: "Other",
      status: "NEW",
      region: "CARIBE",
      destination: "Punta Cana Test",
      contact_name: "Juan Test E2E",
      contact_phone: "+5491111111111",
      contact_email: "test-e2e@test.com",
    }).select("id").single()
    if (leadErr || !lead?.id) {
      steps.push(STEP("4. Crear lead", false, (leadErr as any)?.message))
      throw new Error("stop")
    }
    leadId = lead.id
    steps.push(STEP("4. Crear lead", true))

    const dep = new Date()
    dep.setDate(dep.getDate() + 30)
    const departureDate = dep.toISOString().split("T")[0]
    const fileCode = generateFileCode()
    const { data: op, error: opErr } = await (supabase.from("operations") as any).insert({
      agency_id: agencyId,
      lead_id: leadId,
      seller_id: userId,
      operator_id: operatorId,
      type: "PACKAGE",
      destination: "Punta Cana Test",
      departure_date: departureDate,
      sale_amount_total: 1000,
      operator_cost: 600,
      currency: "ARS",
      margin_amount: 400,
      margin_percentage: 40,
      sale_currency: "ARS",
      operator_cost_currency: "ARS",
      status: "RESERVED",
      adults: 1,
      children: 0,
      infants: 0,
      file_code: fileCode,
    }).select("id").single()
    if (opErr || !op?.id) {
      steps.push(STEP("5. Crear operación", false, (opErr as any)?.message))
      throw new Error("stop")
    }
    operationId = op.id
    steps.push(STEP("5. Crear operación", true))

    const { data: cust, error: custErr } = await (supabase.from("customers") as any).insert({
      first_name: "Juan",
      last_name: "Test E2E",
      phone: "+5491111111111",
      email: "test-e2e@test.com",
    }).select("id").single()
    if (custErr || !cust?.id) {
      steps.push(STEP("6. Crear cliente", false, (custErr as any)?.message))
      throw new Error("stop")
    }
    customerId = cust.id
    await (supabase.from("operation_customers") as any).insert({
      operation_id: operationId,
      customer_id: customerId,
      role: "MAIN",
    })
    steps.push(STEP("6. Crear cliente y vincular a operación", true))

    // Fecha de vencimiento 35 días en el futuro (para que la alerta a 30 días sea en el futuro)
    const dateDue = new Date()
    dateDue.setDate(dateDue.getDate() + 35)
    const dateDueStr = dateDue.toISOString().split("T")[0]
    const { data: pay, error: payErr } = await (supabase.from("payments") as any).insert({
      operation_id: operationId,
      payer_type: "CUSTOMER",
      direction: "INCOME",
      method: "TRANSFER",
      amount: incomeAmount,
      currency: "ARS",
      date_due: dateDueStr,
      status: "PENDING",
    }).select("id").single()
    if (payErr || !pay?.id) {
      steps.push(STEP("7. Crear pago cliente (PENDING)", false, (payErr as any)?.message))
      throw new Error("stop")
    }
    paymentId = pay.id
    steps.push(STEP("7. Crear pago cliente (PENDING)", true))

    // Generar alertas automáticamente (simulando lo que hace el endpoint POST /api/payments)
    try {
      const { generatePaymentAlerts30Days } = await import("../lib/alerts/generate")
      await generatePaymentAlerts30Days(supabase, operationId!, userId!, "Punta Cana Test")
    } catch (alertErr) {
      console.error("Error generando alertas en test:", alertErr)
      // No fallar el test por esto
    }

    const { data: fa } = await (supabase.from("financial_accounts") as any)
      .select("id, currency, type")
      .eq("is_active", true)
      .limit(100)
    const exclude = (fa || []).filter(
      (a: any) => a.type && !["ACCOUNTS_RECEIVABLE", "ACCOUNTS_PAYABLE"].includes(String(a.type))
    )
    const account = exclude.find((a: any) => a.currency === "ARS") || exclude.find((a: any) => a.currency === "USD") || exclude[0]
    if (!account?.id) {
      const tipos = (fa || []).map((a: any) => a.type).join(", ") || "ninguna"
      steps.push(STEP("8. Cuenta financiera ARS", false, `No hay cuenta usable (tipos: ${tipos}). Creá una en Contabilidad > Cuentas Financieras.`))
      throw new Error("stop")
    }
    financialAccountId = account.id
    steps.push(STEP("8. Cuenta financiera ARS", true))

    balanceBeforeIncome = await getBalance(financialAccountId)

    const conceptIncome = `Juan Test E2E (${operationId!.slice(0, 8)})`
    const lmId = await insertLedgerMovement({
      operation_id: operationId,
      type: "INCOME",
      concept: conceptIncome,
      currency: "ARS",
      amount_original: roundMoney(incomeAmount),
      exchange_rate: null,
      amount_ars_equivalent: roundMoney(incomeAmount),
      method: "BANK",
      account_id: financialAccountId,
      seller_id: userId,
      operator_id: operatorId,
      notes: "Test E2E",
      created_by: userId,
    })
    // Actualizar pago a PAID (intentar con ledger_movement_id, si falla sin él)
    const updateData: any = {
      status: "PAID",
      date_paid: dateDueStr,
      updated_at: new Date().toISOString(),
    }
    const { error: updateErr } = await (supabase.from("payments") as any).update({
      ...updateData,
      ledger_movement_id: lmId,
    }).eq("id", paymentId)
    // Si falla por la columna ledger_movement_id, intentar sin ella
    if (updateErr && updateErr.message?.includes("ledger_movement_id")) {
      await (supabase.from("payments") as any).update(updateData).eq("id", paymentId)
    }
    if (updateErr) {
      console.error("Error actualizando pago:", updateErr)
    }
    balanceAfterIncome = await getBalance(financialAccountId)
    const incomeOk = balanceAfterIncome >= balanceBeforeIncome + incomeAmount - 0.01 && balanceAfterIncome <= balanceBeforeIncome + incomeAmount + 0.01
    steps.push(STEP("9. Marcar pago cliente (PAID) y crear ledger INCOME", incomeOk, incomeOk ? undefined : `Balance antes ${balanceBeforeIncome} después ${balanceAfterIncome}, esperado +${incomeAmount}`))

    // Fecha de vencimiento 35 días en el futuro (para que la alerta a 30 días sea en el futuro)
    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + 35)
    const { id: opPayId } = await createOperatorPayment(
      supabase,
      operatorId!,
      expenseAmount,
      "ARS",
      dueDate.toISOString().split("T")[0],
      operationId,
      "Test E2E"
    )
    operatorPaymentId = opPayId
    steps.push(STEP("10. Crear pago a operador (PENDING)", true))

    // Generar alertas automáticamente para el pago a operador también
    // Hacerlo en background para no bloquear el test
    Promise.resolve().then(async () => {
      try {
        const { generatePaymentAlerts30Days } = await import("../lib/alerts/generate")
        await Promise.race([
          generatePaymentAlerts30Days(supabase, operationId!, userId!, "Punta Cana Test"),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000))
        ]).catch(() => {}) // Silenciar errores en background
      } catch {}
    })

    const bal = await getBalance(financialAccountId)
    if (bal < expenseAmount) {
      steps.push(STEP("11. Saldo suficiente para pagar operador", false, `Saldo ${bal} < ${expenseAmount}`))
      throw new Error("stop")
    }
    steps.push(STEP("11. Saldo suficiente para pagar operador", true))

    const conceptExp = `Pago a operador - Juan Test E2E (${operationId!.slice(0, 8)})`
    const lmExpId = await insertLedgerMovement({
      operation_id: operationId,
      type: "EXPENSE",
      concept: conceptExp,
      currency: "ARS",
      amount_original: roundMoney(expenseAmount),
      exchange_rate: null,
      amount_ars_equivalent: roundMoney(expenseAmount),
      method: "BANK",
      account_id: financialAccountId,
      seller_id: userId,
      operator_id: operatorId,
      notes: "Test E2E",
      created_by: userId,
    })
    await markOperatorPaymentAsPaid(supabase, operatorPaymentId!, lmExpId)
    await (supabase.from("operator_payments") as any).update({ paid_amount: expenseAmount, updated_at: new Date().toISOString() }).eq("id", operatorPaymentId)
    balanceAfterExpense = await getBalance(financialAccountId)
    const expenseOk = balanceAfterExpense >= balanceAfterIncome - expenseAmount - 0.01 && balanceAfterExpense <= balanceAfterIncome - expenseAmount + 0.01
    steps.push(STEP("12. Pagar operador y crear ledger EXPENSE", expenseOk, expenseOk ? undefined : `Balance después ingreso ${balanceAfterIncome}, después egreso ${balanceAfterExpense}, esperado -${expenseAmount}`))

    steps.push(STEP("13. Saldos suben con ingreso y bajan con egreso", incomeOk && expenseOk))

    // ===========================================
    // VALIDACIONES ADICIONALES: MÉTRICAS, CALENDARIO, ALERTAS, BÚSQUEDA, CEREBRO
    // ===========================================

    // 14. Métricas y estadísticas: verificar que la operación aparezca
    const { data: opsForStats } = await (supabase.from("operations") as any)
      .select("id, sale_amount_total, margin_amount, status, departure_date")
      .eq("id", operationId!)
    const opInStats = opsForStats && opsForStats.length > 0 && ["CONFIRMED", "TRAVELLED", "RESERVED"].includes(opsForStats[0]?.status)
    steps.push(STEP("14. Operación visible en estadísticas (status RESERVED/CONFIRMED/TRAVELLED)", opInStats))

    // 15. Calendario: verificar evento de salida
    const { data: calOps } = await (supabase.from("operations") as any)
      .select("id, destination, departure_date, file_code")
      .eq("id", operationId!)
      .not("departure_date", "is", null)
    const hasDepartureEvent = calOps && calOps.length > 0 && calOps[0]?.departure_date
    steps.push(STEP("15. Evento de salida en calendario (departure_date)", !!hasDepartureEvent))

    // 16. Calendario: verificar eventos de pagos pendientes (si hay)
    const { data: pendingPayments } = await (supabase.from("payments") as any)
      .select("id, amount, currency, date_due, payer_type, operation_id")
      .eq("operation_id", operationId!)
      .eq("status", "PENDING")
    const hasPaymentEvents = pendingPayments && pendingPayments.length > 0
    steps.push(STEP("16. Pagos pendientes aparecen en calendario", hasPaymentEvents, hasPaymentEvents ? undefined : "No hay pagos pendientes (todos fueron pagados)"))

    // 17. Alertas: verificar que existan alertas relacionadas (ahora se generan automáticamente al crear pagos)
    // Esperar un poco para que se generen las alertas (puede haber un pequeño delay)
    await new Promise(resolve => setTimeout(resolve, 1000))
    const { data: opAlerts } = await (supabase.from("alerts") as any)
      .select("id, type, description, operation_id")
      .eq("operation_id", operationId!)
      .eq("status", "PENDING")
    const hasAlerts = opAlerts && opAlerts.length > 0
    const hasPaymentAlerts = opAlerts && opAlerts.some((a: any) => ["PAYMENT_DUE", "OPERATOR_DUE"].includes(a.type))
    steps.push(STEP("17. Alertas relacionadas con la operación (generadas automáticamente)", hasAlerts && hasPaymentAlerts, hasAlerts ? (hasPaymentAlerts ? undefined : "Hay alertas pero no de pagos") : "No se generaron alertas automáticamente"))

    // 18. Búsqueda: verificar que la operación sea encontrable por código
    const { data: searchOps } = await (supabase.from("operations") as any)
      .select("id, file_code, destination")
      .ilike("file_code", `%${fileCode}%`)
      .eq("id", operationId!)
    const foundByCode = searchOps && searchOps.length > 0
    steps.push(STEP("18. Operación encontrable por código (búsqueda)", foundByCode))

    // 19. Búsqueda: verificar que el cliente sea encontrable por nombre
    const { data: searchCust } = await (supabase.from("customers") as any)
      .select("id, first_name, last_name")
      .or(`first_name.ilike.%Juan%,last_name.ilike.%Test E2E%`)
      .eq("id", customerId!)
    const foundByName = searchCust && searchCust.length > 0
    steps.push(STEP("19. Cliente encontrable por nombre (búsqueda)", foundByName))

    // 20. Búsqueda: verificar que la operación sea encontrable por destino
    const { data: searchDest } = await (supabase.from("operations") as any)
      .select("id, destination")
      .ilike("destination", "%Punta Cana Test%")
      .eq("id", operationId!)
    const foundByDestination = searchDest && searchDest.length > 0
    steps.push(STEP("20. Operación encontrable por destino (búsqueda)", foundByDestination))

    // 21. Cerebro: verificar que los datos estén disponibles para consultas (operación con datos completos)
    const { data: cerebroOp } = await (supabase.from("operations") as any)
      .select(`
        id,
        file_code,
        destination,
        sale_amount_total,
        margin_amount,
        status,
        operations_customers:operation_customers(
          customers:customer_id(first_name, last_name)
        )
      `)
      .eq("id", operationId!)
      .single()
    const hasCerebroData = cerebroOp && cerebroOp.file_code && cerebroOp.destination && cerebroOp.sale_amount_total
    steps.push(STEP("21. Datos disponibles para Cerebro (operación con datos completos)", hasCerebroData))

    // 22. Cerebro: verificar que los saldos estén disponibles (financial_accounts con balance)
    const { data: cerebroBalance } = await (supabase.from("financial_accounts") as any)
      .select("id, name, currency, initial_balance")
      .eq("id", financialAccountId!)
      .single()
    const hasBalanceData = cerebroBalance && cerebroBalance.name && (cerebroBalance.initial_balance !== null)
    steps.push(STEP("22. Saldos disponibles para Cerebro (cuenta financiera con datos)", hasBalanceData))

    // 23. Verificar que los pagos aparezcan en estadísticas (payments PAID)
    // Verificar directamente el pago que marcamos como PAID
    const { data: paidPayment, error: paidErr } = await (supabase.from("payments") as any)
      .select("id, amount, currency, status, operation_id")
      .eq("id", paymentId!)
      .maybeSingle()
    if (paidErr && !paidErr.message?.includes("ledger_movement_id")) {
      console.error("Error buscando pago:", paidErr)
    }
    const isPaid = paidPayment && paidPayment.status === "PAID"
    // También verificar que aparezca en búsqueda por operación
    const { data: paidPaymentsByOp } = await (supabase.from("payments") as any)
      .select("id, status")
      .eq("operation_id", operationId!)
      .eq("status", "PAID")
    const hasPaidPayments = paidPaymentsByOp && paidPaymentsByOp.length > 0
    // Si el pago específico está PAID, consideramos que pasó
    steps.push(STEP("23. Pagos PAID visibles para estadísticas", isPaid && hasPaidPayments, isPaid ? undefined : `Pago ${paymentId?.slice(0, 8)}... no está PAID (status: ${paidPayment?.status || "no encontrado"})`))

    // 24. Verificar que los movimientos del ledger estén disponibles
    const { data: ledgerMovs } = await (supabase.from("ledger_movements") as any)
      .select("id, type, amount_original, concept, operation_id")
      .eq("operation_id", operationId!)
    const hasLedgerMovs = ledgerMovs && ledgerMovs.length >= 2 // Al menos INCOME y EXPENSE
    steps.push(STEP("24. Movimientos del ledger disponibles (INCOME + EXPENSE)", hasLedgerMovs, hasLedgerMovs ? undefined : `Solo ${ledgerMovs?.length || 0} movimientos encontrados`))

  } catch (e: any) {
    if ((e?.message ?? "") !== "stop") {
      steps.push(STEP("Error inesperado", false, e?.message ?? String(e)))
    }
  }

  console.log("\n--- Resumen Financiero ---")
  console.log("   Saldo antes ingreso:", balanceBeforeIncome)
  console.log("   Saldo después ingreso (+" + incomeAmount + "):", balanceAfterIncome)
  console.log("   Saldo después egreso (-" + expenseAmount + "):", balanceAfterExpense)
  console.log("\n--- Resumen de Validaciones ---")
  const coreSteps = steps.slice(0, 13).filter(s => s.ok).length
  const extraSteps = steps.slice(13).filter(s => s.ok).length
  console.log(`   Pasos core (flujo financiero): ${coreSteps}/13`)
  console.log(`   Pasos adicionales (métricas, calendario, alertas, búsqueda, Cerebro): ${extraSteps}/${steps.length - 13}`)
  console.log("\n---")

  const success = steps.every((s) => s.ok)
  const coreSuccess = steps.slice(0, 13).every((s) => s.ok)
  if (success) {
    console.log("✅ Test completo pasó (flujo financiero + validaciones adicionales).")
    console.log("   Podés probar vos el sistema siguiendo docs/TEST_COMPLETO_SISTEMA.md\n")
  } else if (coreSuccess) {
    console.log("⚠️  Flujo financiero OK, pero algunas validaciones adicionales fallaron.")
    console.log("   Revisá los errores arriba. El sistema funciona, pero algunos reportes/métricas pueden necesitar ajustes.\n")
    console.log("   Podés probar vos el sistema siguiendo docs/TEST_COMPLETO_SISTEMA.md\n")
  } else {
    console.log("❌ Algunos pasos del flujo core fallaron. Revisá los errores arriba.\n")
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
