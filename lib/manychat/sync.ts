import { createServerClient } from "@/lib/supabase/server"

export interface ManychatLeadData {
  ig?: string
  name?: string
  bucket?: string
  region?: string
  whatsapp?: string
  destino?: string
  fechas?: string
  personas?: string
  menores?: string
  presupuesto?: string
  servicio?: string
  evento?: string
  phase?: string
  agency?: string // "rosario" | "madero"
  manychat_user_id?: string
  flow_id?: string
  page_id?: string
  timestamp?: string
}

/**
 * Construir descripción estructurada igual que Zapier
 * Formato: campos con emojis, uno por línea
 */
export function buildStructuredDescription(data: ManychatLeadData): string {
  let desc = ""
  
  if (data.destino) desc += `📍 Destino: ${data.destino}\n`
  if (data.fechas) desc += `📅 Fechas: ${data.fechas}\n`
  if (data.personas) desc += `👥 Personas: ${data.personas}\n`
  if (data.menores) desc += `👶 Menores: ${data.menores}\n`
  if (data.presupuesto) desc += `💰 Presupuesto: ${data.presupuesto}\n`
  if (data.servicio) desc += `✈️ Servicio: ${data.servicio}\n`
  if (data.evento) desc += `🎟 Evento: ${data.evento}\n`
  if (data.whatsapp) desc += `📱 WhatsApp: ${data.whatsapp}\n`
  
  // Instagram siempre se agrega (normalizado, sin @)
  const instagram = (data.ig || "").replace(/^@/, "").trim().toLowerCase()
  if (instagram) desc += `Instagram: ${instagram}\n`
  
  // Fase siempre se agrega
  const phase = (data.phase || "").toLowerCase()
  if (phase) desc += `Fase: ${phase}`
  
  return desc.trim()
}

/**
 * Normalizar Instagram username (remover @, lowercase)
 */
export function normalizeInstagram(ig: string | undefined): string | null {
  if (!ig) return null
  return ig.replace(/^@/, "").trim().toLowerCase() || null
}

/**
 * Determinar agency_id por tag de Manychat
 * Busca agencia por nombre (case insensitive)
 * Fallback: Rosario si no se encuentra
 */
export async function determineAgencyId(
  agencyTag: string | undefined,
  supabase: Awaited<ReturnType<typeof createServerClient>>
): Promise<string> {
  if (!agencyTag) {
    // Fallback: buscar Rosario por defecto
    const { data: rosario } = await supabase
      .from("agencies")
      .select("id")
      .ilike("name", "%rosario%")
      .maybeSingle()
    
    return (rosario as { id: string } | null)?.id || ""
  }
  
  // Buscar agencia por nombre (case insensitive)
  const normalizedTag = agencyTag.toLowerCase().trim()
  
  // Mapeo directo de tags comunes
  const tagMap: Record<string, string> = {
    "rosario": "rosario",
    "madero": "madero",
  }
  
  const searchTerm = tagMap[normalizedTag] || normalizedTag
  
  const { data: agency } = await supabase
    .from("agencies")
    .select("id")
    .ilike("name", `%${searchTerm}%`)
    .maybeSingle()
  
  if (agency) {
    return (agency as { id: string }).id
  }
  
  // Si no se encuentra, buscar Rosario como fallback
  const { data: rosario } = await supabase
    .from("agencies")
    .select("id")
    .ilike("name", "%rosario%")
    .maybeSingle()
  
  return (rosario as { id: string } | null)?.id || ""
}

/**
 * Validar y normalizar región
 * Debe ser uno de los valores válidos, sino retorna "OTROS"
 */
export function normalizeRegion(region: string | undefined): "ARGENTINA" | "CARIBE" | "BRASIL" | "EUROPA" | "EEUU" | "OTROS" | "CRUCEROS" {
  const validRegions = ["ARGENTINA", "CARIBE", "BRASIL", "EUROPA", "EEUU", "OTROS", "CRUCEROS"]
  
  if (!region) return "OTROS"
  
  const normalized = region.toUpperCase().trim()
  
  // Verificar si es válido
  if (validRegions.includes(normalized as any)) {
    return normalized as any
  }
  
  return "OTROS"
}

/**
 * Mapear phase a status
 * phase: "initial" → status: "NEW"
 * Otros valores → status: "IN_PROGRESS"
 */
export function mapPhaseToStatus(phase: string | undefined): "NEW" | "IN_PROGRESS" | "QUOTED" | "WON" | "LOST" {
  const normalizedPhase = (phase || "").toLowerCase().trim()
  
  if (normalizedPhase === "initial") {
    return "NEW"
  }
  
  return "IN_PROGRESS"
}

