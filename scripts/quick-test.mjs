// Quick test script - run with: node scripts/quick-test.mjs
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://pmqvplyyxiobkllapgjp.supabase.co'
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseKey) {
  console.log('❌ SUPABASE_SERVICE_ROLE_KEY no está configurado')
  console.log('Ejecuta: export SUPABASE_SERVICE_ROLE_KEY="tu-key"')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function main() {
  console.log('🧪 TESTEO RÁPIDO DE CORRECCIONES')
  console.log('='.repeat(50))

  // Test 1: recurring_payment_categories
  console.log('\n📋 Test 1: Categorías de Gastos Recurrentes')
  try {
    const { data, error } = await supabase.from('recurring_payment_categories').select('name').limit(5)
    if (error) throw error
    console.log('✅ Tabla existe:', data.map(c => c.name).join(', '))
  } catch (e) {
    console.log('❌ Error:', e.message)
  }

  // Test 2: monthly_exchange_rates
  console.log('\n📋 Test 2: TC Mensual')
  try {
    const { data, error } = await supabase.from('monthly_exchange_rates').select('*').limit(1)
    if (error) throw error
    console.log('✅ Tabla existe, registros:', data.length)
    
    // Intentar insertar
    const { error: insertError } = await supabase
      .from('monthly_exchange_rates')
      .upsert({ year: 2025, month: 1, usd_to_ars_rate: 1200 }, { onConflict: 'year,month' })
    
    if (insertError) {
      if (insertError.message.includes('auth.users')) {
        console.log('❌ Error de foreign key (auth.users en lugar de users)')
      } else {
        console.log('❌ Error al insertar:', insertError.message)
      }
    } else {
      console.log('✅ Inserción exitosa')
    }
  } catch (e) {
    console.log('❌ Error:', e.message)
  }

  // Test 3: operator_payments.paid_amount
  console.log('\n📋 Test 3: paid_amount en operator_payments')
  try {
    const { data, error } = await supabase.from('operator_payments').select('id, paid_amount').limit(1)
    if (error) throw error
    console.log('✅ Campo existe')
  } catch (e) {
    console.log('❌ Error:', e.message)
  }

  // Test 4: payments.exchange_rate
  console.log('\n📋 Test 4: exchange_rate en payments')
  try {
    const { data, error } = await supabase.from('payments').select('id, exchange_rate, amount_usd').limit(1)
    if (error) throw error
    console.log('✅ Campos existen')
  } catch (e) {
    console.log('❌ Error:', e.message)
  }

  // Test 5: partner_accounts
  console.log('\n📋 Test 5: Cuentas de Socios')
  try {
    const { data, error } = await supabase.from('partner_accounts').select('id, name').limit(5)
    if (error) throw error
    console.log('✅ Tabla existe, socios:', data.length)
  } catch (e) {
    console.log('❌ Error:', e.message)
  }

  console.log('\n✅ TESTEO COMPLETADO')
}

main()
