/**
 * Sync handler de Eve: dado un payload normalizado + org_id + agency_id,
 * hace upsert idempotente del lead en BD usando (org_id, eve_session_id)
 * como clave de dedup.
 *
 * Asume que el caller ya:
 * - Validó el webhook_token y obtuvo el org_id del lookup de org_integrations
 * - (Opcional) verificó la firma HMAC
 * - Adaptó el payload con adaptEvePayload()
 * - Registró el evento en webhook_event_log (idempotencia de evento)
 *
 * TODO: regenerar types tras aplicar migración 130 (eve_session_id, eve_full_data)
 */

import type { NormalizedEveLead } from "./payload-adapter"
import {
  normalizeInstagram,
  normalizeRegion,
  determineListName,
  type ManychatLeadData,
} from "@/lib/manychat/sync"

export interface EveSyncResult {
  action: "created" | "updated"
  lead_id: string
}

/**
 * Construye el campo `notes` del lead a partir del payload normalizado.
 * Formato consistente con Chatsell para que el UI no tenga que diferenciar.
 */
function buildEveLeadNotes(n: NormalizedEveLead): string {
  const lines: string[] = []
  lines.push(`🤖 Lead capturado por Eve (${n.estado === "listo_para_cotizar" ? "✅ listo para cotizar" : "⏳ incompleto"})`)

  const v = n.vuelo
  if (v.origen) lines.push(`🛫 Origen: ${v.origen}`)
  if (v.destino) lines.push(`📍 Destino: ${v.destino}`)
  if (v.fecha_ida) lines.push(`📅 Ida: ${v.fecha_ida}`)
  if (v.fecha_vuelta) lines.push(`📅 Vuelta: ${v.fecha_vuelta}`)
  if (v.fechas_flexibles) lines.push(`🔄 Fechas flexibles`)
  if (v.clase) lines.push(`💺 Clase: ${v.clase}`)
  if (v.vuelo_directo !== undefined) lines.push(`✈️ Vuelo directo: ${v.vuelo_directo ? "sí" : "no"}`)
  if (v.equipaje !== undefined) lines.push(`🧳 Equipaje: ${v.equipaje ? "sí" : "no"}`)

  if (v.pasajeros) {
    const p = v.pasajeros
    const partes: string[] = []
    if (p.adultos) partes.push(`${p.adultos} adulto${p.adultos !== 1 ? "s" : ""}`)
    if (p.ninos) partes.push(`${p.ninos} niño${p.ninos !== 1 ? "s" : ""}`)
    if (p.infantes) partes.push(`${p.infantes} infante${p.infantes !== 1 ? "s" : ""}`)
    if (partes.length) lines.push(`👥 Pasajeros: ${partes.join(", ")}`)
    if (p.edades_menores?.length) lines.push(`👶 Edades menores: ${p.edades_menores.join(", ")}`)
  }

  if (v.presupuesto) lines.push(`💰 Presupuesto: ${v.presupuesto}`)
  if (v.motivo) lines.push(`🎯 Motivo: ${v.motivo}`)
  if (n.notas) lines.push(`📝 ${n.notas}`)

  return lines.join("\n")
}

/**
 * Crea o actualiza el lead. Usa admin client (bypassea RLS porque
 * el webhook no tiene user logueado).
 *
 * Dedup: busca lead existente por (org_id, eve_session_id). Si existe,
 * hace UPDATE; si no, INSERT.
 *
 * Aislamiento multi-tenant: org_id y agency_id provienen SIEMPRE del
 * lookup de org_integrations del token — NUNCA del body del webhook.
 */
