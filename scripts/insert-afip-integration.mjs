/**
 * Script para insertar la configuración AFIP (con cert+key) en la tabla integrations
 * Lee de afip_config (tabla vieja) e inserta en integrations (tabla nueva)
 */

const SUPABASE_URL = 'https://yisiinkkrmomfuduaegh.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlpc2lpbmtrcm1vbWZ1ZHVhZWdoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Nzk3NTY3OSwiZXhwIjoyMDgzNTUxNjc5fQ.8qr6DTJmmDutvNq0QNBlcputTsFJW3c8M4HNy3a1G-w'
const AFIP_API_KEY = 'pMyl7uKEb0pW79d9IvNHpq32IGjzEOslCDeupftyVBItAfVJa3yL9cjqqPaUnVUH'
const AGENCY_ID = '2848db20-be29-474d-8bc0-b2b53ae7419f' // Agencia Monk3
const USER_ID = '9ec9dbcf-5cdd-428f-a303-c3f79b06d0be'

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'apikey': SERVICE_ROLE_KEY,
  'Prefer': 'return=representation',
}

async function main() {
  console.log('=== Insertar config AFIP en integrations ===\n')

  // 1. Leer cert+key de afip_config
  console.log('1. Leyendo afip_config...')
  const configRes = await fetch(
    `${SUPABASE_URL}/rest/v1/afip_config?cuit=eq.20362014949&is_active=eq.true&select=*`,
    { headers }
  )
  const configs = await configRes.json()
  console.log('afip_config response:', JSON.stringify(configs).substring(0, 200))

  if (configs == null || configs.length === 0) {
    console.error('ERROR: No se encontró config AFIP activa')
    process.exit(1)
  }

  const afipConfig = configs[0]
  console.log(`CUIT: ${afipConfig.cuit}`)
  console.log(`Punto Venta: ${afipConfig.punto_venta}`)
  console.log(`Environment: ${afipConfig.environment}`)
  console.log(`Cert length: ${afipConfig.afip_cert ? afipConfig.afip_cert.length : 'null'}`)
  console.log(`Key length: ${afipConfig.afip_key ? afipConfig.afip_key.length : 'null'}`)

  // 2. Verificar si ya existe la integración en integrations
  console.log('\n2. Verificando integrations existente...')
  const existRes = await fetch(
    `${SUPABASE_URL}/rest/v1/integrations?agency_id=eq.${AGENCY_ID}&integration_type=eq.afip&select=id,status`,
    { headers }
  )
  const existing = await existRes.json()
  console.log('Existing integrations:', JSON.stringify(existing))

  const configData = {
    api_key: AFIP_API_KEY,
    cuit: afipConfig.cuit,
    point_of_sale: afipConfig.punto_venta || 8,
    environment: afipConfig.environment || 'production',
    cert: afipConfig.afip_cert || null,
    key: afipConfig.afip_key || null,
  }

  if (existing && existing.length > 0) {
    // Actualizar
    const integrationId = existing[0].id
    console.log(`\n3. Actualizando integración existente (${integrationId})...`)
    const updateRes = await fetch(
      `${SUPABASE_URL}/rest/v1/integrations?id=eq.${integrationId}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          config: configData,
          status: 'active',
          updated_at: new Date().toISOString(),
        }),
      }
    )
    const updateData = await updateRes.json()
    console.log('Update status:', updateRes.status)
    console.log('Update response:', JSON.stringify(updateData).substring(0, 300))
    if (updateRes.ok || updateRes.status === 200 || updateRes.status === 204) {
      console.log('\n✅ Integración actualizada correctamente!')
    } else {
      console.error('\n❌ Error al actualizar:', JSON.stringify(updateData))
    }
  } else {
    // Insertar
    console.log('\n3. Insertando nueva integración...')
    const insertRes = await fetch(
      `${SUPABASE_URL}/rest/v1/integrations`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          agency_id: AGENCY_ID,
          integration_type: 'afip',
          name: 'AFIP - Facturación Electrónica',
          description: `Configuración AFIP para CUIT ${afipConfig.cuit}`,
          config: configData,
          status: 'active',
          sync_enabled: false,
          created_by: USER_ID,
        }),
      }
    )
    const insertData = await insertRes.json()
    console.log('Insert status:', insertRes.status)
    console.log('Insert response:', JSON.stringify(insertData).substring(0, 400))
    if (insertRes.ok || insertRes.status === 201) {
      console.log('\n✅ Integración insertada correctamente!')
    } else {
      console.error('\n❌ Error al insertar:', JSON.stringify(insertData))
    }
  }

  // 4. Verificar resultado final
  console.log('\n4. Verificación final...')
  const verifyRes = await fetch(
    `${SUPABASE_URL}/rest/v1/integrations?agency_id=eq.${AGENCY_ID}&integration_type=eq.afip&select=id,status,config`,
    { headers }
  )
  const verified = await verifyRes.json()
  if (verified && verified.length > 0) {
    const v = verified[0]
    const config = v.config || {}
    console.log(`ID: ${v.id}`)
    console.log(`Status: ${v.status}`)
    console.log(`CUIT: ${config.cuit}`)
    console.log(`PtoVta: ${config.point_of_sale}`)
    console.log(`Env: ${config.environment}`)
    console.log(`Cert: ${config.cert ? '✅ presente (' + config.cert.length + ' chars)' : '❌ ausente'}`)
    console.log(`Key: ${config.key ? '✅ presente (' + config.key.length + ' chars)' : '❌ ausente'}`)
  } else {
    console.error('No se encontró la integración!')
  }
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
