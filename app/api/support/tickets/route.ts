import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'
import { classifyTicket, type TicketCategory } from '@/lib/support/triage'
import {
  createLinearIssue,
  createLinearAttachment,
  mapToLinearPriority,
} from '@/lib/integrations/linear'

const VALID_TYPES: TicketCategory[] = ['bug', 'improvement', 'question']

const MAX_ATTACHMENTS = 5

type Attachment = { name: string; url: string; type: string; size: number }

/**
 * Valida los adjuntos que manda el cliente. Solo se aceptan URLs del bucket
 * público de Supabase (evita que se inyecte cualquier URL externa al issue
 * de Linear).
 */
function sanitizeAttachments(raw: unknown): Attachment[] {
  if (!Array.isArray(raw)) return []
  const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL || ''}/storage/v1/object/public/documents/`

  return raw
    .filter((a: any) =>
      a &&
      typeof a.name === 'string' &&
      typeof a.url === 'string' &&
      typeof a.type === 'string' &&
      typeof a.size === 'number' &&
      a.url.startsWith(prefix),
    )
    .slice(0, MAX_ATTACHMENTS)
    .map((a: any) => ({
      name: String(a.name).slice(0, 200),
      url: a.url,
      type: a.type,
      size: a.size,
    }))
}

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

  let body: {
    subject: string
    description?: string
    conversationId?: string
    type?: string
    attachments?: unknown
  }
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

  const attachments = sanitizeAttachments(body.attachments)

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

  // TODOS los tickets → issue en Linear ANTES del insert, para poder guardar el
  // linear_issue_id en el mismo INSERT (el UPDATE posterior pasaba por la policy
  // RLS org_id IN user_org_ids() y matcheaba 0 filas → el id nunca se persistía).
  // Incluye las consultas (category === 'question'): createLinearIssue las
  // etiqueta como "Consulta" para poder revisarlas/filtrarlas desde Linear.
  // Best-effort: nunca rompe la creación del ticket (patrón notifyApprovers).
  let linearFields: {
    linear_issue_id?: string
    linear_issue_url?: string
    linear_identifier?: string
  } = {}

  {
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
      ].join('  ·  ')

      // Adjuntos: las imágenes van embebidas para verlas inline en Linear;
      // el resto (PDFs) como link.
      const attachmentsMd = attachments.length
        ? [
            '',
            '**Adjuntos:**',
            ...attachments.map((a) =>
              a.type.startsWith('image/')
                ? `![${a.name}](${a.url})`
                : `- [${a.name}](${a.url})`,
            ),
          ].join('\n')
        : ''

      const description = [
        body.description?.trim() || '_(sin descripción)_',
        attachmentsMd,
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
        linearFields = {
          linear_issue_id: issue.id,
          linear_issue_url: issue.url,
          linear_identifier: issue.identifier,
        }

        // Además los sumamos a la sección Attachments del issue.
        for (const a of attachments) {
          await createLinearAttachment(issue.id, a.url, a.name)
        }
      }
    } catch (err) {
      console.error('Error creando issue en Linear (no bloqueante):', err)
    }
  }

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
      attachments,
      ...linearFields,
    })
    .select('id, subject, status, created_at')
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
