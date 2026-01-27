/**
 * Test completo del sistema (E2E).
 * Solo corre si ALLOW_TEST_E2E=1 y existe SUPABASE_SERVICE_ROLE_KEY.
 * Flujo: lead → operación → cliente → pago cliente (mark paid) → pago operador → verificar saldos.
 */

import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import {
  createLedgerMovement,
  calculateARSEquivalent,
  getMainPassengerName,
  validateSufficientBalance,
  invalidateBalanceCache,
} from "@/lib/accounting/ledger"
import { createOperatorPayment, markOperatorPaymentAsPaid } from "@/lib/accounting/operator-payments"
import { generateFileCodeFromTimestamp } from "@/lib/accounting/file-code"
import { roundMoney } from "@/lib/currency"

const STEP = (name: string, ok: boolean, err?: string) => ({ name, ok, error: err ?? null })

export async function GET() {
  const steps: { name: string; ok: boolean; error: string | null }[] = []
  let supabase: any = null

  if (process.env.ALLOW_TEST_E2E !== "1" || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { success: false, error: "ALLOW_TEST_E2E=1 y SUPABASE_SERVICE_ROLE_KEY requeridos" },
      { status: 403 }
    )
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  try {
    supabase = createClient(url, key) as any
  } catch (e: any) {
    return NextResponse.json({ success: false, steps, error: `Supabase client: ${e?.message}` }, { status: 500 })
  }

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

  try {
    const { data: user } = await supabase.from("users").select("id").in("role", ["SUPER_ADMIN", "ADMIN"]).eq("is_active", true).limit(1).maybeSingle()
    if (!user?.id) {
      steps.push(STEP("1. Usuario ADMIN/SUPER_ADMIN", false, "No hay usuario activo"))
      return NextResponse.json({ success: false, steps }, { status: 200 })
    }
    userId = user.id
    steps.push(STEP("1. Usuario ADMIN/SUPER_ADMIN", true))

    const { data: agency } = await supabase.from("agencies").select("id").limit(1).maybeSingle()
    if (!agency?.id) {
      steps.push(STEP("2. Agencia", false, "No hay agencia"))
      return NextResponse.json({ success: false, steps }, { status: 200 })
    }
    agencyId = agency.id
    steps.push(STEP("2. Agencia", true))

    const { data: operator } = await supabase.from("operators").select("id").limit(1).maybeSingle()
    if (!operator?.id) {
      steps.push(STEP("3. Operador", false, "No hay operador"))
      return NextResponse.json({ success: false, steps }, { status: 200 })
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
      return NextResponse.json({ success: false, steps }, { status: 200 })
    }
    leadId = lead.id
    steps.push(STEP("4. Crear lead", true))

    const dep = new Date()
    dep.setDate(dep.getDate() + 30)
    const departureDate = dep.toISOString().split("T")[0]
    const fileCode = generateFileCodeFromTimestamp()
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
      return NextResponse.json({ success: false, steps }, { status: 200 })
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
      return NextResponse.json({ success: false, steps }, { status: 200 })
    }
    customerId = cust.id
    await (supabase.from("operation_customers") as any).insert({
      operation_id: operationId,
      customer_id: customerId,
      role: "MAIN",
    })
    steps.push(STEP("6. Crear cliente y vincular a operación", true))

    const dateDue = new Date().toISOString().split("T")[0]
    const { data: pay, error: payErr } = await (supabase.from("payments") as any).insert({
      operation_id: operationId,
      payer_type: "CUSTOMER",
      direction: "INCOME",
      method: "TRANSFER",
      amount: incomeAmount,
      currency: "ARS",
      date_due: dateDue,
      status: "PENDING",
    }).select("id").single()
    if (payErr || !pay?.id) {
      steps.push(STEP("7. Crear pago cliente (PENDING)", false, (payErr as any)?.message))
      return NextResponse.json({ success: false, steps }, { status: 200 })
    }
    paymentId = pay.id
    steps.push(STEP("7. Crear pago cliente (PENDING)", true))

    const { data: fa } = await (supabase.from("financial_accounts") as any)
      .select("id, currency, type")
      .eq("is_active", true)
      .limit(100)
    const exclude = (fa || []).filter(
      (a: any) => a.type && !["ACCOUNTS_RECEIVABLE", "ACCOUNTS_PAYABLE"].includes(String(a.type))
    )
    const account = exclude.find((a: any) => a.currency === "ARS") || exclude.find((a: any) => a.currency === "USD") || exclude[0]
    if (!account?.id) {
      steps.push(STEP("8. Cuenta financiera ARS", false, "No hay cuenta usable. Creá una en Contabilidad > Cuentas Financieras."))
      return NextResponse.json({ success: false, steps }, { status: 200 })
    }
    financialAccountId = account.id
    steps.push(STEP("8. Cuenta financiera ARS", true))

    if (!financialAccountId) {
      steps.push(STEP("Error: financialAccountId es null", false, 0, "No se pudo obtener cuenta financiera"))
      return NextResponse.json({ success: false, steps }, { status: 200 })
    }

    const { getAccountBalance } = await import("@/lib/accounting/ledger")
    balanceBeforeIncome = await getAccountBalance(financialAccountId!, supabase)
    invalidateBalanceCache(financialAccountId!)

    const passengerName = await getMainPassengerName(operationId, supabase)
    const opCode = operationId!.slice(0, 8)
    const concept = passengerName ? `${passengerName} (${opCode})` : `Pago de cliente - Op. ${opCode}`
    const amountARS = calculateARSEquivalent(incomeAmount, "ARS")
    const { id: lmId } = await createLedgerMovement(
      {
        operation_id: operationId,
        lead_id: null,
        type: "INCOME",
        concept,
        currency: "ARS",
        amount_original: roundMoney(incomeAmount),
        exchange_rate: null,
        amount_ars_equivalent: roundMoney(amountARS),
        method: "BANK",
        account_id: financialAccountId!,
        seller_id: userId,
        operator_id: operatorId,
        receipt_number: null,
        notes: "Test E2E",
        created_by: userId,
      },
      supabase
    )
    await (supabase.from("payments") as any).update({
      status: "PAID",
      date_paid: new Date().toISOString().split("T")[0],
      ledger_movement_id: lmId,
      updated_at: new Date().toISOString(),
    }).eq("id", paymentId)
    balanceAfterIncome = await getAccountBalance(financialAccountId!, supabase)
    const incomeOk = balanceAfterIncome >= balanceBeforeIncome + incomeAmount - 0.01 && balanceAfterIncome <= balanceBeforeIncome + incomeAmount + 0.01
    steps.push(STEP("9. Marcar pago cliente (PAID) y crear ledger INCOME", incomeOk, incomeOk ? null : `Balance antes ${balanceBeforeIncome} después ${balanceAfterIncome}, esperado +${incomeAmount}`))

    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + 14)
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

    const balanceCheck = await validateSufficientBalance(financialAccountId!, expenseAmount, "ARS", supabase)
    if (!balanceCheck.valid) {
      steps.push(STEP("11. Saldo suficiente para pagar operador", false, balanceCheck.error ?? "Saldo insuficiente"))
      return NextResponse.json({ success: false, steps }, { status: 200 })
    }
    steps.push(STEP("11. Saldo suficiente para pagar operador", true))

    const conceptExp = passengerName ? `Pago a operador - ${passengerName} (${opCode})` : `Pago a operador - Op. ${opCode}`
    const { id: lmExpId } = await createLedgerMovement(
      {
        operation_id: operationId,
        lead_id: null,
        type: "EXPENSE",
        concept: conceptExp,
        currency: "ARS",
        amount_original: roundMoney(expenseAmount),
        exchange_rate: null,
        amount_ars_equivalent: roundMoney(expenseAmount),
        method: "BANK",
        account_id: financialAccountId!,
        seller_id: userId,
        operator_id: operatorId,
        receipt_number: "TEST-E2E",
        notes: "Test E2E",
        created_by: userId,
      },
      supabase
    )
    await markOperatorPaymentAsPaid(supabase, operatorPaymentId!, lmExpId)
    await (supabase.from("operator_payments") as any).update({ paid_amount: expenseAmount, updated_at: new Date().toISOString() }).eq("id", operatorPaymentId)
    balanceAfterExpense = await getAccountBalance(financialAccountId!, supabase)
    const expenseOk = balanceAfterExpense >= balanceAfterIncome - expenseAmount - 0.01 && balanceAfterExpense <= balanceAfterIncome - expenseAmount + 0.01
    steps.push(STEP("12. Pagar operador y crear ledger EXPENSE", expenseOk, expenseOk ? null : `Balance después ingreso ${balanceAfterIncome}, después egreso ${balanceAfterExpense}, esperado -${expenseAmount}`))

    steps.push(STEP("13. Saldos suben con ingreso y bajan con egreso", incomeOk && expenseOk))
  } catch (e: any) {
    steps.push(STEP("Error inesperado", false, e?.message ?? String(e)))
  }

  const success = steps.every((s) => s.ok)
  return NextResponse.json({
    success,
    steps,
    summary: {
      balanceBeforeIncome,
      balanceAfterIncome,
      balanceAfterExpense,
      incomeAmount,
      expenseAmount,
    },
  })
}
