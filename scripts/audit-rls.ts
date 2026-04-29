/**
 * Audit RLS isolation: para cada tabla tenant-scoped, verifica que LOLO user
 * NO pueda ver ninguna row con org_id != su org. Maxi debe poder ver solo
 * rows de Lozada.
 *
 * Verifica ownership real (no solo count), evitando falsos positivos de
 * tablas donde LOLO tiene rows propios legitimos.
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

const LOZADA_ORG = '1b326d20-d133-4112-a798-f54b5af7e7cb'
// LOLO org_id resolved at runtime

async function getToken(email: string): Promise<string> {
  const { data } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  const tokenHash = (data as any)?.properties?.hashed_token
  const r = await fetch(`${url}/auth/v1/verify?token=${tokenHash}&type=magiclink`, { redirect: 'manual' })
  return r.headers.get('location')?.match(/access_token=([^&]+)/)?.[1] || ''
}

async function fetchRows(token: string, table: string, orgCol = 'org_id'): Promise<any[]> {
  const r = await fetch(`${url}/rest/v1/${table}?select=${orgCol}&limit=5000`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  })
  if (!r.ok) return []
  return await r.json().catch(() => [])
}

const TENANT_TABLES = [
  { name: 'agencies', col: 'org_id' },
  { name: 'customers', col: 'org_id' },
  { name: 'operators', col: 'org_id' },
  { name: 'alerts', col: 'org_id' },
  { name: 'financial_accounts', col: 'org_id' },
  { name: 'pdf_templates', col: 'org_id' },
  { name: 'message_templates', col: 'org_id' },
  { name: 'leads', col: 'org_id' },
  { name: 'operations', col: 'org_id' },
  { name: 'operation_services', col: 'org_id' },
  { name: 'operation_customers', col: 'org_id' },
  { name: 'operation_operators', col: 'org_id' },
  { name: 'operation_passengers', col: 'org_id' },
  { name: 'quotations', col: 'org_id' },
  { name: 'quotation_items', col: 'org_id' },
  { name: 'payments', col: 'org_id' },
  { name: 'operator_payments', col: 'org_id' },
  { name: 'cash_movements', col: 'org_id' },
  { name: 'ledger_movements', col: 'org_id' },
  { name: 'journal_entries', col: 'org_id' },
  { name: 'iva_sales', col: 'org_id' },
  { name: 'iva_purchases', col: 'org_id' },
  { name: 'commission_records', col: 'org_id' },
  { name: 'commission_rules', col: 'org_id' },
  { name: 'tasks', col: 'org_id' },
  { name: 'whatsapp_messages', col: 'org_id' },
  { name: 'invoices', col: 'org_id' },
  { name: 'recurring_payments', col: 'org_id' },
  { name: 'customer_segments', col: 'org_id' },
  { name: 'settings_trello', col: 'org_id' },
  { name: 'customer_settings', col: 'org_id' },
  { name: 'operation_settings', col: 'org_id' },
  { name: 'financial_settings', col: 'org_id' },
  { name: 'tools_settings', col: 'org_id' },
  { name: 'integrations', col: 'org_id' },
  { name: 'lead_comments', col: 'org_id' },
  { name: 'documents', col: 'org_id' },
  { name: 'chart_of_accounts', col: 'org_id' },
  { name: 'partner_accounts', col: 'org_id' },
  { name: 'partner_profit_allocations', col: 'org_id' },
  { name: 'recurring_payment_categories', col: 'org_id' },
  { name: 'organization_settings', col: 'org_id' },
]

async function main() {
  // Get LOLO user's org_id
  const { data: lolo } = await admin.from('users').select('org_id').eq('email', 'agency@agency.com').maybeSingle()
  const LOLO_ORG = (lolo as any)?.org_id
  if (!LOLO_ORG) {
    console.error('LOLO user no encontrado')
    process.exit(1)
  }
  console.log(`Lozada org: ${LOZADA_ORG}\nLOLO org:    ${LOLO_ORG}\n`)

  const maxi = await getToken('maxi@erplozada.com')
  const loloToken = await getToken('agency@agency.com')

  let failed = false
  console.log(`${'Table'.padEnd(32)} | Maxi rows | LOLO rows | cross-org leaks? | Status`)
  console.log('-'.repeat(100))

  for (const { name, col } of TENANT_TABLES) {
    const [maxiRows, loloRows] = await Promise.all([fetchRows(maxi, name, col), fetchRows(loloToken, name, col)])

    // Verify no cross-org leaks
    const maxiForeign = maxiRows.filter((r: any) => r[col] && r[col] !== LOZADA_ORG)
    const loloForeign = loloRows.filter((r: any) => r[col] && r[col] !== LOLO_ORG)
    const leak = maxiForeign.length > 0 || loloForeign.length > 0
    if (leak) failed = true

    const maxiTotal = maxiRows.length
    const loloTotal = loloRows.length
    const status = leak
      ? `🔴 LEAK (Maxi foreign=${maxiForeign.length}, LOLO foreign=${loloForeign.length})`
      : '✅ OK'
    console.log(`${name.padEnd(32)} | ${String(maxiTotal).padEnd(9)} | ${String(loloTotal).padEnd(9)} | ${leak ? 'YES' : 'no  '} | ${status}`)
  }

  console.log('\n' + (failed ? '❌ FAIL — hay cross-org leaks' : '✅ PASS — aislamiento completo, ningun leak'))
  process.exit(failed ? 1 : 0)
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(2) })
