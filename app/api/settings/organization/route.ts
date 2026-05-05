import { createServerClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const tStart = Date.now()
    const { user } = await getCurrentUser()
    const tAfterAuth = Date.now()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = await createServerClient()
    const key = req.nextUrl.searchParams.get('key')

    // Pendientes 2.3 — antes select('*') traía cert/key y otros campos pesados
    // que el caller ignora. Limitamos las columnas al mínimo necesario.
    let query = supabase.from('organization_settings').select('key, value, org_id, updated_at')
    // Multi-tenant: scope por org_id (post-migration 135)
    if (user.org_id) query = query.eq('org_id', user.org_id)
    if (key) query = query.eq('key', key)

    const { data, error } = await query
    const tEnd = Date.now()

    // Pendientes 2.3 — observed 5s para SELECT simple. Logueamos breakdown
    // auth/query para identificar dónde se va el tiempo en el próximo slow.
    const totalMs = tEnd - tStart
    if (totalMs > 1500) {
      console.warn(
        `[settings/organization] SLOW: total=${totalMs}ms ` +
          `(auth=${tAfterAuth - tStart}ms, query=${tEnd - tAfterAuth}ms, ` +
          `org_id=${user.org_id ? 'set' : 'null'}, key=${key || 'all'})`
      )
    }

    if (error) {
      console.error('Error fetching organization_settings:', error.message)
      return Response.json({ data: [] })
    }

    // Cache en cliente: settings cambian raras veces (Mi Empresa save manual).
    // 60s + SWR 300s reduce llamadas seguidas en navegación normal de la app.
    return Response.json(
      { data: data || [] },
      {
        headers: {
          'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
        },
      }
    )
  } catch (error: any) {
    if (error?.digest?.startsWith('NEXT_REDIRECT')) throw error
    console.error('Error in GET /api/settings/organization:', error)
    return Response.json({ data: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    if (!user.org_id) {
      return Response.json({ error: 'Tu usuario no tiene organización asociada' }, { status: 400 })
    }

    const body = await req.json()
    const { key, value } = body

    const supabase = await createServerClient()
    const updatedAt = new Date().toISOString()
    const syncAddressKeys = key === "address" || key === "company_address"
    const settingsToUpsert = syncAddressKeys
      ? [
          { org_id: user.org_id, key: "address", value, updated_at: updatedAt },
          { org_id: user.org_id, key: "company_address", value, updated_at: updatedAt },
        ]
      : [{ org_id: user.org_id, key, value, updated_at: updatedAt }]

    // Upsert por (org_id, key) — unique constraint post-migration 135
    const { data, error } = await supabase
      .from('organization_settings')
      .upsert(settingsToUpsert as any, { onConflict: 'org_id,key' })
      .select()

    if (error) {
      console.error('Error upserting organization_settings:', error.message)
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ data })
  } catch (error: any) {
    if (error?.digest?.startsWith('NEXT_REDIRECT')) throw error
    console.error('Error in POST /api/settings/organization:', error)
    return Response.json({ error: 'Error saving settings' }, { status: 500 })
  }
}