export async function processEveLead(
  admin: any,
  orgId: string,
  agencyId: string,
  normalized: NormalizedEveLead
): Promise<EveSyncResult> {
  // 1. Buscar lead existente por (org_id, eve_session_id) — incluye status y
  //    notes para el UPDATE selectivo (I2: no pisar status avanzado; I3: append notas)
  const { data: existing } = await admin
    .from("leads")
    .select("id, status, notes")
    .eq("org_id", orgId)
    .eq("eve_session_id", normalized.session_id)
    .maybeSingle()

  // 2. Mapear campos comunes
  const contactName =
    normalized.contacto.nombre?.trim() ||
    normalized.contacto.telefono?.trim() ||
    "Sin nombre"

  const destination = normalized.vuelo.destino?.trim() || "Sin destino"

  // region: usa la del payload si es válida; si no, infiere del destino
  const region = normalizeRegion(normalized.vuelo.region, normalized.vuelo.destino)

  // contact_instagram: solo si el canal es instagram
  const contactInstagram =
    normalized.canal_tipo === "instagram"
      ? normalizeInstagram(normalized.contacto_externo)
      : null

  const status = normalized.estado === "listo_para_cotizar" ? "IN_PROGRESS" : "NEW"
  const notes = buildEveLeadNotes(normalized)

  // list_name: determinado por región/destino/canal (reuso helper de Manychat)
  // Para canal whatsapp pasamos el teléfono para que detectRegionList infiera la región.
  const manychatData: ManychatLeadData = {
    destino: destination !== "Sin destino" ? destination : undefined,
    region: normalized.vuelo.region,
    whatsapp: normalized.canal_tipo !== "instagram"
      ? normalized.contacto.telefono?.trim() || undefined
      : undefined,
  }
  const listName = determineListName(manychatData)

  let leadId: string
  let action: "created" | "updated"

  if (existing) {
    // UPDATE — no pisar status si el vendedor ya avanzó el lead (I2)
    const shouldUpdateStatus =
      existing.status === "NEW" || existing.status === "IN_PROGRESS"

    // Conservar notas previas del vendedor; agregar bloque de actualización (I3)
    const updatedNotes = existing.notes
      ? `${existing.notes}\n\n--- Update Eve ${new Date().toISOString()} ---\n${notes}`
      : notes

    const updatePayload: Record<string, any> = {
      contact_name: contactName,
      contact_phone: normalized.contacto.telefono?.trim() || "",
      contact_email: normalized.contacto.email?.trim() || null,
      contact_instagram: contactInstagram,
      destination,
      region,
      list_name: listName,
      eve_full_data: normalized.raw_payload,
      notes: updatedNotes,
      updated_at: new Date().toISOString(),
    }
    if (shouldUpdateStatus) updatePayload.status = status

    const { error: updateErr } = await admin
      .from("leads")
      .update(updatePayload)
      .eq("id", existing.id)
      .eq("org_id", orgId) // Cross-tenant fix: filtro explícito, no confiar en RLS

    if (updateErr) {
      throw new Error(`Failed to update Eve lead: ${updateErr.message}`)
    }

    leadId = existing.id
    action = "updated"
  } else {
    // INSERT — aislamiento multi-tenant: org_id y agency_id provienen del
    // parámetro, NUNCA del body del webhook (ver regla CLAUDE.md §1 multi-tenant)
    const insertPayload: Record<string, any> = {
      org_id: orgId,
      agency_id: agencyId,
      source: "Eve",
      status,
      region,
      destination,
      list_name: listName,
      contact_name: contactName,
      contact_phone: normalized.contacto.telefono?.trim() || "",
      contact_email: normalized.contacto.email?.trim() || null,
      contact_instagram: contactInstagram,
      assigned_seller_id: null,
      notes,
      eve_session_id: normalized.session_id,
      eve_full_data: normalized.raw_payload,
    }

    const { data: inserted, error: insertErr } = await admin
      .from("leads")
      .insert(insertPayload)
      .select("id")
      .single()

    if (insertErr || !inserted) {
      throw new Error(`Failed to insert Eve lead: ${insertErr?.message || "unknown"}`)
    }

    leadId = inserted.id
    action = "created"
  }

  return { action, lead_id: leadId }
}
