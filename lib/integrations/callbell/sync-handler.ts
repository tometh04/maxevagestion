import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import type { CallbellWebhookEvent } from "./types"
import { extractBotSummary } from "./summary-extractor"

/**
 * Procesa un evento de Callbell entrante.
 *
 * MULTI-TENANT: por default solo actualiza leads existentes (comportamiento
 * original). Si la org tiene `org_integrations.config.auto_create_leads === true`
 * (que el caller debe pasar como `opts.autoCreateLeads`), entonces además CREA
 * el lead nuevo cuando el contacto (phoneNumber) NO existe en `leads` y el
 * event_type es de creación ("contact_created" o "message_created"). Esto es
 * opt-in por org: pensado para tenants Callbell-only (ej. VICO) donde no hay
 * ManyChat upstream creando leads. Para tenants con ManyChat (Lozada, etc.) la
 * flag queda en false y el comportamiento es igual que antes (solo update).
 *
 * Eventos soportados:
 * - "contact_created" → crea lead si autoCreateLeads=true (no-op si ya existe)
 * - "message_created" → crea lead si autoCreateLeads=true + append text al notes
 * - "funnel_changed" → update leads.funnel_id (solo si lead existe)
 * - "tag_added" → upsert lead_tag_assignments (solo si lead existe)
 * - "tag_removed" → delete lead_tag_assignments (solo si lead existe)
 * - "agent_assigned" → update leads.assigned_seller_id (solo si lead existe)
 *
 * Cualquier otro event_type retorna { handled: false }.
 */

const LEAD_CREATING_EVENTS = new Set(["contact_created", "message_created"])

export type ProcessCallbellEventOpts = {
  /**
   * Si true, crea leads cuando el phone no existe en BD y el event_type es
   * "contact_created" o "message_created". Default false (comportamiento legacy).
   * Activar por org via org_integrations.config.auto_create_leads.
   */
  autoCreateLeads?: boolean
}

export async function processCallbellEvent(
  admin: SupabaseClient<Database>,
  orgId: string,
  event: CallbellWebhookEvent,
  opts: ProcessCallbellEventOpts = {}
): Promise<{ handled: boolean; lead_id?: string; created?: boolean }> {
  const autoCreateLeads = opts.autoCreateLeads === true
  const phone = event.data.contact?.phoneNumber
  if (!phone) return { handled: false }

  // Buscar lead por (org_id, contact_phone)
  const { data: existing } = await admin
    .from("leads")
    .select("id, notes")
    .eq("org_id", orgId)
    .eq("contact_phone", phone)
    .maybeSingle()

  let lead = existing as { id: string; notes: string | null } | null
  let createdNow = false

  if (!lead) {
    // Lead no existe en Vibook. Crearlo SOLO si:
    //   1. La org tiene autoCreateLeads=true (opt-in multi-tenant), Y
    //   2. El event_type es de creación (contact_created / message_created)
    // Para orgs sin el flag (default), mantener comportamiento legacy: ignorar.
    if (!autoCreateLeads || !LEAD_CREATING_EVENTS.has(event.type)) {
      return { handled: false }
    }

    const contact = event.data.contact
    if (!contact?.name) {
      return { handled: false }
    }

    // Lookup primera agency de la org (la org puede tener varias; default = más vieja)
    const { data: agency } = await admin
      .from("agencies")
      .select("id")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    if (!agency) {
      console.warn(
        `[callbell-in] org=${orgId} sin agencies — no puedo crear lead para phone=${phone}`
      )
      return { handled: false }
    }
    const agencyId = (agency as { id: string }).id

    // Lookup funnel default. Puede no existir (advanced mode lo requiere, basic no).
    const { data: funnel } = await admin
      .from("lead_funnels")
      .select("id")
      .eq("org_id", orgId)
      .eq("is_default_new", true)
      .maybeSingle()
    const funnelId = funnel ? (funnel as { id: string }).id : null

    // Stamp inicial. Si el evento trae texto de mensaje, lo incluimos.
    const messageText = (event.data as { message?: { text?: string } }).message
      ?.text
    const stamp = `[${new Date().toISOString()} · Callbell - primer contacto]\n${
      messageText ?? "(sin mensaje inicial)"
    }\n`

    const { data: created, error: createErr } = await admin
      .from("leads")
      .insert({
        org_id: orgId,
        agency_id: agencyId,
        source: "Callbell",
        status: "NEW",
        region: "OTROS",
        destination: "A definir",
        contact_name: contact.name,
        contact_phone: phone,
        contact_email: contact.email ?? null,
        funnel_id: funnelId,
        notes: stamp,
      } as never)
      .select("id, notes")
      .single()
    if (createErr || !created) {
      console.error(
        `[callbell-in] error creando lead para org=${orgId} phone=${phone}:`,
        createErr
      )
      return { handled: false }
    }

    lead = created as { id: string; notes: string | null }
    createdNow = true

    // contact_created no tiene más que hacer, ya creamos el lead.
    if (event.type === "contact_created") {
      return { handled: true, lead_id: lead.id, created: true }
    }
    // message_created sigue al switch abajo para agregar el texto al notes
    // (aunque ya quedó en el stamp inicial — el switch lo deja idempotente).
  }

  const leadId = lead!.id

  switch (event.type) {
    case "contact_created":
      // Ya existía → no hay nada que actualizar
      return { handled: true, lead_id: leadId, created: createdNow }

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
      if (text && !createdNow) {
        // Si recién creamos el lead, el texto ya quedó en el stamp inicial.
        // Si el lead existía, hacemos append como antes.
        const stamp = `[${new Date().toISOString()} · Callbell msg]\n${text}\n`
        const oldNotes = lead!.notes ?? ""
        const newNotes = `${oldNotes}\n${stamp}`.trim()
        await admin
          .from("leads")
          .update({ notes: newNotes } as never)
          .eq("id", leadId)
      }

      // Detectar mensaje-resumen del bot (formato fijo del v50.2) y
      // populär destination + tags de destino/mes + presupuesto.
      if (text) {
        const summary = extractBotSummary(text)
        if (summary) {
          await applyBotSummaryToLead(admin, orgId, leadId, summary)
        }
      }
      break
    }

    default:
      return { handled: false, lead_id: leadId, created: createdNow }
  }

  return { handled: true, lead_id: leadId, created: createdNow }
}

