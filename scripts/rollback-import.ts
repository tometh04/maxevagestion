/**
 * =============================================================================
 * ROLLBACK DE IMPORTACIÓN MASIVA
 * =============================================================================
 *
 * Revierte TODOS los datos creados por import-masivo-operaciones.ts
 * Borra en orden correcto respetando foreign keys.
 *
 * NO toca: users, agencies, user_agencies, financial_accounts, chart_of_accounts
 * (esos fueron creados por el setup, no por el import)
 *
 * USO:
 *   npx tsx scripts/rollback-import.ts [--confirm]
 *
 *   Sin --confirm: solo muestra qué borraría (dry-run)
 *   Con --confirm: ejecuta el borrado real
 * =============================================================================
 */

import { createClient } from '@supabase/supabase-js'
import * as path from 'path'
import { config } from 'dotenv'

config({ path: path.join(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Faltan variables de entorno')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function countTable(table: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
  if (error) return -1
  return count || 0
}

async function deleteAll(table: string): Promise<number> {
  // Supabase requiere un filtro, usamos id != '' que matchea todo
  const { data, error } = await supabase
    .from(table)
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
    .select('id')

  if (error) {
    console.error(`  ❌ Error borrando ${table}: ${error.message}`)
    return 0
  }
  return data?.length || 0
}

async function main() {
  const confirm = process.argv.includes('--confirm')

  console.log('═══════════════════════════════════════════════════════')
  console.log('  ROLLBACK DE IMPORTACIÓN MASIVA')
  console.log(`  Modo: ${confirm ? '🔴 BORRADO REAL' : '🔵 DRY-RUN (solo cuenta)'}`)
  console.log('═══════════════════════════════════════════════════════\n')

  // Tablas a borrar en orden (respetando FK)
  const tablesToDelete = [
    'invoice_items',
    'invoices',
    'iva_purchases',
    'iva_sales',
    'partner_profit_allocations',
    'partner_withdrawals',
    'partner_accounts',
    'commission_records',
    'documents',
    'alerts',
    'ledger_movements',
    'operator_payments',
    'payments',
    'operation_operators',
    'operation_customers',
    'operations',
    'customers',
    'operators',
    // NO borrar: users, agencies, user_agencies, financial_accounts, chart_of_accounts
    // Esos son del setup, no del import
  ]

  console.log('📊 Estado actual de las tablas:\n')

  const counts: Record<string, number> = {}
  for (const table of tablesToDelete) {
    const count = await countTable(table)
    counts[table] = count
    if (count > 0) {
      console.log(`  📋 ${table}: ${count} registros`)
    } else if (count === 0) {
      console.log(`  ✅ ${table}: vacía`)
    } else {
      console.log(`  ⚠️  ${table}: error al contar`)
    }
  }

  const totalRecords = Object.values(counts).filter(c => c > 0).reduce((a, b) => a + b, 0)
  console.log(`\n  📊 Total: ${totalRecords} registros a borrar\n`)

  // Mostrar lo que NO se toca
  console.log('🔒 Tablas que NO se tocan (del setup):')
  for (const safeTable of ['users', 'agencies', 'user_agencies', 'financial_accounts', 'chart_of_accounts']) {
    const count = await countTable(safeTable)
    console.log(`  🔒 ${safeTable}: ${count} registros (PROTEGIDOS)`)
  }

  if (!confirm) {
    console.log('\n⚠️  Esto fue un DRY-RUN. Para ejecutar el borrado real:')
    console.log('   npx tsx scripts/rollback-import.ts --confirm\n')
    return
  }

  console.log('\n🔴 EJECUTANDO BORRADO REAL...\n')

  let totalDeleted = 0
  for (const table of tablesToDelete) {
    if (counts[table] > 0) {
      const deleted = await deleteAll(table)
      totalDeleted += deleted
      console.log(`  🗑️  ${table}: ${deleted} registros borrados`)
    }
  }

  console.log(`\n✅ Rollback completado. ${totalDeleted} registros eliminados.`)
  console.log('   Los usuarios, agencias y cuentas financieras siguen intactos.\n')
}

main().catch(console.error)
