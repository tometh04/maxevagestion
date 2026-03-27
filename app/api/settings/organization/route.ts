import { createServerClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const { user } = await getCurrentUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createServerClient()
  const key = req.nextUrl.searchParams.get('key')

  let query = supabase.from('organization_settings').select('*')
  if (key) query = query.eq('key', key)

  const { data, error } = await query
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ data })
}

export async function POST(req: NextRequest) {
  const { user } = await getCurrentUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { key, value } = body

  const supabase = await createServerClient()

  // Upsert: insert or update
  const { data, error } = await supabase
    .from('organization_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() } as any, { onConflict: 'key' })
    .select()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ data })
}
