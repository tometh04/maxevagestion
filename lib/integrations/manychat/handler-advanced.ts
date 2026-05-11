import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import {
  resolveTagAssignments,
  type ManychatLeadPayload,
} from "@/lib/integrations/tag-resolver"

export type AdvancedLeadInput = ManychatLeadPayload & {
  name: string
  phone: string
  email?: string | null
  manychat_user_id?: string | null
  callbell_contact_uuid?: string | null
  notes?: string | null
}

export type HandlerResult = {
  lead_id: string
  created: boolean
  tags_assigned: number
}

/**
 * Crea o actualiza un lead en crm_mode='advanced' a partir de un payload de ManyChat.
 *
 * Comportamiento:
 * - Busca lead existente por (agency_id, contact_phone). Si encuentra → append a notes.
 * - Si no existe → crea uno nuevo con funnel_id = default funnel, tags resueltas,
 *   region/destination con placeholders (la vendedora completa después).
 *
 * Llamado desde POST /api/integrations/manychat/[token]/webhook cuando org.crm_mode === 'advanced'.
 */
export async function handleManychatAdvancedLead(
  admin: SupabaseClient<Database>,
  orgId: string,
  agencyId: string,
  input: AdvancedLeadInput
): Promise<HandlerResult> {
  // 1. Funnel default para esta org
  const { data: funnel, error: funnelErr } = await admin
    .from("lead_funnels")
    .select("id")
    .eq("org_id", orgId)
    .eq("is_default_new", true)
    .maybeSingle()
  if (funnelErr) throw funnelErr
  if (!funnel) {
    throw new Error(
      `Org ${orgId} en crm_mode='advanced' sin funnel default — corré el seed antes`
    )
  }
  const funnelId = (funnel as { id: string }).id

  // 2. Dedupe por (agency_id, contact_phone)
  const { data: existing } = await admin
    .from("leads")
    .select("id, notes")
    .eq("agency_id", agencyId)
    .eq("contact_phone", input.phone)
    .maybeSingle()

  const stamp = `[${new Date().toISOString()} · ManyChat]\n${input.notes ?? "(primer contacto)"}\n`

  if (existing) {
    const e = existing as { id: string; notes: string | null }
    const newNotes = `${e.notes ?? ""}\n${stamp}`.trim()
    const { error: updErr } = await admin
      .from("leads")
      .update({ notes: newNotes } as never)
      .eq("id", e.id)
    if (updErr) throw updErr
    return { lead_id: e.id, created: false, tags_assigned: 0 }
  }

  // 3. Crear lead nuevo. region/destination siguen NOT NULL en advanced (pa no romper queries legacy)
  // → usamos placeholders.
  const { data: created, error: createErr } = await admin
    .from("leads")
    .insert({
      org_id: orgId,
      agency_id: agencyId,
      source: "Manychat",
      status: "NEW",
      region: "OTROS",
      destination: input.destination_text || "A definir",
      contact_name: input.name,
      contact_phone: input.phone,
      contact_email: input.email ?? null,
      funnel_id: funnelId,
      notes: stamp,
    } as never)
    .select("id")
    .single()
  if (createErr) throw createErr
  const leadId = (created as { id: string }).id

  // 4. Asignar tags resueltas
  const tagAssignments = await resolveTagAssignments(admin, orgId, input)
  if (tagAssignments.length > 0) {
    const rows = tagAssignments.map((t) => ({
      lead_id: leadId,
      tag_id: t.tag_id,
      org_id: orgId,
    }))
    const { error: tagErr } = await admin
      .from("lead_tag_assignments")
      .insert(rows as never)
    if (tagErr) throw tagErr
  }

  return {
    lead_id: leadId,
    created: true,
    tags_assigned: tagAssignments.length,
  }
}
