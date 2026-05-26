import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'
import { searchArticles, getAllArticles } from '@/lib/support/kb'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
})

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const SYSTEM_PROMPT = `Sos el asistente de soporte de Vibook, un sistema de gestión integral para agencias de viajes argentinas.

Tu objetivo es AYUDAR al usuario a resolver su duda. Siempre intentá dar una respuesta útil.

REGLAS:
1. Respondé siempre en español argentino, de forma simple y directa. Los usuarios son empleados de agencias de viajes, no técnicos.
2. Basá tus respuestas en los artículos de ayuda que te proporciono como contexto.
3. Si la pregunta se relaciona con algún artículo aunque no sea exacto, usá esa información para responder lo mejor posible. Por ejemplo, si preguntan "cómo creo una factura", buscá artículos sobre facturación, AFIP, o contabilidad.
4. Usá pasos numerados cuando expliques un proceso.
5. Sé conciso pero completo — no más de 4-5 párrafos por respuesta.
6. Si el usuario te saluda, respondé con un saludo breve y preguntá en qué podés ayudar.
7. Si una pregunta es ambigua, intentá responder con la interpretación más probable y mencioná alternativas.
8. Solo si REALMENTE no tenés ninguna información relacionada con la pregunta, decí: "No encontré información específica sobre eso. Te recomiendo contactar a soporte."
9. Podés usar emojis moderadamente para hacer la respuesta más amigable.
10. NUNCA respondas sobre temas que no sean el sistema Vibook.`

export async function POST(req: NextRequest) {
  let sessionUser: any
  let appUser: any
  try {
    const auth = await getCurrentUser()
    sessionUser = auth.session?.user
    appUser = auth.user
  } catch {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!process.env.OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'OPENAI_API_KEY not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  let body: { message: string; history?: ChatMessage[]; conversationId?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { message, history = [], conversationId: incomingConvId } = body
  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: 'Message required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // ── Persistencia: crear/reusar conversación ──────────────────────
  const supabase = await createServerClient()
  let activeConvId = incomingConvId

  try {
    if (!activeConvId) {
      const title = message.slice(0, 80)
      const { data: conv } = await (supabase as any)
        .from('support_conversations')
        .insert({
          user_id: sessionUser?.id || appUser?.auth_id,
          org_id: appUser?.org_id,
          title,
          status: 'active',
        })
        .select('id')
        .single()
      if (conv) activeConvId = conv.id
    }

    if (activeConvId) {
      await (supabase as any).from('support_messages').insert({
        conversation_id: activeConvId,
        role: 'user',
        content: message,
      })
    }
  } catch (err) {
    console.error('Error persisting conversation:', err)
  }

  // ── RAG: buscar artículos relevantes ─────────────────────────────
  let contextArticles = ''
  try {
    const searchResults = await searchArticles(message)

    if (searchResults.length > 0) {
      const { createServerClient } = await import('@/lib/supabase/server')
      const supabase = await createServerClient()
      const slugs = searchResults.slice(0, 5).map((r) => r.slug)
      const { data: articles } = await (supabase as any)
        .from('kb_articles')
        .select('title, content, slug')
        .in('slug', slugs)

      if (articles?.length) {
        contextArticles = articles
          .map((a: any) => `### ${a.title}\n${a.content}`)
          .join('\n\n---\n\n')
      }
    }

    // Fallback: si no hay resultados FTS, mandar resumen de todos
    if (!contextArticles) {
      const all = await getAllArticles()
      if (all.length > 0) {
        contextArticles = all
          .slice(0, 15)
          .map((a) => `### ${a.title}\n${a.content}`)
          .join('\n\n---\n\n')
      }
    }
  } catch (err) {
    console.error('Error fetching KB articles for RAG:', err)
  }

  // ── Construir mensajes para OpenAI ───────────────────────────────
  const systemContent = contextArticles
    ? `${SYSTEM_PROMPT}\n\n---\n\nARTÍCULOS DE AYUDA DISPONIBLES:\n\n${contextArticles}`
    : SYSTEM_PROMPT

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemContent },
    ...history.slice(-10).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: message },
  ]

  // ── Stream response ──────────────────────────────────────────────
  try {
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1024,
      stream: true,
      messages,
    })

    let fullResponse = ''
    const readableStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content
            if (text) {
              fullResponse += text
              controller.enqueue(encoder.encode(text))
            }
          }
          controller.close()

          if (activeConvId && fullResponse) {
            (supabase as any)
              .from('support_messages')
              .insert({
                conversation_id: activeConvId,
                role: 'assistant',
                content: fullResponse,
              })
              .then(() => {})
              .catch((e: any) => console.error('Error saving assistant msg:', e))
          }
        } catch (err) {
          console.error('Stream error:', err)
          controller.error(err)
        }
      },
    })

    const headers: Record<string, string> = {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Transfer-Encoding': 'chunked',
    }
    if (activeConvId) {
      headers['X-Conversation-Id'] = activeConvId
    }

    return new Response(readableStream, { headers })
  } catch (err) {
    console.error('OpenAI API error:', err)
    return new Response(
      JSON.stringify({ error: 'Error al procesar tu consulta' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
