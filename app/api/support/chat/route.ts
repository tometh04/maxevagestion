import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { searchArticles, getAllArticles } from '@/lib/support/kb'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
})

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const SYSTEM_PROMPT = `Sos el asistente de soporte de Vibook, un sistema de gestión para agencias de viajes.

REGLAS ESTRICTAS:
1. SOLO respondés preguntas sobre el uso del sistema Vibook. No respondas sobre otros temas.
2. Basá tus respuestas EXCLUSIVAMENTE en los artículos de ayuda que te proporciono como contexto.
3. Si no tenés la información para responder, decí: "No tengo esa información en la base de conocimientos. Te recomiendo contactar a soporte por WhatsApp."
4. Respondé siempre en español argentino, de forma simple y directa. Los usuarios son empleados de agencias de viajes, no técnicos.
5. Usá pasos numerados cuando expliques un proceso.
6. Sé conciso — no más de 3-4 párrafos por respuesta.
7. Si el usuario te saluda, respondé con un saludo breve y preguntá en qué podés ayudar.
8. NUNCA inventes funcionalidades que no estén en los artículos.
9. Si una pregunta es ambigua, pedí aclaración.
10. Podés usar emojis moderadamente para hacer la respuesta más amigable.`

export async function POST(req: NextRequest) {
  try {
    await getCurrentUser()
  } catch {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  let body: { message: string; history?: ChatMessage[] }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { message, history = [] } = body
  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: 'Message required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // ── RAG: buscar artículos relevantes ─────────────────────────────
  let contextArticles = ''
  try {
    // Intentar FTS primero
    const searchResults = await searchArticles(message)

    if (searchResults.length > 0) {
      // Tenemos resultados de búsqueda — cargar contenido completo
      const { createServerClient } = await import('@/lib/supabase/server')
      const supabase = await createServerClient()
      const slugs = searchResults.slice(0, 5).map((r) => r.slug)
      const { data: articles } = await (supabase as any)
        .from('kb_articles')
        .select('title, content, slug')
        .in('slug', slugs)

      if (articles?.length) {
        contextArticles = articles
          .map(
            (a: any) =>
              `### ${a.title}\n${a.content}`
          )
          .join('\n\n---\n\n')
      }
    }

    // Fallback: si no hay resultados FTS, mandar un resumen de todos los artículos
    if (!contextArticles) {
      const all = await getAllArticles()
      if (all.length > 0) {
        contextArticles = all
          .slice(0, 15) // máximo 15 para no volar el context
          .map((a) => `### ${a.title}\n${a.content}`)
          .join('\n\n---\n\n')
      }
    }
  } catch (err) {
    console.error('Error fetching KB articles for RAG:', err)
  }

  // ── Construir mensajes para Claude ───────────────────────────────
  const systemContent = contextArticles
    ? `${SYSTEM_PROMPT}\n\n---\n\nARTÍCULOS DE AYUDA DISPONIBLES:\n\n${contextArticles}`
    : SYSTEM_PROMPT

  const messages: Anthropic.MessageParam[] = [
    // Últimos 10 mensajes del historial (para no volar contexto)
    ...history.slice(-10).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: message },
  ]

  // ── Stream response ──────────────────────────────────────────────
  try {
    const stream = anthropic.messages.stream({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      system: systemContent,
      messages,
    })

    // Convertir a ReadableStream para Next.js
    const readableStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        try {
          for await (const event of stream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              controller.enqueue(encoder.encode(event.delta.text))
            }
          }
          controller.close()
        } catch (err) {
          console.error('Stream error:', err)
          controller.error(err)
        }
      },
    })

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Transfer-Encoding': 'chunked',
      },
    })
  } catch (err) {
    console.error('Anthropic API error:', err)
    return new Response(
      JSON.stringify({ error: 'Error al procesar tu consulta' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
