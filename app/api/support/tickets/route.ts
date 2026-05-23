import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  let sessionUser: any
  let appUser: any
  try {
    const { user, session } = await getCurrentUser()
    sessionUser = session.user
    appUser = user
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { subject: string; description?: string; conversationId?: string; priority?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.subject?.trim()) {
    return NextResponse.json({ error: 'Subject required' }, { status: 400 })
  }

  const supabase = await createServerClient()

  // If conversationId provided, mark conversation as escalated
  if (body.conversationId) {
    await (supabase as any)
      .from('support_conversations')
      .update({ status: 'escalated' })
      .eq('id', body.conversationId)
      .eq('user_id', sessionUser.id)
  }

  const { data: ticket, error } = await (supabase as any)
    .from('support_tickets')
    .insert({
      user_id: sessionUser.id,
      org_id: appUser.org_id || '00000000-0000-0000-0000-000000000000',
      conversation_id: body.conversationId || null,
      subject: body.subject.trim(),
      description: body.description?.trim() || null,
      priority: body.priority || 'normal',
    })
    .select('id, subject, status, priority, created_at')
    .single()

  if (error) {
    console.error('Error creating ticket:', error)
    return NextResponse.json({ error: 'Error creating ticket' }, { status: 500 })
  }

  return NextResponse.json({ ticket })
}

export async function GET() {
  let sessionUser: any
  try {
    const { session } = await getCurrentUser()
    sessionUser = session.user
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServerClient()
  const { data, error } = await (supabase as any)
    .from('support_tickets')
    .select('id, subject, description, status, priority, created_at, updated_at, resolved_at')
    .eq('user_id', sessionUser.id)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    console.error('Error fetching tickets:', error)
    return NextResponse.json({ error: 'Error fetching tickets' }, { status: 500 })
  }

  return NextResponse.json({ tickets: data || [] })
}
