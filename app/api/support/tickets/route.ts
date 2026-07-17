import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'
import { classifyTicket, type TicketCategory } from '@/lib/support/triage'
import { createLinearIssue, mapToLinearPriority } from '@/lib/integrations/linear'

const VALID_TYPES: TicketCategory[] = ['bug', 'improvement', 'question']

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

  let body: { subject: string; description?: string; conversationId?: string; type?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.subject?.trim()) {
    return NextResponse.json({ error: 'Subject required' }, { status: 400 })
  }

  // Tipo elegido por el usuario (pista para el bot). Default: question.
  const userType: TicketCategory = VALID_TYPES.includes(body.type as TicketCategory)
    ? (body.type as TicketCategory)
    : 'question'

  const supabase = await createServerClient()

  // If conversationId provided, mark conversation as escalated
  if (body.conversationId) {
    await (supabase as any)
      .from('support_conversations')
      .update({ status: 'escalated' })
      .eq('id', body.conversationId)
      .eq('user_id', sessionUser.id)
  }

  // Bot de triage: categoría + severidad + prioridad (síncrono). Nunca lanza:
  // cae a un fallback derivado del tipo si el LLM no está disponible.
  const classification = await classifyTicket({
    subject: body.subject.trim(),
    description: body.description?.trim() || null,
    userType,
  })

  const { data: ticket, error } = await (supabase as any)
    .from('support_tickets')
    .insert({
      user_id: sessionUser.id,
      org_id: appUser.org_id || '00000000-0000-0000-0000-000000000000',
      conversation_id: body.conversationId || null,
      subject: body.subject.trim(),
      description: body.description?.trim() || null,
      category: classification.category,
      severity: classification.severity,
      priority: classification.priority,
      ai_rationale: classification.rationale,
      ai_classified_at: new Date().toISOString(),
    })
    .select('id, subject, status, created_at')
    .single()

  if (error) {
    console.error('Error creating ticket:', error)
    return NextResponse.json({ error: 'Error creating ticket' }, { status: 500 })
  }

  // Bugs y mejoras → issue en Linear para que lo ataque un desarrollador.
  // Best-effort: nunca rompe la respuesta al usuario (patrón notifyApprovers).
  if (classification.category === 'bug' || classification.category === 'improvement') {
    try {
      let orgName: string | null = null
      if (appUser.org_id) {
        const { data: org } = await (supabase as any)
          .from('organizations')
          .select('name')
          .eq('id', appUser.org_id)
          .single()
        orgName = org?.name || null
      }

      const reporter = [
        `**Reportado por:** ${appUser.email || sessionUser.id}`,
        orgName ? `**Organización:** ${orgName}` : `**Org ID:** ${appUser.org_id || '—'}`,
        `**Severidad:** ${classification.severity}`,
        `**Ticket:** ${ticket.id}`,
      ].join('  ·  ')

      const description = [
        body.description?.trim() || '_(sin descripción)_',
        '',
        '---',
        reporter,
        '',
        `_${classification.rationale}_`,
      ].join('\n')

      const issue = await createLinearIssue({
        title: body.subject.trim(),
        description,
        priority: mapToLinearPriority(classification.priority),
        category: classification.category,
        severity: classification.severity,
      })

      if (issue) {
        await (supabase as any)
          .from('support_tickets')
          .update({
            linear_issue_id: issue.id,
            linear_issue_url: issue.url,
            linear_identifier: issue.identifier,
          })
          .eq('id', ticket.id)
      }
    } catch (err) {
      console.error('Error creando issue en Linear (no bloqueante):', err)
    }
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
    .select('id, subject, description, status, created_at, updated_at')
    .eq('user_id', sessionUser.id)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    console.error('Error fetching tickets:', error)
    return NextResponse.json({ error: 'Error fetching tickets' }, { status: 500 })
  }

  return NextResponse.json({ tickets: data || [] })
}
