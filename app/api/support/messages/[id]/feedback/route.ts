import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await getCurrentUser()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  let body: { feedback: 'positive' | 'negative' | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (body.feedback !== null && body.feedback !== 'positive' && body.feedback !== 'negative') {
    return NextResponse.json({ error: 'Invalid feedback value' }, { status: 400 })
  }

  const supabase = await createServerClient()
  const { error } = await (supabase as any)
    .from('support_messages')
    .update({ feedback: body.feedback })
    .eq('id', id)

  if (error) {
    console.error('Error updating feedback:', error)
    return NextResponse.json({ error: 'Error updating feedback' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
