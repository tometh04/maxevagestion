/**
 * Sync handler de Chatsell: dado un payload normalizado + org_id +
 * agency_id, crea o actualiza el lead en BD, aplica tags y guarda
 * el payload completo para auditoría.
 *
 * Asume que el caller ya:
 * - Validó el webhook_token y obtuvo el org_id
 * - (Opcional) verificó la firma HMAC
 * - Adaptó el payload con adaptChatsellPayload()
 */

import type { NormalizedChatsellLead } from "./payload-adapter"
import { buildLeadNotes } from "./payload-adapter"

export interface ChatsellSyncResult {
  action: "created" | "updated"
  lead_id: string
}

/**
 * Crea o actualiza el lead. Usa admin client (bypassea RLS porque
 * el webhook no tiene user logueado).
 *
 * Dedup: busca lead existente con mismo (org_id, agency_id) y mismo
 * teléfono O instagram. Si encuentra, actualiza. Si no, inserta.
 */
export async function processChatsellLead(
  admin: any,
  orgId: string,
  agencyId: string,
  normalized: NormalizedChatsellLead
): Promise<ChatsellSyncResult> {
  const notes = buildLeadNotes(normalized)

  // 1. Buscar lead existente para dedup
  let existing: { id: string } | null = null

  if (normalized.contact_phone) {
    const { data } = await admin
      .from("leads")
      .select("id")
      .eq("org_id", orgId)
      .eq("agency_id", agencyId)
      .eq("contact_phone", normalized.contact_phone)
      .is("archived_at", null)
      .limit(1)
      .maybeSingle()
    existing = data || null
  }

  if (!existing && normalized.contact_instagram) {
    const { data } = await admin
      .from("leads")
      .select("id")
      .eq("org_id", orgId)
      .eq("agency_id", agencyId)
      .eq("contact_instagram", normalized.contact_instagram)
      .is("archived_at", null)
      .limit(1)
      .maybeSingle()
    existing = data || null
  }

  let leadId: string
  let action: "created" | "updated"

  if (existing) {
    // UPDATE — actualizar campos relevantes sin pisar lo que el vendedor
    // ya editó manualmente (nombre, status si ya pasó de NEW).
    const { data: current } = await admin
      .from("leads")
      .select("status, notes")
      .eq("id", existing.id)
      .single()

    const shouldUpdateStatus =
      !current?.status || current.status === "NEW"

    const updatePayload: Record<string, any> = {
      contact_email: normalized.contact_email,
      destination: normalized.destination,
      region: normalized.region,
      chatsell_full_data: normalized.raw_payload,
      notes: current?.notes
        ? `${current.notes}\n\n--- Update Chatsell ${new Date().toISOString()} ---\n${notes}`
        : notes,
      updated_at: new Date().toISOString(),
    }
    if (shouldUpdateStatus) updatePayload.status = normalized.initial_status

    const { error: updateErr } = await admin
      .from("leads")
      .update(updatePayload)
      .eq("id", existing.id)
      .eq("org_id", orgId)

    if (updateErr) {
      throw new Error(`Failed to update lead: ${updateErr.message}`)
    }

    leadId = existing.id
    action = "updated"
  } else {
    // INSERT
    const { data: inserted, error: insertErr } = await admin
      .from("leads")
      .insert({
        org_id: orgId,
        agency_id: agencyId,
        source: "Chatsell",
        status: normalized.initial_status,
        region: normalized.region,
        destination: normalized.destination,
        contact_name: normalized.contact_name,
        contact_phone: normalized.contact_phone,
        contact_email: normalized.contact_email,
        contact_instagram: normalized.contact_instagram,
        assigned_seller_id: null,
        notes,
        chatsell_full_data: normalized.raw_payload,
      })
      .select("id")
      .single()

    if (insertErr || !inserted) {
      throw new Error(`Failed to insert lead: ${insertErr?.message || "unknown"}`)
    }

    leadId = inserted.id
    action = "created"
  }

  // Nota: NO aplicamos tags acá. lead_tags tiene un schema con
  // category_id FK obligatoria + label + color_override (no name/color),
  // y solo aplica a tenants en CRM advanced mode. Para Chatsell, la
  // calidad ya está visible para el vendedor en:
  //   - notes (texto estructurado con "🔥 caliente" / "❄️ frío")
  //   - status (IN_PROGRESS para caliente, NEW para frío)
  //   - chatsell_full_data.calidad (raw para queries / dashboards)
  // Si en el futuro el tenant quiere tags automáticos, hacemos otra
  // iteración acoplada al estado de lead_tag_categories de ese tenant.

  return { action, lead_id: leadId }
}
