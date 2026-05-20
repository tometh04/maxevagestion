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

  // 2. Aplicar tag de calidad (requiere CRM advanced mode con lead_tags)
  // Si el tenant no usa lead_tags todavía, fallamos silenciosamente porque
  // la info de calidad ya está en notes + chatsell_full_data.
  try {
    await applyQualityTag(admin, orgId, leadId, normalized.quality_tag)
  } catch (tagErr) {
    console.warn(
      `[chatsell] No se pudo aplicar tag de calidad (CRM legacy?). Lead ${leadId} igual quedó creado. Detalle:`,
      tagErr
    )
  }

  return { action, lead_id: leadId }
}

/**
 * Aplica el tag de calidad al lead. Crea el tag si no existe en el org.
 * Usa lead_tags (CRM advanced mode, migration 20260508000001).
 */
async function applyQualityTag(
  admin: any,
  orgId: string,
  leadId: string,
  tagName: string
): Promise<void> {
  // 1. Buscar o crear el tag a nivel org
  let { data: tag } = await admin
    .from("lead_tags")
    .select("id")
    .eq("org_id", orgId)
    .eq("name", tagName)
    .maybeSingle()

  if (!tag) {
    const color = tagName.includes("Caliente") ? "#ef4444" : "#3b82f6" // red-500 / blue-500
    const { data: created, error: createErr } = await admin
      .from("lead_tags")
      .insert({ org_id: orgId, name: tagName, color })
      .select("id")
      .single()
    if (createErr) throw createErr
    tag = created
  }

  if (!tag) return

  // 2. Asignar tag al lead (idempotente: PK compuesto evita duplicados)
  const { error: assignErr } = await admin
    .from("lead_tag_assignments")
    .upsert(
      {
        lead_id: leadId,
        tag_id: tag.id,
        org_id: orgId,
      },
      { onConflict: "lead_id,tag_id", ignoreDuplicates: true }
    )
  if (assignErr) throw assignErr
}
