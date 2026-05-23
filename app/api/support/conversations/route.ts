import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'

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
    .from('support_conversations')
    .select(`
      id, title, status, created_at, updated_at,
      support_messages ( id, role, content, created_at )
    `)
    .eq('user_id', sessionUser.id)
    .order('updated_at', { ascending: false })
    .limit(20)

  if (error) {
    console.error('Error fetching conversations:', error)
    return NextResponse.json({ error: 'Error fetching conversations' }, { status: 500 })
  }

  const conversations = (data || []).map((c: any) => {
    const msgs = c.support_messages || []
    const lastMsg = msgs.sort((a: any, b: any) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0]
    return {
      id: c.id,
      title: c.title,
      status: c.status,
      created_at: c.created_at,
      updated_at: c.updated_at,
      message_count: msgs.length,
      last_message: lastMsg ? {
        role: lastMsg.role,
        content: lastMsg.content.slice(0, 100),
        created_at: lastMsg.created_at,
      } : null,
    }
  })

  return NextResponse.json({ conversations })
}
