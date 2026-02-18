/**
 * ROLLBACK DE IMPORTACIÓN MASIVA
 *
 * Revierte TODOS los datos de operaciones/clientes/pagos.
 * NO toca: users, agencies, financial_accounts, chart_of_accounts
 *
 * USO:
 *   node scripts/rollback-import.mjs              → dry-run
 *   node scripts/rollback-import.mjs --confirm    → borrado real
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '../.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function countTable(table) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true })
  return error ? -1 : (count || 0)
}

async function deleteAll(table) {
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

const confirm = process.argv.includes('--confirm')

console.log('═══════════════════════════════════════════════════════')
console.log('  ROLLBACK DE IMPORTACIÓN MASIVA')
console.log(`  Modo: ${confirm ? '🔴 BORRADO REAL' : '🔵 DRY-RUN (solo cuenta)'}`)
console.log('═══════════════════════════════════════════════════════\n')

// Orden correcto respetando FK
const tablesToDelete = [
  'invoice_items', 'invoices', 'iva_purchases', 'iva_sales',
  'partner_profit_allocations', 'partner_withdrawals', 'partner_accounts',
  'commission_records', 'documents', 'alerts',
  'ledger_movements', 'operator_payments', 'payments',
  'operation_operators', 'operation_customers',
  'operations', 'customers', 'operators',
]

console.log('📊 Estado actual:\n')
const counts = {}
for (const table of tablesToDelete) {
  counts[table] = await countTable(table)
  const icon = counts[table] > 0 ? '📋' : '✅'
  console.log(`  ${icon} ${table}: ${counts[table]}`)
}

const total = Object.values(counts).filter(c => c > 0).reduce((a, b) => a + b, 0)
console.log(`\n  📊 Total a borrar: ${total} registros\n`)

console.log('🔒 Tablas PROTEGIDAS (no se tocan):')
for (const t of ['users', 'agencies', 'user_agencies', 'financial_accounts', 'chart_of_accounts']) {
  console.log(`  🔒 ${t}: ${await countTable(t)} registros`)
}

if (!confirm) {
  console.log('\n⚠️  DRY-RUN. Para borrar de verdad:')
  console.log('   node scripts/rollback-import.mjs --confirm\n')
  process.exit(0)
}

console.log('\n🔴 BORRANDO...\n')
let totalDeleted = 0
for (const table of tablesToDelete) {
  if (counts[table] > 0) {
    const deleted = await deleteAll(table)
    totalDeleted += deleted
    console.log(`  🗑️  ${table}: ${deleted} borrados`)
  }
}

console.log(`\n✅ Rollback completado. ${totalDeleted} registros eliminados.`)
console.log('   Users, agencies y cuentas financieras intactos.\n')
