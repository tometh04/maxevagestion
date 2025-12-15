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
    
    return rosario?.id || ""
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
    return agency.id
  }
  
  // Si no se encuentra, buscar Rosario como fallback
  const { data: rosario } = await supabase
    .from("agencies")
    .select("id")
    .ilike("name", "%rosario%")
    .maybeSingle()
  
  return rosario?.id || ""
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
      existingLead = leadByPhone
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
      existingLead = leadByInstagram
    }
  }
  
  // 6. Preparar datos del lead
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
    updated_at: new Date().toISOString(),
  }
  
  // 7. Crear o actualizar lead
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

