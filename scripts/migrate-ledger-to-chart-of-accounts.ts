/**
 * Script para migrar movimientos históricos del ledger al plan de cuentas
 * 
 * Este script:
 * 1. Encuentra movimientos de INCOME/EXPENSE que están en cuentas sin chart_account_id
 * 2. Los mueve a las cuentas correctas del plan de cuentas según su tipo
 * 3. Actualiza las cuentas financieras para vincularlas al plan de cuentas
 */

import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import { resolve } from "path"

dotenv.config({ path: resolve(__dirname, "../.env.local") })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Faltan variables de entorno: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function migrateLedgerToChartOfAccounts() {
  console.log("🔄 Iniciando migración de movimientos al plan de cuentas...\n")

  // 1. Obtener cuentas del plan de cuentas
  const { data: ingresosChart, error: ingresosError } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("account_code", "4.1.01")
    .eq("is_active", true)
    .maybeSingle()

  const { data: costosChart, error: costosError } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("account_code", "4.2.01")
    .eq("is_active", true)
    .maybeSingle()

  const { data: gastosChart, error: gastosError } = await supabase
    .from("chart_of_accounts")
    .select("id")
    .eq("account_code", "4.3.01")
    .eq("is_active", true)
    .maybeSingle()

  if (ingresosError || !ingresosChart) {
    console.error("❌ Error obteniendo cuenta de INGRESOS:", ingresosError)
    return
  }
  if (costosError || !costosChart) {
    console.error("❌ Error obteniendo cuenta de COSTOS:", costosError)
    return
  }
  if (gastosError || !gastosChart) {
    console.error("❌ Error obteniendo cuenta de GASTOS:", gastosError)
    return
  }

  console.log("✅ Plan de cuentas encontrado:")
  console.log(`   - INGRESOS: ${ingresosChart.id}`)
  console.log(`   - COSTOS: ${costosChart.id}`)
  console.log(`   - GASTOS: ${gastosChart.id}\n`)

  // 2. Obtener o crear cuentas financieras vinculadas al plan de cuentas
  async function getOrCreateFinancialAccount(
    chartAccountId: string,
    name: string,
    currency: "ARS" | "USD"
  ) {
    // Buscar cuenta existente
    const { data: existing } = await supabase
      .from("financial_accounts")
      .select("id")
      .eq("chart_account_id", chartAccountId)
      .eq("currency", currency)
      .eq("is_active", true)
      .maybeSingle()

    if (existing) {
      return existing.id
    }

    // Crear nueva cuenta
    const { data: newAccount, error } = await supabase
      .from("financial_accounts")
      .insert({
        name: `${name} ${currency}`,
        type: "CASH_ARS", // Tipo genérico, no importa para RESULTADO
        currency,
        chart_account_id: chartAccountId,
        initial_balance: 0,
        is_active: true,
      })
      .select("id")
      .single()

    if (error || !newAccount) {
      throw new Error(`Error creando cuenta ${name}: ${error?.message}`)
    }

    return newAccount.id
  }

  const ingresosAccountARS = await getOrCreateFinancialAccount(ingresosChart.id, "Ventas de Viajes", "ARS")
  const ingresosAccountUSD = await getOrCreateFinancialAccount(ingresosChart.id, "Ventas de Viajes", "USD")
  const costosAccountARS = await getOrCreateFinancialAccount(costosChart.id, "Costo de Operadores", "ARS")
  const costosAccountUSD = await getOrCreateFinancialAccount(costosChart.id, "Costo de Operadores", "USD")
  const gastosAccountARS = await getOrCreateFinancialAccount(gastosChart.id, "Gastos Administrativos", "ARS")
  const gastosAccountUSD = await getOrCreateFinancialAccount(gastosChart.id, "Gastos Administrativos", "USD")

  console.log("✅ Cuentas financieras creadas/obtenidas\n")

  // 3. Obtener todos los movimientos que están en cuentas sin chart_account_id
  const { data: movements, error: movementsError } = await supabase
    .from("ledger_movements")
    .select(`
      id,
      type,
      currency,
      amount_ars_equivalent,
      financial_accounts:account_id(
        id,
        chart_account_id
      )
    `)

  if (movementsError) {
    console.error("❌ Error obteniendo movimientos:", movementsError)
    return
  }

  console.log(`📊 Encontrados ${movements?.length || 0} movimientos totales\n`)

  // 4. Filtrar movimientos que necesitan migración
  const movementsToMigrate = (movements || []).filter((m: any) => {
    const account = m.financial_accounts
    return account && !account.chart_account_id && (m.type === "INCOME" || m.type === "EXPENSE" || m.type === "OPERATOR_PAYMENT")
  })

  console.log(`🔄 Movimientos a migrar: ${movementsToMigrate.length}\n`)

  if (movementsToMigrate.length === 0) {
    console.log("✅ No hay movimientos para migrar")
    return
  }

  // 5. Migrar movimientos
  let migrated = 0
  let errors = 0

  for (const movement of movementsToMigrate) {
    try {
      let newAccountId: string | null = null

      if (movement.type === "INCOME") {
        newAccountId = movement.currency === "USD" ? ingresosAccountUSD : ingresosAccountARS
      } else if (movement.type === "OPERATOR_PAYMENT" || (movement.type === "EXPENSE" && movement.financial_accounts)) {
        // Si es pago a operador, usar cuenta de COSTOS
        newAccountId = movement.currency === "USD" ? costosAccountUSD : costosAccountARS
      } else if (movement.type === "EXPENSE") {
        // Otros gastos
        newAccountId = movement.currency === "USD" ? gastosAccountUSD : gastosAccountARS
      }

      if (!newAccountId) {
        console.warn(`⚠️  No se pudo determinar cuenta para movimiento ${movement.id}`)
        errors++
        continue
      }

      // Actualizar movimiento con nueva cuenta
      const { error: updateError } = await supabase
        .from("ledger_movements")
        .update({ account_id: newAccountId })
        .eq("id", movement.id)

      if (updateError) {
        console.error(`❌ Error actualizando movimiento ${movement.id}:`, updateError)
        errors++
      } else {
        migrated++
        if (migrated % 10 === 0) {
          console.log(`   ✅ Migrados ${migrated} movimientos...`)
        }
      }
    } catch (error: any) {
      console.error(`❌ Error procesando movimiento ${movement.id}:`, error.message)
      errors++
    }
  }

  console.log(`\n✅ Migración completada:`)
  console.log(`   - Migrados: ${migrated}`)
  console.log(`   - Errores: ${errors}`)
}

// Ejecutar migración
migrateLedgerToChartOfAccounts()
  .then(() => {
    console.log("\n✅ Script finalizado")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n❌ Error fatal:", error)
    process.exit(1)
  })

