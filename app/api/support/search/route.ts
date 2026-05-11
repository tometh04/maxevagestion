import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { searchArticles } from '@/lib/support/kb'

export async function GET(req: NextRequest) {
  try {
    // Auth check — solo usuarios logueados pueden buscar
    await getCurrentUser()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const results = await searchArticles(q)
  return NextResponse.json({ results })
}
