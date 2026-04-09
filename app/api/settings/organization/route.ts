import { createServerClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = await createServerClient()
    const key = req.nextUrl.searchParams.get('key')

    let query = supabase.from('organization_settings').select('*')
    if (key) query = query.eq('key', key)

    const { data, error } = await query

    if (error) {
      // If table doesn't exist, return empty data gracefully
      console.error('Error fetching organization_settings:', error.message)
      return Response.json({ data: [] })
    }

    return Response.json({ data: data || [] })
  } catch (error: any) {
    // Don't catch Next.js redirect errors
    if (error?.digest?.startsWith('NEXT_REDIRECT')) throw error
    console.error('Error in GET /api/settings/organization:', error)
    return Response.json({ data: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { key, value } = body

    const supabase = await createServerClient()
    const updatedAt = new Date().toISOString()
    const syncAddressKeys = key === "address" || key === "company_address"
    const settingsToUpsert = syncAddressKeys
      ? [
          { key: "address", value, updated_at: updatedAt },
          { key: "company_address", value, updated_at: updatedAt },
        ]
      : [{ key, value, updated_at: updatedAt }]

    // Upsert: insert or update
    const { data, error } = await supabase
      .from('organization_settings')
      .upsert(settingsToUpsert as any, { onConflict: 'key' })
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
