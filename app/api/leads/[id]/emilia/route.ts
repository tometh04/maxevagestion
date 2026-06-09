// app/api/leads/[id]/emilia/route.ts
import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import { getOrgFeatureFlag } from "@/lib/settings/org-features"
import { FEATURE_FLAG_LEAD_EMILIA_CHAT, isLeadEmiliaChatBetaUser } from "@/lib/feature-flags"
import {
  buildFallbackPrompt,
  type LeadInput,
} from "@/lib/emilia/lead-context"
import { fetchListPrompt } from "@/lib/emilia/list-prompt"

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
  // Beta CERRADA: solo el/los usuario(s) allowlisteado(s), además del flag de org.
  if (!isLeadEmiliaChatBetaUser(user.email)) {
    return NextResponse.json(
      { error: "Feature en beta — no disponible para tu usuario" },
      { status: 403 }
    )
  }

  const supabase = (await createServerClient()) as any

  // Perf: beta gate + validación del lead en paralelo (queries independientes).
  const [flagOn, leadRes] = await Promise.all([
    getOrgFeatureFlag(supabase, user.org_id, FEATURE_FLAG_LEAD_EMILIA_CHAT),
    supabase
      .from("leads")
      .select("id, agency_id, agencies!inner(org_id)")
      .eq("id", leadId)
      .maybeSingle(),
  ])
  if (!flagOn) {
    return NextResponse.json(
      { error: "Feature en beta — no disponible para tu organización" },
      { status: 403 }
    )
  }
  // Multi-tenant defense: validar que el lead pertenece a la org del user
  const lead = leadRes.data
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
  // Beta CERRADA: solo el/los usuario(s) allowlisteado(s), además del flag de org.
  if (!isLeadEmiliaChatBetaUser(user.email)) {
    return NextResponse.json(
      { error: "Feature en beta — no disponible para tu usuario" },
      { status: 403 }
    )
  }

  const supabase = (await createServerClient()) as any

  // Perf: beta gate + datos del lead en paralelo (queries independientes).
  const [flagOn, leadRes] = await Promise.all([
    getOrgFeatureFlag(supabase, user.org_id, FEATURE_FLAG_LEAD_EMILIA_CHAT),
    supabase
      .from("leads")
      .select("id, contact_name, destination, region, notes, list_name, agency_id, agencies!inner(org_id)")
      .eq("id", leadId)
      .maybeSingle(),
  ])
  if (!flagOn) {
    return NextResponse.json(
      { error: "Feature en beta — no disponible para tu organización" },
      { status: 403 }
    )
  }
  // Multi-tenant defense + obtener datos del lead para el prompt
  const lead = leadRes.data
  if (!lead || (lead as any).agencies?.org_id !== user.org_id) {
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

  // Perf: NO bloqueamos la creación de la conversación con la llamada a
  // gpt-4o-mini (agregaba ~1.5-2s al loading del chat). Devolvemos el prompt
  // fallback determinístico al instante; el front pide el prompt mejorado por
  // gpt en background vía GET .../emilia/suggested-prompt y lo aplica solo si
  // el usuario todavía no escribió.
  const suggestedPrompt = buildFallbackPrompt(leadInput)

  return NextResponse.json({
    conversation_id: conversationId,
    suggested_prompt: suggestedPrompt,
  })
}
