/**
 * Script para vincular cuentas financieras de caja/bancos al plan de cuentas
 */

import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import { resolve } from "path"

dotenv.config({ path: resolve(__dirname, "../.env.local") })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Faltan variables de entorno")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function linkCashAccountsToChart() {
  console.log("🔄 Vinculando cuentas de caja/bancos al plan de cuentas...\n")

  // Mapeo de tipos de financial_accounts a códigos del plan de cuentas
  const typeMapping: Record<string, string> = {
    CASH_ARS: "1.1.01", // Caja
    CASH_USD: "1.1.01", // Caja (USD también va a Caja)
    CHECKING_ARS: "1.1.02", // Bancos
    CHECKING_USD: "1.1.02", // Bancos
    CREDIT_CARD: "1.1.04", // Mercado Pago
    SAVINGS_ARS: "1.1.02", // Caja de Ahorro → Bancos
    SAVINGS_USD: "1.1.02", // Caja de Ahorro USD → Bancos
  }

  // Obtener todas las cuentas financieras sin chart_account_id
  const { data: accounts, error } = await supabase
    .from("financial_accounts")
    .select("*")
    .is("chart_account_id", null)
    .eq("is_active", true)

  if (error) {
    console.error("❌ Error obteniendo cuentas:", error)
    return
  }

  console.log(`📊 Encontradas ${accounts?.length || 0} cuentas sin vincular\n`)

  if (!accounts || accounts.length === 0) {
    console.log("✅ No hay cuentas para vincular")
    return
  }

  let linked = 0
  let errors = 0

  for (const account of accounts) {
    try {
      const chartCode = typeMapping[account.type]
      
      if (!chartCode) {
        console.warn(`⚠️  Tipo de cuenta no mapeado: ${account.type} (${account.name})`)
        continue
      }

      // Buscar cuenta del plan de cuentas
      const { data: chartAccount, error: chartError } = await supabase
        .from("chart_of_accounts")
        .select("id")
        .eq("account_code", chartCode)
        .eq("is_active", true)
        .maybeSingle()

      if (chartError || !chartAccount) {
        console.warn(`⚠️  No se encontró cuenta del plan con código ${chartCode}`)
        continue
      }

      // Vincular cuenta financiera al plan de cuentas
      const { error: updateError } = await supabase
        .from("financial_accounts")
        .update({ chart_account_id: chartAccount.id })
        .eq("id", account.id)

      if (updateError) {
        console.error(`❌ Error vinculando ${account.name}:`, updateError)
        errors++
      } else {
        console.log(`✅ Vinculada: ${account.name} (${account.type}) → ${chartCode}`)
        linked++
      }
    } catch (error: any) {
      console.error(`❌ Error procesando ${account.name}:`, error.message)
      errors++
    }
  }

  console.log(`\n✅ Vinculación completada:`)
  console.log(`   - Vinculadas: ${linked}`)
  console.log(`   - Errores: ${errors}`)
}

linkCashAccountsToChart()
  .then(() => {
    console.log("\n✅ Script finalizado")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n❌ Error fatal:", error)
    process.exit(1)
  })

