/**
 * Test completo del flujo de facturación AFIP
 * 1. Crear factura (POST /api/invoices)
 * 2. Autorizar en AFIP (POST /api/invoices/:id/authorize)
 * Usa la sesión de Supabase directamente con service role para bypassear auth del Next.js
 */

const SUPABASE_URL = 'https://yisiinkkrmomfuduaegh.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlpc2lpbmtrcm1vbWZ1ZHVhZWdoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzk3NTY3OSwiZXhwIjoyMDgzNTUxNjc5fQ.8qr6DTJmmDutvNq0QNBlcputTsFJW3c8M4HNy3a1G-w'
const AFIP_API_KEY = 'pMyl7uKEb0pW79d9IvNHpq32IGjzEOslCDeupftyVBItAfVJa3yL9cjqqPaUnVUH'
const AGENCY_ID = '2848db20-be29-474d-8bc0-b2b53ae7419f'
const USER_ID = '9ec9dbcf-5cdd-428f-a303-c3f79b06d0be'

const sbHeaders = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'apikey': SERVICE_ROLE_KEY,
  'Prefer': 'return=representation',
}

async function main() {
  console.log('=== TEST FLUJO COMPLETO AFIP ===\n')

  // 1. Leer config AFIP de integrations
  console.log('1. Leyendo config AFIP de integrations...')
  const intRes = await fetch(
    `${SUPABASE_URL}/rest/v1/integrations?agency_id=eq.${AGENCY_ID}&integration_type=eq.afip&status=eq.active&select=*`,
    { headers: sbHeaders }
  )
  const integrations = await intRes.json()
  if (integrations.length === 0) {
    console.error('ERROR: No hay integración AFIP activa')
    process.exit(1)
  }
  const config = integrations[0].config
  console.log(`✅ Config cargada: CUIT=${config.cuit}, PtoVta=${config.point_of_sale}, Env=${config.environment}`)
  console.log(`   Cert: ${config.cert ? 'presente' : 'AUSENTE'}, Key: ${config.key ? 'presente' : 'AUSENTE'}`)

  // 2. Crear factura en BD (directamente sin Next.js)
  console.log('\n2. Creando factura de prueba en BD...')

  // Factura C (tipo 11) - Monotributo - ImpNeto = ImpTotal, sin IVA discriminado
  const impTotal = 15000
  const impNeto = impTotal // Factura C: neto = total
  const impIva = 0

  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .insert({
      agency_id: AGENCY_ID,
      cbte_tipo: 11, // Factura C
      pto_vta: 8,
      concepto: 2, // Servicios
      receptor_doc_tipo: 96, // DNI
      receptor_doc_nro: '99999999',
      receptor_nombre: 'Consumidor Final Test',
      receptor_condicion_iva: 5, // Consumidor Final
      imp_neto: impNeto,
      imp_iva: impIva,
      imp_total: impTotal,
      imp_trib: 0,
      imp_tot_conc: 0,
      imp_op_ex: 0,
      moneda: 'PES',
      cotizacion: 1,
      fch_serv_desde: '20260301',
      fch_serv_hasta: '20260331',
      status: 'draft',
      created_by: USER_ID,
      notes: 'Factura de prueba automatizada',
    })
    .select()
    .single()

  if (invErr) {
    console.error('ERROR creando factura:', invErr.message, JSON.stringify(invErr))
    process.exit(1)
  }
  console.log(`✅ Factura creada: ID=${invoice.id}, status=${invoice.status}`)

  // 3. Crear item
  console.log('\n3. Creando item de factura...')
  const { error: itemErr } = await supabase
    .from('invoice_items')
    .insert({
      invoice_id: invoice.id,
      descripcion: 'Servicio turístico - Test AFIP automatizado',
      cantidad: 1,
      precio_unitario: impTotal,
      subtotal: impTotal,
      iva_id: 3, // 0%
      iva_porcentaje: 0,
      iva_importe: 0,
      total: impTotal,
      orden: 0,
    })

  if (itemErr) {
    console.error('ERROR creando item:', itemErr.message)
    // Rollback
    await supabase.from('invoices').delete().eq('id', invoice.id)
    process.exit(1)
  }
  console.log('✅ Item creado')

  // 4. Autorizar en AFIP directamente con el SDK
  console.log('\n4. Autorizando en AFIP...')

  // Importar el cliente AFIP
  const { createRequire } = await import('module')
  const require = createRequire(import.meta.url)

  const Afip = require('@afipsdk/afip.js')
  const afip = new Afip({
    CUIT: Number(config.cuit),
    production: config.environment === 'production',
    access_token: config.api_key,
    ...(config.cert ? { cert: config.cert } : {}),
    ...(config.key ? { key: config.key } : {}),
  })

  console.log('   SDK instanciado, enviando a AFIP...')

  const voucherData = {
    CantReg: 1,
    PtoVta: config.point_of_sale,
    CbteTipo: 11,
    Concepto: 2,
    DocTipo: 96,
    DocNro: 99999999,
    CbteFch: 20260312,
    ImpTotal: impTotal,
    ImpTotConc: 0,
    ImpNeto: impNeto,
    ImpOpEx: 0,
    ImpIVA: 0,
    ImpTrib: 0,
    MonId: 'PES',
    MonCotiz: 1,
    CondicionIVAReceptorId: 5,
    FchServDesde: 20260301,
    FchServHasta: 20260331,
    FchVtoPago: 20260331,
  }

  try {
    const res = await afip.ElectronicBilling.createNextVoucher(voucherData)
    console.log('AFIP response:', JSON.stringify(res))

    if (res && res.CAE) {
      console.log(`\n✅ ¡FACTURA AUTORIZADA!`)
      console.log(`   CAE: ${res.CAE}`)
      console.log(`   CAE Vto: ${res.CAEFchVto}`)
      console.log(`   Número: ${res.voucherNumber}`)

      // Actualizar factura en BD
      const { error: updateErr } = await supabase
        .from('invoices')
        .update({
          status: 'authorized',
          cbte_nro: res.voucherNumber,
          cae: res.CAE,
          cae_fch_vto: res.CAEFchVto,
          fecha_emision: new Date().toISOString().split('T')[0],
          afip_response: res,
        })
        .eq('id', invoice.id)

      if (updateErr) {
        console.error('ERROR actualizando BD:', updateErr.message)
      } else {
        console.log('\n✅ Factura actualizada en BD con CAE!')
        console.log('\n=== FLUJO COMPLETO EXITOSO ===')
        console.log(`Invoice ID: ${invoice.id}`)
        console.log(`CAE: ${res.CAE}`)
        console.log(`CAE Vencimiento: ${res.CAEFchVto}`)
        console.log(`Número Comprobante: ${res.voucherNumber}`)
      }
    } else {
      console.error('ERROR: AFIP no retornó CAE')
      console.error('Response:', JSON.stringify(res))

      // Actualizar como rejected
      await supabase.from('invoices').update({
        status: 'rejected',
        afip_response: res,
      }).eq('id', invoice.id)
    }
  } catch (err) {
    console.error('ERROR en AFIP SDK:', err.message)
    console.error('Detalles:', err.data || err)

    // Actualizar como rejected
    await supabase.from('invoices').update({
      status: 'rejected',
      afip_response: { error: err.message, data: err.data },
    }).eq('id', invoice.id)

    process.exit(1)
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
