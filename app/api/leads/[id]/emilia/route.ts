// app/api/leads/[id]/emilia/route.ts
import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"
import {
  buildFallbackPrompt,
  type LeadInput,
} from "@/lib/emilia/lead-context"
import { fetchListPrompt } from "@/lib/emilia/list-prompt"
import {
  canAccessEmiliaLeadAgency,
  resolveLeadEmiliaAccess,
} from "@/lib/emilia/access"

export const dynamic = "force-dynamic"

/**
 * GET /api/leads/[id]/emilia
 * Devuelve la conversación activa vinculada al lead, o null si no hay.
 * Durante la promoción acceden todos los planes; luego sólo Enterprise/custom.
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

  const { data: lead } = await supabase
    .from("leads")
    .select("id, agency_id")
    .eq("id", leadId)
    .eq("org_id", user.org_id)
    .maybeSingle()

  if (!lead || !canAccessEmiliaLeadAgency(access, (lead as any).agency_id)) {
    return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 })
  }

  // Buscar conversación activa del user para este lead
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, title, state, last_message_at, created_at")
    .eq("org_id", user.org_id)
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
  const access = await resolveLeadEmiliaAccess(supabase, user)
  if (!access.allowed) {
    return NextResponse.json(
      { error: access.message, code: access.code },
      { status: access.status }
    )
  }

  const { data: lead } = await supabase
    .from("leads")
    .select("id, contact_name, destination, region, notes, list_name, agency_id")
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

  // Reusar conversación activa si existe, sino crearla
  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("org_id", user.org_id)
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
        org_id: user.org_id,
        user_id: user.id,
        lead_id: leadId,
        title: `Cotización ${(lead as any).contact_name}`,
        state: "active",
        channel: "web",
      })
      .select("id")
      .single()
    if (createErr || !created) {
      if (createErr?.code === "23505") {
        const { data: concurrentConversation } = await supabase
          .from("conversations")
          .select("id")
          .eq("org_id", user.org_id)
          .eq("lead_id", leadId)
          .eq("user_id", user.id)
          .eq("state", "active")
          .maybeSingle()
        if (concurrentConversation) {
          conversationId = (concurrentConversation as any).id
        } else {
          console.error("Conflicto creando conversación lead-emilia sin fila recuperable")
          return NextResponse.json({ error: "No se pudo crear la conversación" }, { status: 500 })
        }
      } else {
        console.error("Error creando conversación lead-emilia:", createErr?.message)
        return NextResponse.json({ error: "No se pudo crear la conversación" }, { status: 500 })
      }
    } else {
      conversationId = (created as any).id
    }
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
