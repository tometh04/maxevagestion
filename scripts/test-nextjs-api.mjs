/**
 * Test del flujo completo via Next.js API (HTTP)
 * - POST /api/invoices → crear factura draft
 * - POST /api/invoices/:id/authorize → autorizar en AFIP
 */

const BASE_URL = 'http://localhost:3002'
const AGENCY_ID = '2848db20-be29-474d-8bc0-b2b53ae7419f' // Agencia Monk3

async function main() {
  console.log('=== TEST NEXT.JS API COMPLETO ===\n')

  // 1. Crear factura via POST /api/invoices
  console.log('1. Creando factura via POST /api/invoices...')
  const createBody = {
    agency_id: AGENCY_ID,
    pto_vta: 8,
    cbte_tipo: 11, // Factura C (Monotributo)
    concepto: 2,   // Servicios
    receptor_doc_tipo: 96, // DNI
    receptor_doc_nro: '88888888',
    receptor_nombre: 'Test Consumidor Final HTTP',
    receptor_condicion_iva: 5, // Consumidor Final
    items: [
      {
        descripcion: 'Servicio turístico - Test HTTP via Next.js',
        cantidad: 1,
        precio_unitario: 20000,
        iva_id: 3,       // 0% IVA (monotributo)
        iva_porcentaje: 0,
      }
    ],
    moneda: 'PES',
    cotizacion: 1,
    concepto_desc: 'Servicio de turismo',
    fch_serv_desde: '20260301',
    fch_serv_hasta: '20260331',
    notes: 'Factura de prueba HTTP - Test automatizado',
  }

  const createRes = await fetch(`${BASE_URL}/api/invoices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(createBody),
  })

  const createData = await createRes.json()
  console.log('Create status:', createRes.status)

  if (!createRes.ok) {
    console.error('ERROR creando factura:', JSON.stringify(createData, null, 2))
    process.exit(1)
  }

  const invoiceId = createData.invoice?.id
  const invoiceStatus = createData.invoice?.status
  console.log(`✅ Factura creada: ID=${invoiceId}, status=${invoiceStatus}`)

  // 2. Autorizar en AFIP via POST /api/invoices/:id/authorize
  console.log('\n2. Autorizando en AFIP via POST /api/invoices/' + invoiceId + '/authorize...')
  console.log('   (esto puede tomar ~5-10 segundos)\n')

  const authorizeRes = await fetch(`${BASE_URL}/api/invoices/${invoiceId}/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })

  const authorizeData = await authorizeRes.json()
  console.log('Authorize status:', authorizeRes.status)
  console.log('Authorize response:', JSON.stringify(authorizeData, null, 2))

  if (authorizeRes.ok && authorizeData.success) {
    console.log('\n🎉 ¡FLUJO COMPLETO EXITOSO via Next.js HTTP!')
    console.log('=====================================')
    console.log(`Invoice ID: ${invoiceId}`)
    console.log(`CAE: ${authorizeData.data?.cae}`)
    console.log(`CAE Vencimiento: ${authorizeData.data?.cae_fch_vto}`)
    console.log(`Número Comprobante: ${authorizeData.data?.cbte_nro}`)
    console.log('=====================================')
  } else {
    console.error('\n❌ ERROR en autorización:')
    console.error(JSON.stringify(authorizeData, null, 2))
    process.exit(1)
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
