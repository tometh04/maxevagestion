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

  // Buscar lead por (org_id, contact_phone). Defensive: si hay duplicados
  // históricos (bug previo sin UNIQUE constraint), usamos el más viejo en vez
  // de fallar con PGRST116. Esto previene que se sigan creando más duplicados
  // mientras existe la migration pendiente para deduplicar + agregar UNIQUE.
  const { data: existingRows } = await admin
    .from("leads")
    .select("id, notes")
    .eq("org_id", orgId)
    .eq("contact_phone", phone)
    .order("created_at", { ascending: true })
    .limit(1)

  let lead =
    existingRows && existingRows.length > 0
      ? (existingRows[0] as { id: string; notes: string | null })
      : null
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

    // FILTRO CONVERSACIONES VIEJAS: Callbell envía webhooks por cualquier
    // mensaje, incluso en conversaciones de meses atrás. Sin este filtro,
    // se crean leads "fantasma" para clientes pre-existentes que ya son
    // gestionados por agentes humanos en Callbell.
    //
    // Regla: solo crear lead si el contacto en Callbell es REALMENTE nuevo:
    //  - contact.createdAt está dentro de la última hora (cliente recién creó conversación)
    //  - Y contact.assignedAgent es null/undefined (todavía no fue derivado a humano)
    //
    // Si alguno de estos falla, el contacto ya estaba en gestión y NO debe
    // tornarse en lead nuevo en Vibook.
    const cbCreatedAtRaw = (contact as { createdAt?: string }).createdAt
    if (cbCreatedAtRaw) {
      const ageMs = Date.now() - new Date(cbCreatedAtRaw).getTime()
      const ONE_HOUR = 60 * 60 * 1000
      if (ageMs > ONE_HOUR) {
        // Conversación vieja → ya existía en Callbell antes que el bot/Vibook
        return { handled: false }
      }
    }
    const cbAssignedAgent = (contact as { assignedAgent?: unknown })
      .assignedAgent
    if (cbAssignedAgent) {
      // Ya tiene agente humano asignado → no es lead "fresh"
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

    // Si Callbell ya tiene un agente asignado en el contacto, resolvemos a user.id
    // y lo seteamos en el lead creado para que solo ese vendedor lo vea (RBAC).
    const assignedSellerId = await resolveSellerIdFromAgent(
      admin,
      orgId,
      (contact as unknown as { assignedAgent?: unknown }).assignedAgent
    )

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
        assigned_seller_id: assignedSellerId,
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

    // Defaults: todo lead nuevo via Callbell arranca con ORIGEN = DERIVACION DE
    // TRAFICO + TEMPERATURA = TEMPLADO. Se upgradea cuando:
    //  - El cliente pickea opción del menú (applyMenuOptionToLead reemplaza)
    //  - O el bot emite resumen completo (applyBotSummaryToLead → CALIENTE)
    // Estas asignaciones son silenciosas si las tags/categorías no existen.
    await assignTagInCategory(admin, orgId, lead.id, "DERIVACION DE TRAFICO", "origen")
    await assignTagInCategory(admin, orgId, lead.id, "TEMPLADO", "temperatura")

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
      // Case-insensitive lookup (Callbell vs Vibook pueden tener mismo email
      // con casing distinto).
      const { data: user } = await admin
        .from("users")
        .select("id")
        .ilike("email", agentEmail)
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
      // Sync de assignedAgent de Callbell → leads.assigned_seller_id (RBAC).
      // Callbell auto-asigna agente apenas llega un mensaje. Mantenemos Vibook
      // alineado para que SELLER solo vea sus leads en el CRM.
      const cbAgent = (event.data.contact as unknown as { assignedAgent?: unknown })
        ?.assignedAgent
      const newSellerId = await resolveSellerIdFromAgent(admin, orgId, cbAgent)
      if (newSellerId) {
        // Solo actualiza si cambió (evita writes innecesarios y respeta
        // reasignaciones manuales en Vibook si Callbell aún no las refleja).
        const { data: currentLead } = await admin
          .from("leads")
          .select("assigned_seller_id")
          .eq("id", leadId)
          .maybeSingle()
        const curr =
          (currentLead as { assigned_seller_id: string | null } | null)
            ?.assigned_seller_id ?? null
        if (curr !== newSellerId) {
          await admin
            .from("leads")
            .update({ assigned_seller_id: newSellerId } as never)
            .eq("id", leadId)
        }
      }

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

      // Detectar opción del menú del bot (1-5). El cliente responde con
      // número o keyword → aplicamos TEMPERATURA + ORIGEN + tag de tipo +
      // funnel correspondiente al lead.
      const messageFrom = (event.data as { message?: { from?: string } }).message?.from
      const isFromClient =
        typeof messageFrom === "string" &&
        !messageFrom.startsWith(VICO_BOT_NUMBERS_PREFIX)
      if (text && isFromClient) {
        const option = detectMenuOption(text)
        if (option) {
          await applyMenuOptionToLead(admin, orgId, leadId, option)
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

  // 2. Asignar tag de destino — categoría "destino" (cardinality=many)
  if (summary.cityDestino) {
    await assignTagInCategory(
      admin,
      orgId,
      leadId,
      summary.cityDestino,
      "destino"
    )
  }

  // 3. Asignar tag de mes — categoría "mes" (cardinality=one)
  if (summary.mesDetectado) {
    await assignTagInCategory(
      admin,
      orgId,
      leadId,
      summary.mesDetectado,
      "mes"
    )
  }

  // 4. Upgrade temperatura a CALIENTE — el cliente completó todos los datos
  //    para cotizar (5 campos del resumen), es interés genuino.
  //    También asegura ORIGEN si no estaba asignado.
  await assignTagInCategory(admin, orgId, leadId, "CALIENTE", "temperatura")
  await assignTagInCategory(
    admin,
    orgId,
    leadId,
    "DERIVACION DE TRAFICO",
    "origen"
  )
}

/** lowercase + sin tildes + trim, para matchear "Cancún" ↔ "CANCUN". */
function normalizeForMatch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita tildes
    .toLowerCase()
    .trim()
}

// VICO bot numbers (mensajes desde estos = el bot al cliente, NO el cliente al bot).
// El "5" o "4" de la opción del menú lo manda el cliente — el bot está en "549...".
const VICO_BOT_NUMBERS_PREFIX = "5492617"

/**
 * Opciones del menú del bot v50.2:
 *   1 = Quiero viajar (bot recolecta datos → emite resumen → parser corre)
 *   2 = Consulta de viaje existente (cliente ya compró)
 *   3 = Problema en viaje (cliente en viaje activo)
 *   4 = Info Mundial (campaña activa)
 *   5 = Info F1 (campaña activa)
 */
type MenuOption = "viajar" | "consulta" | "problema" | "mundial" | "f1"

interface MenuMapping {
  /** Si no es null, se setea como `leads.destination` (solo si está placeholder). */
  destination: string | null
  /** Tag de TEMPERATURA a asignar (categoría cardinality=one). */
  temperatura: "CALIENTE" | "TEMPLADO" | "FRIO"
  /** Tag de ORIGEN a asignar (categoría cardinality=one). */
  origen: "DERIVACION DE TRAFICO"
  /** Tag adicional en categoría "tipo" (cardinality=one) — null = no asignar. */
  tipoTag: "VIAJE EXISTENTE" | "EN VIAJE" | null
  /** Si no es null, mover el lead a este funnel (lookup por name case-insensitive). */
  funnelName: "VENDIDO" | "EN VIAJE" | null
}

const MENU_MAPPING: Record<MenuOption, MenuMapping> = {
  viajar: {
    destination: null,
    temperatura: "TEMPLADO", // upgrade a CALIENTE cuando el parser detecta resumen
    origen: "DERIVACION DE TRAFICO",
    tipoTag: null,
    funnelName: null,
  },
  consulta: {
    destination: null,
    temperatura: "TEMPLADO",
    origen: "DERIVACION DE TRAFICO",
    tipoTag: "VIAJE EXISTENTE",
    funnelName: "VENDIDO",
  },
  problema: {
    destination: null,
    temperatura: "CALIENTE",
    origen: "DERIVACION DE TRAFICO",
    tipoTag: "EN VIAJE",
    funnelName: "EN VIAJE",
  },
  mundial: {
    destination: "Mundial",
    temperatura: "CALIENTE",
    origen: "DERIVACION DE TRAFICO",
    tipoTag: null,
    funnelName: null,
  },
  f1: {
    destination: "Formula 1",
    temperatura: "CALIENTE",
    origen: "DERIVACION DE TRAFICO",
    tipoTag: null,
    funnelName: null,
  },
}

/**
 * Detecta qué opción del menú eligió el cliente. Tolera:
 * - Texto único "1"/"2"/"3"/"4"/"5"
 * - Keywords ("quiero viajar", "ya tengo viaje", "problema", "mundial", "f1", etc.)
 * Devuelve null si no matchea ninguna.
 */
function detectMenuOption(rawText: string): MenuOption | null {
  const t = normalizeForMatch(rawText)
  // Respuesta exacta al menú
  if (t === "1") return "viajar"
  if (t === "2") return "consulta"
  if (t === "3") return "problema"
  if (t === "4") return "mundial"
  if (t === "5") return "f1"
  // Keywords explícitos
  if (/\b(mundial|qatar|world\s*cup|wc)\b/.test(t)) return "mundial"
  if (/\b(f1|formula\s*1|formula\s*uno|gp|grand\s*prix)\b/.test(t)) return "f1"
  if (/\b(estoy\s+en\s+viaje|problema\s+en\s+viaje|emergencia|en\s+el\s+viaje)\b/.test(t)) return "problema"
  if (/\b(consulta\s+(de|sobre)|ya\s+tengo\s+(mi\s+)?viaje|tengo\s+un\s+viaje)\b/.test(t)) return "consulta"
  if (/\b(quiero\s+viajar|busco\s+viaje|busco\s+cotizar|quiero\s+cotizar)\b/.test(t)) return "viajar"
  return null
}

/**
 * Aplica el mapping de la opción al lead: destination + TEMPERATURA + ORIGEN
 * + tag de tipo + funnel. Idempotente: las asignaciones de tag respetan
 * cardinality (categoría one → reemplaza, many → upsert). Destination y
 * funnel se actualizan siempre (sobrescriben).
 */
async function applyMenuOptionToLead(
  admin: SupabaseClient<Database>,
  orgId: string,
  leadId: string,
  option: MenuOption
): Promise<void> {
  const mapping = MENU_MAPPING[option]

  // 1. Destination — solo si placeholder
  if (mapping.destination) {
    const { data: lead } = await admin
      .from("leads")
      .select("destination")
      .eq("id", leadId)
      .maybeSingle()
    const currentDest =
      (lead as { destination: string } | null)?.destination ?? ""
    const isPlaceholder =
      !currentDest ||
      /^a definir$/i.test(currentDest) ||
      /^otros$/i.test(currentDest)
    if (isPlaceholder) {
      await admin
        .from("leads")
        .update({ destination: mapping.destination } as never)
        .eq("id", leadId)
    }
    // Tag de destino correspondiente (categoría destino, cardinality=many → upsert)
    await assignTagInCategory(admin, orgId, leadId, mapping.destination.toUpperCase(), "destino")
  }

  // 2. TEMPERATURA (cardinality=one)
  await assignTagInCategory(admin, orgId, leadId, mapping.temperatura, "temperatura")

  // 3. ORIGEN (cardinality=one)
  await assignTagInCategory(admin, orgId, leadId, mapping.origen, "origen")

  // 4. Tag de TIPO (cardinality=one)
  if (mapping.tipoTag) {
    await assignTagInCategory(admin, orgId, leadId, mapping.tipoTag, "tipo")
  }

  // 5. Funnel — siempre sobrescribe (la opción es el indicador más confiable)
  if (mapping.funnelName) {
    await setLeadFunnelByName(admin, orgId, leadId, mapping.funnelName)
  }
}

/**
 * Asigna una tag al lead respetando cardinality de la categoría:
 * - cardinality=one: borra otras asignaciones de la misma categoría antes de insertar
 * - cardinality=many: upsert (idempotente)
 * Si la tag o categoría no existen, no hace nada (silencioso).
 */
async function assignTagInCategory(
  admin: SupabaseClient<Database>,
  orgId: string,
  leadId: string,
  tagLabel: string,
  categoryName: string
): Promise<void> {
  // Buscar categoría por nombre
  const { data: cat } = await admin
    .from("lead_tag_categories")
    .select("id, cardinality")
    .eq("org_id", orgId)
    .ilike("name", categoryName)
    .maybeSingle()
  if (!cat) return
  const category = cat as { id: string; cardinality: string }

  // Buscar tag por label dentro de la categoría
  const normalizedLabel = normalizeForMatch(tagLabel)
  const { data: tags } = await admin
    .from("lead_tags")
    .select("id, label")
    .eq("org_id", orgId)
    .eq("category_id", category.id)
  const tag = (tags ?? []).find(
    (t: { label: string }) => normalizeForMatch(t.label) === normalizedLabel
  )
  if (!tag) return
  const tagId = (tag as { id: string }).id

  // Si cardinality=one, borrar otras asignaciones del lead en esa categoría
  if (category.cardinality === "one") {
    const allTagIdsInCategory = (tags ?? []).map(
      (t: { id: string }) => t.id
    )
    const otherTagIds = allTagIdsInCategory.filter((id) => id !== tagId)
    if (otherTagIds.length > 0) {
      await admin
        .from("lead_tag_assignments")
        .delete()
        .eq("lead_id", leadId)
        .in("tag_id", otherTagIds)
    }
  }

  // Insertar (idempotente con onConflict)
  await admin
    .from("lead_tag_assignments")
    .upsert(
      {
        lead_id: leadId,
        tag_id: tagId,
        org_id: orgId,
      } as never,
      { onConflict: "lead_id,tag_id" }
    )
}

/**
 * Cambia el funnel del lead por nombre. Lookup case-insensitive.
 * Si no existe, no hace nada.
 */
async function setLeadFunnelByName(
  admin: SupabaseClient<Database>,
  orgId: string,
  leadId: string,
  funnelName: string
): Promise<void> {
  const { data: funnel } = await admin
    .from("lead_funnels")
    .select("id")
    .eq("org_id", orgId)
    .ilike("name", funnelName)
    .maybeSingle()
  if (funnel) {
    await admin
      .from("leads")
      .update({ funnel_id: (funnel as { id: string }).id } as never)
      .eq("id", leadId)
  }
}

/**
 * Resuelve el email del agente asignado en Callbell → users.id de Vibook.
 *
 * El campo `assignedAgent` viene en varios shapes según la versión del payload:
 *   - string: "agent@vicotravelgroup.com" (forma más común en eventos reales)
 *   - object: { email: "...", uuid: "...", name: "..." } (forma "rica" del tipo)
 *   - null / undefined: sin agente asignado
 *
 * Esta función extrae el email con cuidado y hace lookup en `users` scopeado
 * al org. Devuelve null si no hay agente o si el email no matchea ningún user.
 */
async function resolveSellerIdFromAgent(
  admin: SupabaseClient<Database>,
  orgId: string,
  raw: unknown
): Promise<string | null> {
  if (!raw) return null
  let email: string | null = null
  if (typeof raw === "string") {
    email = raw
  } else if (typeof raw === "object" && raw !== null) {
    const r = raw as { email?: unknown }
    if (typeof r.email === "string") email = r.email
  }
  if (!email) return null

  // Lookup case-insensitive (Callbell puede enviar j.ahumada@... mientras Vibook
  // tiene J.ahumada@... — ambos son el mismo user en la práctica).
  const { data: user } = await admin
    .from("users")
    .select("id")
    .ilike("email", email)
    .eq("org_id", orgId)
    .maybeSingle()
  return user ? (user as { id: string }).id : null
}
