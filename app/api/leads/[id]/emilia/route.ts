// app/api/leads/[id]/emilia/route.ts
import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getOrgFeatureFlag } from "@/lib/settings/org-features"
import { FEATURE_FLAG_LEAD_EMILIA_CHAT } from "@/lib/feature-flags"
import {
  buildFallbackPrompt,
  buildOpenAIInstructions,
  type LeadInput,
} from "@/lib/emilia/lead-context"

export const dynamic = "force-dynamic"

/**
 * GET /api/leads/[id]/emilia
 * Devuelve la conversación activa vinculada al lead, o null si no hay.
 * 403 si la feature flag no está activa para la org del user.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: leadId } = await params
  const { user } = await getCurrentUser()
  if (!user.org_id) {
    return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
  }

  const supabase = (await createServerClient()) as any

  // Beta gate
  const flagOn = await getOrgFeatureFlag(supabase, user.org_id, FEATURE_FLAG_LEAD_EMILIA_CHAT)
  if (!flagOn) {
    return NextResponse.json(
      { error: "Feature en beta — no disponible para tu organización" },
      { status: 403 }
    )
  }

  // Multi-tenant defense: validar que el lead pertenece a la org del user
  const { data: lead } = await supabase
    .from("leads")
    .select("id, agency_id, agencies!inner(org_id)")
    .eq("id", leadId)
    .maybeSingle()
  if (!lead || (lead as any).agencies?.org_id !== user.org_id) {
    return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 })
  }

  // Buscar conversación activa del user para este lead
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, title, state, last_message_at, created_at")
    .eq("lead_id", leadId)
    .eq("user_id", user.id)
    .eq("state", "active")
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ data: conv ?? null })
}

/**
 * POST /api/leads/[id]/emilia
 * Crea (o reusa) la conversación activa vinculada al lead.
 * Devuelve { conversation_id, suggested_prompt }.
 * El suggested_prompt sale de gpt-4o-mini parseando lead.notes, con
 * fallback determinístico si OpenAI falla.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: leadId } = await params
  const { user } = await getCurrentUser()
  if (!user.org_id) {
    return NextResponse.json({ error: "Usuario sin organización asociada" }, { status: 400 })
  }

  const supabase = (await createServerClient()) as any

  // Beta gate
  const flagOn = await getOrgFeatureFlag(supabase, user.org_id, FEATURE_FLAG_LEAD_EMILIA_CHAT)
  if (!flagOn) {
    return NextResponse.json(
      { error: "Feature en beta — no disponible para tu organización" },
      { status: 403 }
    )
  }

  // Multi-tenant defense + obtener datos del lead para el prompt
  const { data: lead } = await supabase
    .from("leads")
    .select("id, contact_name, destination, region, notes, agency_id, agencies!inner(org_id)")
    .eq("id", leadId)
    .maybeSingle()
  if (!lead || (lead as any).agencies?.org_id !== user.org_id) {
    return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 })
  }

  const leadInput: LeadInput = {
    contact_name: (lead as any).contact_name,
    destination: (lead as any).destination,
    region: (lead as any).region,
    notes: (lead as any).notes,
  }

  // Reusar conversación activa si existe, sino crearla
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("lead_id", leadId)
    .eq("user_id", user.id)
    .eq("state", "active")
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  let conversationId: string
  if (existing) {
    conversationId = (existing as any).id
  } else {
    const { data: created, error: createErr } = await supabase
      .from("conversations")
      .insert({
        user_id: user.id,
        lead_id: leadId,
        title: `Cotización ${(lead as any).contact_name}`,
        state: "active",
        channel: "web",
      })
      .select("id")
      .single()
    if (createErr || !created) {
      console.error("Error creando conversación lead-emilia:", createErr?.message)
      return NextResponse.json({ error: "No se pudo crear la conversación" }, { status: 500 })
    }
    conversationId = (created as any).id
  }

  // Prompt sugerido: intentar gpt-4o-mini; si falla, fallback determinístico
  const suggestedPrompt = await generateSuggestedPrompt(leadInput)

  return NextResponse.json({
    conversation_id: conversationId,
    suggested_prompt: suggestedPrompt,
  })
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
