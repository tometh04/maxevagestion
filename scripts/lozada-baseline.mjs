import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// Load env from .env.local
const envText = readFileSync('.env.local', 'utf8')
const env = Object.fromEntries(
  envText.split('\n').filter(l => l.trim() && !l.startsWith('#') && l.includes('=')).map(l => {
    const [k, ...rest] = l.split('=')
    return [k.trim(), rest.join('=').trim().replace(/^["']|["']$/g, '')]
  })
)

const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Missing Supabase creds in .env.local')

const sb = createClient(url, key, { auth: { persistSession: false } })

const LOZADA_ORG = '1b326d20-d133-4112-a798-f54b5af7e7cb'

async function count(table, filter) {
  const q = sb.from(table).select('*', { count: 'exact', head: true })
  if (filter) for (const [k, v] of Object.entries(filter)) q.eq(k, v)
  const { count, error } = await q
  return error ? `ERR: ${error.message}` : count
}

async function exists(table) {
  const { error } = await sb.from(table).select('*').limit(0)
  return !error
}

const baseline = {
  date: new Date().toISOString(),
  prodUrl: url,
  lozadaOrgId: LOZADA_ORG,
  counts: {
    organizations_total: await count('organizations'),
    leads_lozada_total: await count('leads', { org_id: LOZADA_ORG }),
    leads_lozada_NEW: await count('leads', { org_id: LOZADA_ORG, status: 'NEW' }),
    leads_lozada_IN_PROGRESS: await count('leads', { org_id: LOZADA_ORG, status: 'IN_PROGRESS' }),
    leads_lozada_QUOTED: await count('leads', { org_id: LOZADA_ORG, status: 'QUOTED' }),
    leads_lozada_WON: await count('leads', { org_id: LOZADA_ORG, status: 'WON' }),
    leads_lozada_LOST: await count('leads', { org_id: LOZADA_ORG, status: 'LOST' }),
    operations_lozada: await count('operations', { org_id: LOZADA_ORG }),
    customers_lozada: await count('customers', { org_id: LOZADA_ORG }),
    payments_lozada: await count('payments', { org_id: LOZADA_ORG }),
    ledger_movements_lozada: await count('ledger_movements', { org_id: LOZADA_ORG }),
    agencies_lozada: await count('agencies', { org_id: LOZADA_ORG }),
    users_lozada: await count('users', { org_id: LOZADA_ORG }),
  },
  tables_to_be_added: {
    lead_tag_categories_exists: await exists('lead_tag_categories'),
    lead_tags_exists: await exists('lead_tags'),
    lead_tag_assignments_exists: await exists('lead_tag_assignments'),
    lead_funnels_exists: await exists('lead_funnels'),
    webhook_event_log_exists: await exists('webhook_event_log'),
  }
}

console.log(JSON.stringify(baseline, null, 2))
