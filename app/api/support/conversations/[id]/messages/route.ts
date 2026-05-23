import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let sessionUser: any
  try {
    const { session } = await getCurrentUser()
    sessionUser = session.user
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const supabase = await createServerClient()

  const { data: conv } = await (supabase as any)
    .from('support_conversations')
    .select('id, user_id')
    .eq('id', id)
    .eq('user_id', sessionUser.id)
    .single()

  if (!conv) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  const { data: messages, error } = await (supabase as any)
    .from('support_messages')
    .select('id, role, content, feedback, created_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Error fetching messages:', error)
    return NextResponse.json({ error: 'Error fetching messages' }, { status: 500 })
  }

  return NextResponse.json({ messages: messages || [] })
}
