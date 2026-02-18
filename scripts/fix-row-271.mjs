import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: join(__dirname, '../.env.local') })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const EXCHANGE_RATE = 1450

async function importRow271() {
  const saleAmount = 8600
  const amountCollected = 2300
  const operatorCost = 4296
  const paidToOperator = 3307
  const currency = 'USD'
  const margin = saleAmount - operatorCost
  const marginPct = (margin / saleAmount) * 100
  const fileCode = 'OP-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.random().toString(36).substring(2, 8).toUpperCase()

  // Cliente Marzaz
  const { data: cust } = await supabase.from('customers').select('id').eq('first_name', 'Marzaz').maybeSingle()
  const customerId = cust?.id
  if (!customerId) { console.error('Cliente no encontrado'); process.exit(1) }

  // Operador Delfos
  const { data: operator } = await supabase.from('operators').select('id').ilike('name', '%Delfos%').maybeSingle()

  // Vendedor Mica
  const { data: seller } = await supabase.from('users').select('id').ilike('name', '%Micaela%').maybeSingle()

  // Agencia
  const { data: agency } = await supabase.from('agencies').select('id').ilike('name', '%rosario%').single()

  // No se usan cuentas financieras - sin ledger movements

  console.log('Cliente:', customerId)
  console.log('Operador:', operator.id)
  console.log('Vendedor:', seller.id)

  // 1. Operación
  const { data: op, error: opErr } = await supabase.from('operations').insert({
    agency_id: agency.id, seller_id: seller.id, operator_id: operator.id,
    type: 'PACKAGE', product_type: 'PAQUETE', destination: 'punta cana',
    operation_date: '2026-03-23', departure_date: '2026-03-23', return_date: '2026-03-31',
    adults: 4, children: 0, infants: 0, status: 'CONFIRMED',
    sale_amount_total: saleAmount, sale_currency: currency,
    operator_cost: operatorCost, operator_cost_currency: currency, currency,
    margin_amount: margin, margin_percentage: marginPct,
    billing_margin_amount: margin, billing_margin_percentage: marginPct, file_code: fileCode,
  }).select('id').single()
  if (opErr) { console.error('Error:', opErr.message); return }
  console.log('Operación:', op.id)

  // 2. Relaciones
  await supabase.from('operation_customers').insert({ operation_id: op.id, customer_id: customerId, role: 'MAIN' })
  await supabase.from('operation_operators').insert({ operation_id: op.id, operator_id: operator.id, cost: operatorCost, cost_currency: currency })

  // 3. NO LEDGER MOVEMENTS - saldos de cuentas ya son correctos

  // 4. IVA
  const ivaMargin = margin * 0.21
  await supabase.from('iva_sales').insert({
    operation_id: op.id, sale_amount_total: saleAmount, net_amount: Math.round((margin - ivaMargin) * 100) / 100,
    iva_amount: Math.round(ivaMargin * 100) / 100, currency, sale_date: '2026-03-23',
  })
  const netOp = operatorCost / 1.21
  await supabase.from('iva_purchases').insert({
    operation_id: op.id, operator_id: operator.id, operator_cost_total: operatorCost,
    net_amount: Math.round(netOp * 100) / 100, iva_amount: Math.round((operatorCost - netOp) * 100) / 100, currency, purchase_date: '2026-03-23',
  })

  // 5. Operator payment
  await supabase.from('operator_payments').insert({
    operation_id: op.id, operator_id: operator.id, amount: operatorCost, currency,
    due_date: '2026-03-23', status: 'PENDING', paid_amount: paidToOperator, notes: 'Generado por importación masiva',
  })

  // 6. Payment INCOME PAID (cobrado) - sin ledger
  await supabase.from('payments').insert({
    operation_id: op.id, payer_type: 'CUSTOMER', direction: 'INCOME', method: 'Transferencia',
    amount: amountCollected, currency, exchange_rate: EXCHANGE_RATE, date_paid: '2026-03-23', date_due: '2026-03-23',
    status: 'PAID', reference: 'Importación masiva - cobro registrado',
  })

  // 7. Payment INCOME PENDING
  await supabase.from('payments').insert({
    operation_id: op.id, payer_type: 'CUSTOMER', direction: 'INCOME', method: 'Transferencia',
    amount: saleAmount - amountCollected, currency, date_due: '2026-03-23', status: 'PENDING', reference: 'Importación masiva - pendiente de cobro',
  })

  // 8. Payment EXPENSE PAID - sin ledger
  await supabase.from('payments').insert({
    operation_id: op.id, payer_type: 'OPERATOR', direction: 'EXPENSE', method: 'Transferencia',
    amount: paidToOperator, currency, exchange_rate: EXCHANGE_RATE, date_paid: '2026-03-23', date_due: '2026-03-23',
    status: 'PAID', reference: 'Importación masiva - pago a operador registrado',
  })

  // 9. Payment EXPENSE PENDING
  const pendingOp = operatorCost - paidToOperator
  if (pendingOp > 0) {
    await supabase.from('payments').insert({
      operation_id: op.id, payer_type: 'OPERATOR', direction: 'EXPENSE', method: 'Transferencia',
      amount: pendingOp, currency, date_due: '2026-03-23', status: 'PENDING', reference: 'Importación masiva - pendiente de pago a operador',
    })
  }

  console.log('\n✅ FILA 271 IMPORTADA: Marzaz → Punta Cana | USD 8,600')
}

importRow271().catch(e => console.error('ERROR:', e))