/**
 * Determinar nombre de lista según lógica de Zapier
 * Lógica IDÉNTICA a la función chooseList() de Zapier:
 * - Si PHASE === "initial" o no hay whatsapp → "Leads - Instagram"
 * - Si hay BUCKET → "Campaña - {BUCKET}"
 * - Si hay REGION → usar REGION como nombre de lista
 * - Por defecto → "Otros"
 */
export function determineListName(manychatData: ManychatLeadData): string {
  const { phase, bucket, region, whatsapp } = manychatData
  
  // Si PHASE === "initial" o no hay whatsapp → "Leads - Instagram"
  const normalizedPhase = (phase || "").toLowerCase().trim()
  if (normalizedPhase === "initial" || !whatsapp) {
    return "Leads - Instagram"
  }
  
  // Si hay BUCKET → "Campaña - {BUCKET}"
  if (bucket && bucket.trim()) {
    return `Campaña - ${bucket.trim()}`
  }
  
  // Si hay REGION → usar REGION como nombre de lista
  if (region && region.trim()) {
    return region.trim()
  }
  
  // Por defecto → "Otros"
  return "Otros"
}

/**
 * Buscar lista de Trello por nombre (case insensitive, parcial match)
 * Retorna el ID de la lista si se encuentra, null si no
 */
export async function findTrelloListByName(
  listName: string,
  agencyId: string,
  supabase: Awaited<ReturnType<typeof createServerClient>>
): Promise<string | null> {
  try {
    // Obtener settings de Trello para esta agencia
    const { data: trelloSettings } = await supabase
      .from("settings_trello")
      .select("board_id, trello_api_key, trello_token")
      .eq("agency_id", agencyId)
      .maybeSingle()
    
    if (!trelloSettings) {
      console.warn(`⚠️ No hay configuración de Trello para agencia ${agencyId}`)
      return null
    }
    
    const settings = trelloSettings as any
    
    // Obtener listas de Trello
    const response = await fetch(
      `https://api.trello.com/1/boards/${settings.board_id}/lists?key=${settings.trello_api_key}&token=${settings.trello_token}&filter=open&fields=id,name`
    )
    
    if (!response.ok) {
      console.warn(`⚠️ Error obteniendo listas de Trello: ${response.status}`)
      return null
    }
    
    const lists = await response.json()
    
    // Buscar lista por nombre (case insensitive, puede ser match parcial)
    const normalizedSearchName = listName.toLowerCase().trim()
    const foundList = lists.find((list: any) => {
      const normalizedListName = list.name.toLowerCase().trim()
      // Match exacto o parcial
      return normalizedListName === normalizedSearchName || 
             normalizedListName.includes(normalizedSearchName) ||
             normalizedSearchName.includes(normalizedListName)
    })
    
    if (foundList) {
      console.log(`✅ Lista encontrada: "${listName}" → "${foundList.name}" (${foundList.id})`)
      return foundList.id
    }
    
    // Si no se encuentra, buscar "Otros" como fallback
    const otrosList = lists.find((list: any) => 
      list.name.toLowerCase().trim() === "otros"
    )
    
    if (otrosList) {
      console.log(`⚠️ Lista "${listName}" no encontrada, usando "Otros" (${otrosList.id})`)
      return otrosList.id
    }
    
    // Si no hay "Otros", usar la primera lista disponible
    if (lists.length > 0) {
      console.warn(`⚠️ Lista "${listName}" no encontrada, usando primera lista disponible: "${lists[0].name}"`)
      return lists[0].id
    }
    
    console.warn(`⚠️ No hay listas disponibles en Trello para agencia ${agencyId}`)
    return null
  } catch (error: any) {
    console.error(`❌ Error buscando lista de Trello:`, error.message)
    return null
  }
}

/**
 * Sync Manychat lead data to a lead in the database
 * Lógica IDÉNTICA a syncTrelloCardToLead pero adaptada para Manychat
 */
