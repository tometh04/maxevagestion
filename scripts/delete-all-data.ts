import { createClient } from '@supabase/supabase-js'
import * as path from 'path'
import { config } from 'dotenv'

// Cargar variables de entorno
config({ path: path.join(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Faltan variables de entorno de Supabase')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Tablas a BORRAR (en orden de dependencias, de más dependiente a menos)
const TABLES_TO_DELETE = [
  // Tablas dependientes de operations y otras (borrar primero)
  'quota_reservations',
  'quotation_items',
  'operation_passengers',
  'operation_operators',
  'operation_customers',
  'partner_withdrawals',
  'commission_records',
  'iva_purchases',
  'iva_sales',
  'operator_payments',
  'payments',
  'documents',
  'alerts',
  'communications',
  'whatsapp_messages',
  'billing_info',
  'cash_transfers',
  'cash_movements',
  'ledger_movements',
  'recurring_payments',
  'payment_coupons',
  'card_transactions',
  
  // Tablas principales (borrar después)
  'operations',
  'quotations',
  'quotas',
  'tariff_items',
  'tariffs',
  
  // Tablas de entidades base
  'customers',
  'operators',
  'partner_accounts',
  
  // Tablas de auditoría y logs
  'audit_logs',
  'conversations',
  'messages',
  'lead_comments',
]

// Tablas a CONSERVAR (no se borran)
const TABLES_TO_KEEP = [
  'leads',
  'manychat_list_order',
  'agencies',
  'users',
  'user_agencies',
  'settings_trello',
  'non_touristic_categories',
  'destination_requirements',
  'message_templates',
  'recurring_payment_providers',
  'financial_accounts', // Conservar estructura (configuración)
  'chart_of_accounts', // Conservar estructura (configuración)
  'exchange_rates', // Conservar estructura (configuración)
  'cash_boxes', // Conservar estructura (configuración)
]

async function truncateTable(tableName: string): Promise<boolean> {
  try {
    // Intentar TRUNCATE CASCADE primero (más eficiente)
    const { error: truncateError } = await supabase.rpc('exec_sql', {
      sql_query: `TRUNCATE TABLE ${tableName} CASCADE;`
    })
    
    if (!truncateError) {
      return true
    }
    
    // Si TRUNCATE falla, intentar DELETE
    console.log(`  ⚠️  TRUNCATE falló, intentando DELETE...`)
    const { error: deleteError } = await supabase
      .from(tableName)
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all (usando condición que siempre es true)
    
    if (!deleteError) {
      return true
    }
    
    // Si ambos fallan, intentar DELETE directo con SQL
    const { error: sqlError } = await supabase.rpc('exec_sql', {
      sql_query: `DELETE FROM ${tableName};`
    })
    
    if (!sqlError) {
      return true
    }
    
    throw sqlError
  } catch (error: any) {
    console.error(`  ❌ Error borrando ${tableName}:`, error.message)
    return false
  }
}

async function deleteAllData() {
  console.log('🗑️  INICIANDO BORRADO COMPLETO DE DATOS\n')
  console.log('⚠️  ADVERTENCIA: Este script borrará TODOS los datos excepto:')
  console.log('   - Leads (tabla leads)')
  console.log('   - Configuración de ManyChat (manychat_list_order)')
  console.log('   - Configuraciones del sistema (agencies, users, etc.)')
  console.log('   - Operaciones asignadas a leads también se borrarán\n')
  
  // Contar registros antes de borrar
  console.log('📊 Contando registros antes del borrado...\n')
  const countsBefore: Record<string, number> = {}
  
  for (const table of TABLES_TO_DELETE) {
    try {
      const { count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
      countsBefore[table] = count || 0
    } catch (error) {
      countsBefore[table] = 0
    }
  }
  
  // Mostrar resumen
  const totalRecords = Object.values(countsBefore).reduce((sum, count) => sum + count, 0)
  console.log(`📈 Total de registros a borrar: ${totalRecords.toLocaleString()}\n`)
  
  // Confirmar
  console.log('¿Estás seguro de continuar? (Ctrl+C para cancelar)')
  console.log('Esperando 5 segundos...\n')
  await new Promise(resolve => setTimeout(resolve, 5000))
  
  console.log('🚀 Iniciando borrado...\n')
  
  let successCount = 0
  let failCount = 0
  const results: Array<{ table: string; success: boolean; recordsBefore: number }> = []
  
  for (const table of TABLES_TO_DELETE) {
    const recordsBefore = countsBefore[table] || 0
    console.log(`🔄 Borrando ${table} (${recordsBefore.toLocaleString()} registros)...`)
    
    const success = await truncateTable(table)
    
    if (success) {
      successCount++
      console.log(`  ✅ ${table} borrado exitosamente\n`)
    } else {
      failCount++
      console.log(`  ❌ ${table} falló al borrar\n`)
    }
    
    results.push({ table, success, recordsBefore })
    
    // Pequeña pausa para no sobrecargar la BD
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  
  // Verificar resultados
  console.log('\n📊 VERIFICANDO RESULTADOS...\n')
  const countsAfter: Record<string, number> = {}
  
  for (const table of TABLES_TO_DELETE) {
    try {
      const { count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
      countsAfter[table] = count || 0
    } catch (error) {
      countsAfter[table] = -1 // Error al contar
    }
  }
  
  // Mostrar resumen final
  console.log('═'.repeat(80))
  console.log('📋 RESUMEN FINAL')
  console.log('═'.repeat(80))
  console.log(`✅ Tablas borradas exitosamente: ${successCount}`)
  console.log(`❌ Tablas con errores: ${failCount}`)
  console.log('')
  
  // Mostrar detalles
  console.log('📊 DETALLES POR TABLA:')
  console.log('─'.repeat(80))
  for (const result of results) {
    const after = countsAfter[result.table] ?? -1
    const status = result.success && after === 0 ? '✅' : result.success ? '⚠️' : '❌'
    console.log(
      `${status} ${result.table.padEnd(30)} | Antes: ${String(result.recordsBefore).padStart(8)} | Después: ${after === -1 ? 'ERROR' : String(after).padStart(8)}`
    )
  }
  
  // Verificar tablas que deben conservarse
  console.log('\n🔍 VERIFICANDO TABLAS CONSERVADAS...\n')
  for (const table of TABLES_TO_KEEP) {
    try {
      const { count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
      const countValue = count || 0
      console.log(`  ${countValue > 0 ? '✅' : '⚠️'} ${table}: ${countValue.toLocaleString()} registros`)
    } catch (error: any) {
      console.log(`  ⚠️  ${table}: Error al verificar (${error.message})`)
    }
  }
  
  console.log('\n✅ Proceso completado!\n')
}

// Ejecutar
deleteAllData().catch((error) => {
  console.error('\n❌ Error fatal:', error)
  process.exit(1)
})

