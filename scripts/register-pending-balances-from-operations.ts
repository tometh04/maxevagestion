import { createClient } from '@supabase/supabase-js'
import * as path from 'path'
import { config } from 'dotenv'
import { createLedgerMovement } from '../lib/accounting/ledger'
import { getExchangeRate, getLatestExchangeRate } from '../lib/accounting/exchange-rates'
import { convertToARS } from '../lib/currency'

// Cargar variables de entorno
config({ path: path.join(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Faltan variables de entorno de Supabase')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function registerPendingBalances() {
  console.log('📊 Registrando pendientes de operaciones importadas...\n')

  try {
    // Obtener un usuario para usar como created_by
    const { data: users } = await supabase
      .from('users')
      .select('id')
      .limit(1)

    if (!users || users.length === 0) {
      console.error('❌ No hay usuarios en la base de datos')
      return
    }

    const userId = users[0].id
    console.log(`✓ Usuario: ${userId}\n`)

    // Obtener todas las operaciones
    const { data: operations, error: opsError } = await supabase
      .from('operations')
      .select(`
        id,
        file_code,
        sale_amount_total,
        sale_currency,
        operator_cost,
        operator_cost_currency,
        currency,
        departure_date,
        created_at,
        destination,
        seller_id,
        operator_id
      `)
      .order('created_at', { ascending: true })

    if (opsError) {
      console.error('❌ Error obteniendo operaciones:', opsError)
      return
    }

    if (!operations || operations.length === 0) {
      console.log('⚠️  No hay operaciones en la base de datos')
      return
    }

    console.log(`📋 Encontradas ${operations.length} operaciones\n`)

    // Obtener chart accounts
    const { data: accountsReceivableChart } = await (supabase.from("chart_of_accounts") as any)
      .select("id")
      .eq("account_code", "1.1.03")
      .eq("is_active", true)
      .maybeSingle()

    const { data: accountsPayableChart } = await (supabase.from("chart_of_accounts") as any)
      .select("id")
      .eq("account_code", "2.1.01")
      .eq("is_active", true)
      .maybeSingle()

    if (!accountsReceivableChart || !accountsPayableChart) {
      console.error('❌ No se encontraron chart accounts necesarios')
      return
    }

    // Obtener o crear financial accounts por moneda (ARS y USD separadas)
    async function getOrCreateFA(chartAccountId: string, name: string, currency: string) {
      const { data: existing } = await (supabase.from("financial_accounts") as any)
        .select("id")
        .eq("chart_account_id", chartAccountId)
        .eq("currency", currency)
        .eq("is_active", true)
        .maybeSingle()

      if (existing) return existing

      const { data: newFA } = await (supabase.from("financial_accounts") as any)
        .insert({
          name: `${name} ${currency}`,
          type: "ASSETS",
          currency,
          chart_account_id: chartAccountId,
          initial_balance: 0,
          is_active: true,
          created_by: userId,
        })
        .select("id")
        .single()
      return newFA
    }

    const receivableARS = await getOrCreateFA(accountsReceivableChart.id, "Cuentas por Cobrar", "ARS")
    const receivableUSD = await getOrCreateFA(accountsReceivableChart.id, "Cuentas por Cobrar", "USD")
    const payableARS = await getOrCreateFA(accountsPayableChart.id, "Cuentas por Pagar", "ARS")
    const payableUSD = await getOrCreateFA(accountsPayableChart.id, "Cuentas por Pagar", "USD")

    const receivableByCurrency: Record<string, any> = { ARS: receivableARS, USD: receivableUSD }
    const payableByurrency: Record<string, any> = { ARS: payableARS, USD: payableUSD }

    console.log(`✓ Cuentas financieras listas (ARS + USD)\n`)

    let processed = 0
    let skipped = 0
    let errors = 0

    for (const op of operations) {
      try {
        // Verificar si ya tiene movimientos contables para esta operación
        const { data: existingMovements } = await supabase
          .from('ledger_movements')
          .select('id')
          .eq('operation_id', op.id)
          .limit(1)

        if (existingMovements && existingMovements.length > 0) {
          skipped++
          continue
        }

        // 1. Registrar venta en "Cuentas por Cobrar"
        if (op.sale_amount_total && op.sale_amount_total > 0) {
          const saleCurrency = (op.sale_currency || op.currency || 'ARS') as 'ARS' | 'USD'
          const saleAmount = parseFloat(String(op.sale_amount_total)) || 0

          let saleExchangeRate: number | null = null
          if (saleCurrency === 'USD') {
            const opDate = op.departure_date || op.created_at
            saleExchangeRate = await getExchangeRate(supabase, opDate)
            if (!saleExchangeRate) {
              saleExchangeRate = await getLatestExchangeRate(supabase)
            }
            if (!saleExchangeRate) saleExchangeRate = 1000
          }

          const saleAmountARS = saleCurrency === 'USD' && saleExchangeRate 
            ? saleAmount * saleExchangeRate 
            : saleAmount

          await createLedgerMovement(
            {
              operation_id: op.id,
              lead_id: null,
              type: 'INCOME',
              concept: `Venta - Operación ${op.file_code || op.id.slice(0, 8)}`,
              currency: saleCurrency,
              amount_original: saleAmount,
              exchange_rate: saleExchangeRate,
              amount_ars_equivalent: saleAmountARS,
              method: 'OTHER',
              account_id: receivableByCurrency[saleCurrency]?.id || receivableARS.id,
              seller_id: op.seller_id || null,
              operator_id: null,
              receipt_number: null,
              notes: `Operación importada: ${op.destination || 'Sin destino'}`,
              created_by: userId,
            },
            supabase
          )
        }

        // 2. Registrar costos en "Cuentas por Pagar"
        if (op.operator_cost && op.operator_cost > 0) {
          const costCurrency = (op.operator_cost_currency || op.currency || 'ARS') as 'ARS' | 'USD'
          const costAmount = parseFloat(String(op.operator_cost)) || 0

          let costExchangeRate: number | null = null
          if (costCurrency === 'USD') {
            const opDate = op.departure_date || op.created_at
            costExchangeRate = await getExchangeRate(supabase, opDate)
            if (!costExchangeRate) {
              costExchangeRate = await getLatestExchangeRate(supabase)
            }
            if (!costExchangeRate) {
              console.warn(`⚠️  No se encontró tasa de cambio para USD en operación ${op.id}, usando 1000`)
              costExchangeRate = 1000
            }
          }

          const costAmountARS = costCurrency === 'USD' && costExchangeRate 
            ? costAmount * costExchangeRate 
            : costAmount

          await createLedgerMovement(
            {
              operation_id: op.id,
              lead_id: null,
              type: 'EXPENSE',
              concept: `Costo de Operadores - Operación ${op.file_code || op.id.slice(0, 8)}`,
              currency: costCurrency,
              amount_original: costAmount,
              exchange_rate: costExchangeRate,
              amount_ars_equivalent: costAmountARS,
              method: 'OTHER',
              account_id: payableByurrency[costCurrency]?.id || payableARS.id,
              seller_id: op.seller_id || null,
              operator_id: op.operator_id || null,
              receipt_number: null,
              notes: `Operación importada: ${op.destination || 'Sin destino'}`,
              created_by: userId,
            },
            supabase
          )
        }

        processed++

        if (processed % 10 === 0) {
          console.log(`⏳ Progreso: ${processed}/${operations.length} procesadas...`)
        }

      } catch (error: any) {
        errors++
        console.error(`❌ Error procesando operación ${op.id}:`, error.message)
      }
    }

    console.log(`\n✅ Proceso completado:`)
    console.log(`   ✅ Procesadas: ${processed}`)
    console.log(`   ⏭️  Omitidas (ya tenían movimientos): ${skipped}`)
    console.log(`   ❌ Errores: ${errors}`)

  } catch (error: any) {
    console.error('\n❌ Error fatal:', error)
    console.error('Stack:', error.stack)
  }
}

registerPendingBalances()
  .then(() => {
    console.log('\n🎉 ¡Registro de pendientes completado!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Error fatal:', error)
    process.exit(1)
  })

