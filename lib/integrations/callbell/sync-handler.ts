import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import type { CallbellWebhookEvent } from "./types"

/**
 * Procesa un evento de Callbell entrante. Busca el lead correspondiente en Vibook
 * (por contact_phone) y aplica el cambio.
 *
 * NO crea leads — eso solo lo hace ManyChat. Si el contacto no existe en Vibook,
 * el evento se ignora silenciosamente (handled: false).
 *
 * Eventos soportados:
 * - "funnel_changed" → update leads.funnel_id
 * - "tag_added" → upsert lead_tag_assignments
 * - "tag_removed" → delete lead_tag_assignments
 * - "agent_assigned" → update leads.assigned_seller_id (lookup user by email)
 * - "message_created" → append text al notes con timestamp
 *
 * Cualquier otro event_type retorna { handled: false }.
 */
export async function processCallbellEvent(
  admin: SupabaseClient<Database>,
  orgId: string,
  event: CallbellWebhookEvent
): Promise<{ handled: boolean; lead_id?: string }> {
  const phone = event.data.contact?.phoneNumber
  if (!phone) return { handled: false }

  // Buscar lead por (org_id, contact_phone)
  const { data: lead } = await admin
    .from("leads")
    .select("id, notes")
    .eq("org_id", orgId)
    .eq("contact_phone", phone)
    .maybeSingle()
  if (!lead) return { handled: false }
  const leadId = (lead as { id: string; notes: string | null }).id

  switch (event.type) {
    case "funnel_changed": {
      const callbellFunnelUuid = event.data.funnelStage?.uuid
      if (!callbellFunnelUuid) break
      const { data: funnel } = await admin
        .from("lead_funnels")
        .select("id")
        .eq("org_id", orgId)
        .eq("callbell_funnel_uuid", callbellFunnelUuid)
        .maybeSingle()
      if (funnel) {
        await admin
          .from("leads")
          .update({ funnel_id: (funnel as { id: string }).id } as never)
          .eq("id", leadId)
      }
      break
    }

    case "tag_added": {
      const callbellTagUuid = event.data.tag?.uuid
      if (!callbellTagUuid) break
      const { data: tag } = await admin
        .from("lead_tags")
        .select("id")
        .eq("org_id", orgId)
        .eq("callbell_tag_uuid", callbellTagUuid)
        .maybeSingle()
      if (tag) {
        await admin
          .from("lead_tag_assignments")
          .upsert(
            {
              lead_id: leadId,
              tag_id: (tag as { id: string }).id,
              org_id: orgId,
            } as never,
            { onConflict: "lead_id,tag_id" }
          )
      }
      break
    }

    case "tag_removed": {
      const callbellTagUuid = event.data.tag?.uuid
      if (!callbellTagUuid) break
      const { data: tag } = await admin
        .from("lead_tags")
        .select("id")
        .eq("org_id", orgId)
        .eq("callbell_tag_uuid", callbellTagUuid)
        .maybeSingle()
      if (tag) {
        await admin
          .from("lead_tag_assignments")
          .delete()
          .eq("lead_id", leadId)
          .eq("tag_id", (tag as { id: string }).id)
      }
      break
    }

    case "agent_assigned": {
      const agentEmail = event.data.agent?.email
      if (!agentEmail) break
      const { data: user } = await admin
        .from("users")
        .select("id")
        .eq("email", agentEmail)
        .eq("org_id", orgId)
        .maybeSingle()
      if (user) {
        await admin
          .from("leads")
          .update({
            assigned_seller_id: (user as { id: string }).id,
          } as never)
          .eq("id", leadId)
      }
      break
    }

    case "message_created": {
      const text = (event.data as { message?: { text?: string } }).message?.text
      if (text) {
        const stamp = `[${new Date().toISOString()} · Callbell msg]\n${text}\n`
        const oldNotes =
          (lead as { id: string; notes: string | null }).notes ?? ""
        const newNotes = `${oldNotes}\n${stamp}`.trim()
        await admin
          .from("leads")
          .update({ notes: newNotes } as never)
          .eq("id", leadId)
      }
      break
    }

    default:
      return { handled: false, lead_id: leadId }
  }

  return { handled: true, lead_id: leadId }
}