/**
 * Cuando el bot v50.2 emite su mensaje-resumen ("Perfecto, acá tenés un resumen..."),
 * extrajimos destination/fechas/pasajeros/presupuesto en `extractBotSummary`.
 * Acá aplicamos esos datos al lead: update de destination/region/quoted_price
 * + asignación de tags (destino/mes) buscando por label case-insensitive
 * contra `lead_tags` de la org.
 *
 * Es idempotente: si los campos ya están seteados o la tag ya está asignada,
 * el upsert no hace daño. Si algún dato no se puede matchear (ej. destino no
 * existe como tag), se ignora silenciosamente — la conversación queda en notas
 * y el vendedor puede completar manualmente con "Editar".
 */
async function applyBotSummaryToLead(
  admin: SupabaseClient<Database>,
  orgId: string,
  leadId: string,
  summary: import("./summary-extractor").SummaryExtracted
): Promise<void> {
  // 1. Update destination + quoted_price si los tenemos
  const updates: Record<string, unknown> = {}
  if (summary.cityDestino) {
    updates.destination = summary.cityDestino
  }
  if (
    typeof summary.presupuestoNumber === "number" &&
    summary.presupuestoNumber > 0
  ) {
    updates.quoted_price = summary.presupuestoNumber
  }
  if (Object.keys(updates).length > 0) {
    await admin
      .from("leads")
      .update(updates as never)
      .eq("id", leadId)
  }

  // 2. Asignar tag de destino — buscar tag con label que matchee (case-insensitive,
  //    sin tildes para tolerar "Cancún" vs "CANCUN")
  if (summary.cityDestino) {
    const normalizedDest = normalizeForMatch(summary.cityDestino)
    const { data: tags } = await admin
      .from("lead_tags")
      .select("id, label, category:category_id(name)")
      .eq("org_id", orgId)
    const destTag = (tags ?? []).find(
      (t: { label: string; category: { name: string } | null }) =>
        normalizeForMatch(t.label) === normalizedDest
    )
    if (destTag) {
      await admin
        .from("lead_tag_assignments")
        .upsert(
          {
            lead_id: leadId,
            tag_id: (destTag as { id: string }).id,
            org_id: orgId,
          } as never,
          { onConflict: "lead_id,tag_id" }
        )
    }
  }

  // 3. Asignar tag de mes — buscar tag con label que matchee el mes detectado
  if (summary.mesDetectado) {
    const normalizedMes = normalizeForMatch(summary.mesDetectado)
    const { data: tags } = await admin
      .from("lead_tags")
      .select("id, label, category:category_id(name)")
      .eq("org_id", orgId)
    const mesTag = (tags ?? []).find(
      (t: { label: string; category: { name: string } | null }) =>
        normalizeForMatch(t.label) === normalizedMes
    )
    if (mesTag) {
      await admin
        .from("lead_tag_assignments")
        .upsert(
          {
            lead_id: leadId,
            tag_id: (mesTag as { id: string }).id,
            org_id: orgId,
          } as never,
          { onConflict: "lead_id,tag_id" }
        )
    }
  }
}

/** lowercase + sin tildes + trim, para matchear "Cancún" ↔ "CANCUN". */
function normalizeForMatch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita tildes
    .toLowerCase()
    .trim()
}
