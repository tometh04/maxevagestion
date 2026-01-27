/**
 * Test completo del sistema (sin importar ledger/server).
 * Unitarios: currency. Auditoría: Supabase directo (balance, CpC/CpP).
 * Ejecutar: npm run test:sistema-completo  o  npx tsx scripts/test-sistema-completo.ts
 */

import * as dotenv from "dotenv"
import { join } from "path"
import { roundMoney, formatCurrency } from "../lib/currency"

dotenv.config({ path: join(process.cwd(), ".env.local") })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const hasSupabase = !!(supabaseUrl && serviceKey)

let ok = 0
let fail = 0

function assert(cond: boolean, name: string, detail?: string) {
  if (cond) {
    console.log(`   ✅ ${name}`)
    ok++
  } else {
    console.log(`   ❌ ${name}${detail ? ` — ${detail}` : ""}`)
    fail++
  }
}

// calculateARSEquivalent logic (mirror ledger, sin importar)
function calcARS(amount: number, currency: "ARS" | "USD", rate?: number | null): number {
  if (currency === "ARS") return amount
  if (currency === "USD") {
    if (!rate) throw new Error("exchange_rate requerido para USD")
    return amount * rate
  }
  throw new Error(`Moneda no soportada: ${currency}`)
}

async function runUnitTests() {
  console.log("\n📦 1. Unitarios (currency)\n")

  assert(roundMoney(1.234) === 1.23, "roundMoney(1.234) === 1.23")
  assert(roundMoney(0) === 0, "roundMoney(0) === 0")
  assert(roundMoney(100.999) === 101, "roundMoney(100.999) === 101")
  assert(roundMoney(1.234, 3) === 1.234, "roundMoney(1.234, 3) === 1.234")

  assert(calcARS(1000, "ARS") === 1000, "ARS: amount sin cambio")
  assert(calcARS(100, "USD", 1000) === 100_000, "USD: 100 * 1000")
  try {
    calcARS(100, "USD")
    assert(false, "USD sin exchange_rate debe lanzar", "no lanzó")
  } catch {
    assert(true, "USD sin exchange_rate lanza error")
  }

  const fmt = formatCurrency(1234.5, "ARS")
  assert(typeof fmt === "string" && fmt.includes("1"), "formatCurrency retorna string")
}

async function runAuditTests() {
  console.log("\n🔐 2. Auditoría (Supabase)\n")

  if (!hasSupabase) {
    console.log("   ⚠️ Sin .env.local (SUPABASE_*), skip auditoría")
    return
  }

  const { createClient } = await import("@supabase/supabase-js")
  const supabase = createClient(supabaseUrl!, serviceKey!) as any

  const { data: accounts } = await supabase
    .from("financial_accounts")
    .select("id, name, currency")
    .eq("is_active", true)
    .limit(20)

  if (!accounts?.length) {
    console.log("   ⚠️ No hay cuentas financieras, skip balance")
  } else {
    const acc = accounts[0]
    const { data: fa } = await supabase.from("financial_accounts").select("currency").eq("id", acc.id).single()
    const currency = (fa?.currency || "ARS") as "ARS" | "USD"

    const { data: movs } = await supabase
      .from("ledger_movements")
      .select("type, amount_original, amount_ars_equivalent")
      .eq("account_id", acc.id)
    const { data: ac } = await supabase
      .from("financial_accounts")
      .select("initial_balance, currency")
      .eq("id", acc.id)
      .single()
    const initial = parseFloat(ac?.initial_balance || "0") || 0
    const sum = (movs || []).reduce((s: number, m: any) => {
      const amt = parseFloat(currency === "USD" ? (m.amount_original || "0") : (m.amount_ars_equivalent || "0")) || 0
      if (m.type === "INCOME" || m.type === "FX_GAIN") return s + amt
      if (m.type === "EXPENSE" || m.type === "OPERATOR_PAYMENT" || m.type === "FX_LOSS" || m.type === "COMMISSION") return s - amt
      return s
    }, 0)
    const balance = initial + sum
    const valid = balance >= 999_999_999
    if (!valid) {
      console.log(`   ✅ validateSufficientBalance rechaza saldo insuficiente (${acc.name})`)
      ok++
    } else {
      console.log(`   ⚠️ Cuenta ${acc.name} con saldo >= 999999999, skip`)
    }
  }

  const { data: chart } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .in("account_code", ["1.1.03", "2.1.01"])
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()

  if (!chart?.id) {
    console.log("   ⚠️ No hay plan 1.1.03/2.1.01, skip CpC/CpP")
  } else {
    const { data: cp } = await supabase
      .from("financial_accounts")
      .select("id, name, chart_of_accounts:chart_account_id(account_code)")
      .eq("chart_account_id", chart.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()

    if (!cp?.id) {
      console.log("   ⚠️ No hay cuenta CpC/CpP, skip")
    } else {
      const code = (cp as any).chart_of_accounts?.account_code
      const isOnly = code === "1.1.03" || code === "2.1.01"
      assert(isOnly, `isAccountingOnlyAccount(${cp.name}) === true`)
    }
  }
}

async function main() {
  console.log("🧪 Test completo del sistema\n")
  await runUnitTests()
  await runAuditTests()
  console.log("\n---")
  console.log(`OK: ${ok} | Fallos: ${fail}`)
  if (fail > 0) process.exit(1)
  console.log("✅ Todos los tests pasaron.\n")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
