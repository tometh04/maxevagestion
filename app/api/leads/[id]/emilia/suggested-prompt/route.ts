// app/api/leads/[id]/emilia/suggested-prompt/route.ts
import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import {
  buildFallbackPrompt,
  buildOpenAIInstructions,
  type LeadInput,
} from "@/lib/emilia/lead-context"
import { fetchListPrompt } from "@/lib/emilia/list-prompt"
import {
  canAccessEmiliaLeadAgency,
  resolveLeadEmiliaAccess,
} from "@/lib/emilia/access"

export const dynamic = "force-dynamic"

/**
 * GET /api/leads/[id]/emilia/suggested-prompt
 *
 * Devuelve un prompt sugerido MEJORADO por gpt-4o-mini (parsea lead.notes para
 * inferir pasajeros/fechas), con fallback determinístico si OpenAI falla.
 *
 * Perf: este endpoint se llama en BACKGROUND desde el chat para NO bloquear el
 * render. La creación de la conversación (POST .../emilia) ya devuelve el
 * fallback al instante; el front reemplaza el input con este prompt mejorado
 * solo si el usuario todavía no escribió nada.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: leadId } = await params
  const { user } = await getCurrentUser()
  if (!user.org_id) {
    return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
  }

  const supabase = (await createServerClient()) as any
  const access = await resolveLeadEmiliaAccess(supabase, user)
  if (!access.allowed) {
    return NextResponse.json(
      { error: access.message, code: access.code },
      { status: access.status }
    )
  }

  // Multi-tenant defense: el lead debe pertenecer a la org del user.
  const { data: lead } = await supabase
    .from("leads")
    .select("contact_name, destination, region, notes, list_name, agency_id")
    .eq("id", leadId)
    .eq("org_id", user.org_id)
    .maybeSingle()
  if (!lead || !canAccessEmiliaLeadAgency(access, (lead as any).agency_id)) {
    return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 })
  }

  // Prompt de la columna del Kanban donde está el lead → se suma al prompt sugerido
  const listPrompt = await fetchListPrompt(
    supabase,
    (lead as any).agency_id,
    (lead as any).list_name,
    (lead as any).region
  )

  const leadInput: LeadInput = {
    contact_name: (lead as any).contact_name,
    destination: (lead as any).destination,
    region: (lead as any).region,
    notes: (lead as any).notes,
    list_prompt: listPrompt,
  }

  const prompt = await generateSuggestedPrompt(leadInput)
  return NextResponse.json({ prompt })
}

async function generateSuggestedPrompt(lead: LeadInput): Promise<string> {
  const fallback = buildFallbackPrompt(lead)
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return fallback

  const { system, user } = buildOpenAIInstructions(lead)
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000) // 8s timeout
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.2,
        max_tokens: 200,
      }),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (!res.ok) {
      console.warn("OpenAI parser non-OK:", res.status)
      return fallback
    }
    const json = await res.json()
    const text = json?.choices?.[0]?.message?.content?.trim()
    return text && text.length > 0 ? text : fallback
  } catch (err: any) {
    console.warn("OpenAI parser failed, using fallback:", err?.message || err)
    return fallback
  }
}
