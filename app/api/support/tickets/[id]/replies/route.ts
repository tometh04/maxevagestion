import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  let sessionUser: any
  try {
    const { session } = await getCurrentUser()
    sessionUser = session.user
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServerClient()

  // Verify ticket belongs to user
  const { data: ticket } = await (supabase as any)
    .from('support_tickets')
    .select('id, subject, description, status, created_at, updated_at')
    .eq('id', id)
    .eq('user_id', sessionUser.id)
    .single()

  if (!ticket) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: replies } = await (supabase as any)
    .from('support_ticket_replies')
    .select('id, author_role, content, created_at')
    .eq('ticket_id', id)
    .order('created_at', { ascending: true })

  return NextResponse.json({ ticket, replies: replies || [] })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  let sessionUser: any
  try {
    const { session } = await getCurrentUser()
    sessionUser = session.user
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { content } = await req.json()
  if (!content?.trim()) {
    return NextResponse.json({ error: 'Content required' }, { status: 400 })
  }

  const supabase = await createServerClient()

  // Verify ticket belongs to user
  const { data: ticket } = await (supabase as any)
    .from('support_tickets')
    .select('id')
    .eq('id', id)
    .eq('user_id', sessionUser.id)
    .single()

  if (!ticket) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: reply, error } = await (supabase as any)
    .from('support_ticket_replies')
    .insert({
      ticket_id: id,
      author_id: sessionUser.id,
      author_role: 'user',
      content: content.trim(),
    })
    .select('id, author_role, content, created_at')
    .single()

  if (error) {
    console.error('Error creating reply:', error)
    return NextResponse.json({ error: 'Error creating reply' }, { status: 500 })
  }

  return NextResponse.json({ reply })
}
