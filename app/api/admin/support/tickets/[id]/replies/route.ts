import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { isPlatformAdmin } from '@/lib/auth/platform'
import { createLinearComment } from '@/lib/integrations/linear'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { user } = await getCurrentUser()
  const supabase = await createServerClient()

  if (!(await isPlatformAdmin(supabase, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()

  const { data: ticket } = await (admin as any)
    .from('support_tickets')
    .select('id, subject, description, status, created_at, updated_at, user_id, org_id, category, severity, priority, ai_rationale, linear_issue_url, linear_identifier, attachments')
    .eq('id', id)
    .single()

  if (!ticket) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Get user email
  const { data: userData } = await (admin as any)
    .from('users')
    .select('email, full_name')
    .eq('auth_id', ticket.user_id)
    .single()

  // Get org name
  let orgName = null
  if (ticket.org_id) {
    const { data: org } = await (admin as any)
      .from('organizations')
      .select('name')
      .eq('id', ticket.org_id)
      .single()
    orgName = org?.name
  }

  const { data: replies } = await (admin as any)
    .from('support_ticket_replies')
    .select('id, author_id, author_role, author_name, source, content, created_at')
    .eq('ticket_id', id)
    .order('created_at', { ascending: true })

  return NextResponse.json({
    ticket: {
      ...ticket,
      user_email: userData?.email || ticket.user_id,
      user_name: userData?.full_name || null,
      org_name: orgName,
    },
    replies: replies || [],
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { user, session } = await getCurrentUser()
  const supabase = await createServerClient()

  if (!(await isPlatformAdmin(supabase, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { content } = await req.json()
  if (!content?.trim()) {
    return NextResponse.json({ error: 'Content required' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: reply, error } = await (admin as any)
    .from('support_ticket_replies')
    .insert({
      ticket_id: id,
      author_id: session.user.id,
      author_role: 'admin',
      content: content.trim(),
    })
    .select('id, author_role, content, created_at')
    .single()

  if (error) {
    console.error('Error creating admin reply:', error)
    return NextResponse.json({ error: 'Error creating reply' }, { status: 500 })
  }

  // Mark ticket as in_progress if it was open
  await (admin as any)
    .from('support_tickets')
    .update({ status: 'in_progress' })
    .eq('id', id)
    .eq('status', 'open')

  // Two-way: replicar la respuesta de soporte como comentario en Linear.
  // Best-effort, no bloquea la respuesta.
  try {
    const { data: ticket } = await (admin as any)
      .from('support_tickets')
      .select('linear_issue_id')
      .eq('id', id)
      .single()
    if (ticket?.linear_issue_id) {
      const author = user?.name || 'Soporte'
      await createLinearComment(
        ticket.linear_issue_id,
        `**${author}** (soporte) respondió:\n\n${content.trim()}`,
      )
    }
  } catch (err) {
    console.error('Error posteando comentario en Linear (no bloqueante):', err)
  }

  return NextResponse.json({ reply })
}
