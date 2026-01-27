/**
 * Script opcional para validar fixes de auditoría (saldo, CpC/CpP, roundMoney).
 * Ejecutar: npx tsx scripts/test-audit-fixes.ts
 * Requiere: .env.local con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import { join } from "path"
import {
  validateSufficientBalance,
  isAccountingOnlyAccount,
} from "../lib/accounting/ledger"
import { roundMoney } from "../lib/currency"

dotenv.config({ path: join(process.cwd(), ".env.local") })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !serviceKey) {
  console.error("❌ Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceKey) as any

async function main() {
  let ok = 0
  let fail = 0

  console.log("🧪 Test audit fixes\n")

  // 1. roundMoney
  console.log("1. roundMoney")
  const r = roundMoney(1.234)
  if (r === 1.23) {
    console.log("   ✅ roundMoney(1.234) === 1.23")
    ok++
  } else {
    console.log(`   ❌ roundMoney(1.234) === ${r}, esperado 1.23`)
    fail++
  }

  // 2. validateSufficientBalance – debe rechazar cuando no hay saldo
  console.log("\n2. validateSufficientBalance (saldo insuficiente)")
  const { data: accounts } = await supabase
    .from("financial_accounts")
    .select("id, name, currency")
    .eq("is_active", true)
    .limit(20)

  if (!accounts?.length) {
    console.log("   ⚠️ No hay cuentas financieras, skip")
  } else {
    const account = accounts[0]
    const check = await validateSufficientBalance(
      account.id,
      999_999_999,
      (account.currency || "ARS") as "ARS" | "USD",
      supabase
    )
    if (!check.valid) {
      console.log(`   ✅ Rechazado (saldo insuficiente): ${check.error?.slice(0, 60)}...`)
      ok++
    } else {
      console.log(`   ⚠️ Cuenta ${account.name} tiene saldo >= 999999999, no se pudo probar rechazo`)
    }
  }

  // 3. isAccountingOnlyAccount – CpC/CpP
  console.log("\n3. isAccountingOnlyAccount (CpC/CpP)")
  const { data: chart } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .in("account_code", ["1.1.03", "2.1.01"])
    .eq("is_active", true)
    .limit(1)
    .maybeSingle()

  if (!chart?.id) {
    console.log("   ⚠️ No hay plan de cuentas 1.1.03/2.1.01, skip")
  } else {
    const { data: cp } = await supabase
      .from("financial_accounts")
      .select("id, name")
      .eq("chart_account_id", chart.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()

    if (!cp?.id) {
      console.log("   ⚠️ No hay cuenta CpC/CpP, skip")
    } else {
      const isOnly = await isAccountingOnlyAccount(cp.id, supabase)
      if (isOnly) {
        console.log(`   ✅ Cuenta ${cp.name} detectada como solo contable`)
        ok++
      } else {
        console.log(`   ❌ Cuenta ${cp.name} debería ser solo contable`)
        fail++
      }
    }
  }

  console.log("\n---")
  console.log(`OK: ${ok} | Fallos: ${fail}`)
  if (fail > 0) process.exit(1)
  console.log("✅ Tests de auditoría pasaron.\n")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