export async function syncManychatLeadToLead(
  manychatData: ManychatLeadData,
  supabase: Awaited<ReturnType<typeof createServerClient>>
): Promise<{ created: boolean; leadId: string }> {
  
  // 1. Determinar agency_id
  const agency_id = await determineAgencyId(manychatData.agency, supabase)
  
  if (!agency_id) {
    throw new Error("No se pudo determinar la agencia. Verifica que existan agencias en la base de datos.")
  }
  
  // 2. Mapear campos
  const instagram = normalizeInstagram(manychatData.ig)
  const contact_name = (manychatData.name || manychatData.ig || "Sin nombre").trim()
  const contact_phone = (manychatData.whatsapp || "").trim()
  const contact_instagram = instagram
  const destination = (manychatData.destino || "Sin destino").trim()
  const region = normalizeRegion(manychatData.region)
  const status = mapPhaseToStatus(manychatData.phase)
  
  // 3. Construir descripción estructurada (igual que Zapier)
  const notes = buildStructuredDescription(manychatData)
  
  // 4. Preparar datos completos de Manychat para guardar en JSONB (similar a trello_full_data)
  const manychatFullData = {
    // Datos del lead
    ig: manychatData.ig,
    name: manychatData.name,
    bucket: manychatData.bucket,
    region: manychatData.region,
    whatsapp: manychatData.whatsapp,
    destino: manychatData.destino,
    fechas: manychatData.fechas,
    personas: manychatData.personas,
    menores: manychatData.menores,
    presupuesto: manychatData.presupuesto,
    servicio: manychatData.servicio,
    evento: manychatData.evento,
    phase: manychatData.phase,
    agency: manychatData.agency,
    
    // Metadata de Manychat
    manychat_user_id: manychatData.manychat_user_id,
    flow_id: manychatData.flow_id,
    page_id: manychatData.page_id,
    timestamp: manychatData.timestamp,
    
    // Fecha de sincronización
    syncedAt: new Date().toISOString(),
  }
  
  // 5. Buscar lead existente por teléfono o Instagram (deduplicación)
  let existingLead: { id: string } | null = null
  
  if (contact_phone) {
    const { data: leadByPhone } = await supabase
      .from("leads")
      .select("id")
      .eq("contact_phone", contact_phone)
      .eq("source", "Manychat")
      .maybeSingle()
    
    if (leadByPhone) {
      existingLead = leadByPhone as { id: string }
    }
  }
  
  // Si no se encontró por teléfono, buscar por Instagram
  if (!existingLead && contact_instagram) {
    const { data: leadByInstagram } = await supabase
      .from("leads")
      .select("id")
      .eq("contact_instagram", contact_instagram)
      .eq("source", "Manychat")
      .maybeSingle()
    
    if (leadByInstagram) {
      existingLead = leadByInstagram as { id: string }
    }
  }
  
  // 6. Determinar lista de Trello según lógica de Zapier
  // IMPORTANTE: Esto es solo para asignar el lead a una lista en el kanban
  // NO sincroniza con Trello, solo usa las listas como referencia visual
  const listName = determineListName(manychatData)
  const trelloListId = await findTrelloListByName(listName, agency_id, supabase)
  
  if (trelloListId) {
    console.log(`✅ Lead de Manychat asignado a lista: "${listName}" (${trelloListId})`)
  } else {
    console.warn(`⚠️ No se pudo asignar lead de Manychat a lista: "${listName}"`)
  }
  
  // 7. Preparar datos del lead
  const leadData: any = {
    agency_id,
    source: "Manychat" as const,
    status,
    region,
    destination,
    contact_name,
    contact_phone: contact_phone || "",
    contact_email: null, // Manychat no envía email por ahora
    contact_instagram,
    assigned_seller_id: null, // No se asigna automáticamente
    notes: notes || null,
    manychat_full_data: manychatFullData, // Similar a trello_full_data
    trello_list_id: trelloListId, // Asignar lista para que aparezca en el kanban (solo visual, no sincroniza)
    updated_at: new Date().toISOString(),
  }
  
  // 8. Crear o actualizar lead
  if (existingLead) {
    // Actualizar lead existente
    const leadsTable = supabase.from("leads") as any
    const { error: updateError } = await leadsTable
      .update(leadData)
      .eq("id", existingLead.id)
    
    if (updateError) {
      console.error("❌ Error updating lead from Manychat:", updateError)
      throw new Error(`Error updating lead: ${updateError.message}`)
    }
    
    console.log("✅ Lead updated from Manychat:", existingLead.id)
    return { created: false, leadId: existingLead.id }
  } else {
    // Crear nuevo lead
    const leadsTable = supabase.from("leads") as any
    const { data: newLead, error } = await leadsTable
      .insert(leadData)
      .select("id")
      .single()
    
    if (error) {
      console.error("❌ Error creating lead from Manychat:", error)
      throw new Error(`Error creating lead: ${error.message}`)
    }
    
    console.log("✅ Lead created from Manychat:", (newLead as any).id)
    return { created: true, leadId: (newLead as any).id }
  }
}

