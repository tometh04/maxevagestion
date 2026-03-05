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
  
  // 🏷 Bucket (igual que Zapier)
  if (data.bucket) desc += `🏷 Bucket: ${data.bucket}\n`
  
  if (data.destino) desc += `📍 Destino: ${data.destino}\n`
  if (data.fechas) desc += `📅 Fechas: ${data.fechas}\n`
  if (data.personas) desc += `👥 Personas: ${data.personas}\n`
  if (data.menores) desc += `👶 Menores: ${data.menores}\n`
  if (data.presupuesto) desc += `💰 Presupuesto: ${data.presupuesto}\n`
  if (data.servicio) desc += `✈️ Servicio: ${data.servicio}\n`
  if (data.evento) desc += `🎟 Evento: ${data.evento}\n`
  if (data.whatsapp) desc += `📱 WhatsApp: ${data.whatsapp}\n`
  
  // 🧭 Región (igual que Zapier)
  if (data.region) desc += `🧭 Región: ${data.region}\n`
  
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
 * Inferir región a partir del destino
 * Si Manychat no envía región, la deducimos del destino
 */
function inferRegionFromDestination(destino: string | undefined): "ARGENTINA" | "CARIBE" | "BRASIL" | "EUROPA" | "EEUU" | "OTROS" | "CRUCEROS" | null {
  if (!destino) return null

  const d = destino.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()

  // CARIBE
  const caribeDestinos = [
    "punta cana", "bayahibe", "cancun", "riviera maya", "playa del carmen",
    "aruba", "curacao", "curazao", "san andres", "cartagena", "jamaica",
    "republica dominicana", "dominicana", "santo domingo", "la romana",
    "varadero", "cuba", "bahamas", "barbados", "bonaire", "cozumel",
    "puerto rico", "caribe", "isla margarita", "trinidad y tobago",
    "costa rica", "panama", "honduras", "roatan", "belize",
    "turks", "caicos", "antigua", "guadalupe", "martinica",
    "miches", "samana", "santiago (rd)", "puerto plata",
    "isla mujeres", "holbox", "tulum", "xcaret",
    "san martin", "st maarten", "virgin islands", "islas virgenes",
  ]

  // BRASIL
  const brasilDestinos = [
    "brasil", "brazil", "rio de janeiro", "rio", "buzios", "florianopolis",
    "floripa", "salvador", "bahia", "morro de sao paulo", "porto de galinhas",
    "recife", "natal", "fortaleza", "sao paulo", "foz de iguazu", "iguazu",
    "jericoacoara", "maragogi", "fernando de noronha", "porto seguro",
    "camboriú", "balneario", "gramado", "arraial", "trancoso", "praia",
  ]

  // EUROPA
  const europaDestinos = [
    "europa", "paris", "roma", "madrid", "barcelona", "londres", "london",
    "amsterdam", "berlin", "praga", "viena", "budapest", "atenas", "grecia",
    "italia", "francia", "espana", "alemania", "portugal", "lisboa",
    "milan", "venecia", "florencia", "santorini", "croacia", "dubrovnik",
    "turquia", "estambul", "istanbul", "suiza", "zurich", "irlanda", "dublin",
    "escocia", "noruega", "suecia", "dinamarca", "finlandia", "islandia",
  ]

  // EEUU
  const eeuuDestinos = [
    "miami", "orlando", "new york", "nueva york", "los angeles", "las vegas",
    "disney", "disneyworld", "universal", "eeuu", "usa", "estados unidos",
    "california", "hawaii", "hawai", "san francisco", "chicago", "boston",
    "washington", "texas", "houston", "atlanta", "seattle", "denver",
  ]

  // ARGENTINA
  const argentinaDestinos = [
    "bariloche", "mendoza", "salta", "jujuy", "ushuaia", "calafate",
    "el calafate", "buenos aires", "cordoba", "mar del plata", "villa la angostura",
    "san martin de los andes", "iguazu", "cataratas", "tucuman", "patagonia",
    "peninsula valdes", "tierra del fuego", "el chalten", "argentina",
  ]

  // CRUCEROS
  const cruceroTerms = ["crucero", "cruise", "msc", "royal caribbean", "costa cruceros", "norwegian"]

  if (cruceroTerms.some(t => d.includes(t))) return "CRUCEROS"
  if (caribeDestinos.some(t => d.includes(t))) return "CARIBE"
  if (brasilDestinos.some(t => d.includes(t))) return "BRASIL"
  if (europaDestinos.some(t => d.includes(t))) return "EUROPA"
  if (eeuuDestinos.some(t => d.includes(t))) return "EEUU"
  if (argentinaDestinos.some(t => d.includes(t))) return "ARGENTINA"

  return null
}

/**
 * Validar y normalizar región
 * Si la región no viene o es inválida, intenta inferirla del destino
 */
export function normalizeRegion(region: string | undefined, destino?: string): "ARGENTINA" | "CARIBE" | "BRASIL" | "EUROPA" | "EEUU" | "OTROS" | "CRUCEROS" {
  const validRegions = ["ARGENTINA", "CARIBE", "BRASIL", "EUROPA", "EEUU", "OTROS", "CRUCEROS"]

  if (region) {
    const normalized = region.toUpperCase().trim()
    if (validRegions.includes(normalized as any) && normalized !== "OTROS") {
      return normalized as any
    }
  }

  // Si no hay región válida (o es "OTROS"), inferir del destino
  const inferred = inferRegionFromDestination(destino)
  if (inferred) return inferred

  // Si hay región "OTROS" explícita o no se pudo inferir
  if (region) {
    const normalized = region.toUpperCase().trim()
    if (validRegions.includes(normalized as any)) {
      return normalized as any
    }
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
 * Detectar lista por región (igual que Zapier detectRegionList)
 * Normaliza el texto y detecta la región.
 * Si la región no matchea, intenta inferir del destino.
 */
function detectRegionList(region: string | undefined, destino?: string): string {
  if (region) {
    const normalized = region
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()

    if (normalized.includes("caribe")) return "Leads - Caribe"
    if (normalized.includes("brasil")) return "Leads - Brasil"
    if (normalized.includes("argentina")) return "Leads - Argentina"
    if (normalized.includes("europa")) return "Leads - Europa"
    if (normalized.includes("eeuu") || normalized.includes("usa")) return "Leads - EEUU"
    if (normalized.includes("crucero")) return "Leads - Exoticos"
  }

  // Fallback: inferir del destino
  const inferred = inferRegionFromDestination(destino)
  if (inferred) {
    const regionToList: Record<string, string> = {
      CARIBE: "Leads - Caribe",
      BRASIL: "Leads - Brasil",
      ARGENTINA: "Leads - Argentina",
      EUROPA: "Leads - Europa",
      EEUU: "Leads - EEUU",
      CRUCEROS: "Leads - Exoticos",
    }
    return regionToList[inferred] || "Leads - Otros"
  }

  return "Leads - Otros"
}

/**
 * Determinar nombre de lista según lógica de Zapier
 * Lógica IDÉNTICA a la función chooseList() de Zapier:
 * 1. Si BUCKET incluye "cupo" → "Cupos - ${BUCKET}"
 * 2. Si BUCKET && WHATSAPP → "Campaña - ${BUCKET}"
 * 3. Si BUCKET && !WHATSAPP → "Leads - Instagram"
 * 4. Si !BUCKET && WHATSAPP → detectRegionList() → "Leads - ${REGION}"
 * 5. Default → "Leads - Instagram"
 */
export function determineListName(manychatData: ManychatLeadData): string {
  const { bucket, region, whatsapp } = manychatData
  
  const bucketValue = bucket?.trim() || ""
  const normalizedBucket = bucketValue.toLowerCase()
  const normalizedWhatsapp = (whatsapp || "").trim()
  
  // 1. CUPOS - Si BUCKET incluye "cupo"
  if (normalizedBucket.includes("cupo")) {
    return `Cupos - ${bucketValue}`
  }
  
  // 2. BUCKET + WHATSAPP → "Campaña - ${BUCKET}"
  if (normalizedBucket && normalizedWhatsapp) {
    return `Campaña - ${bucketValue}`
  }
  
  // 3. BUCKET SIN WHATSAPP → "Leads - Instagram"
  if (normalizedBucket && !normalizedWhatsapp) {
    return "Leads - Instagram"
  }
  
  // 4. SIN BUCKET + WHATSAPP → detectar región (con fallback a destino)
  if (!normalizedBucket && normalizedWhatsapp) {
    return detectRegionList(region, manychatData.destino)
  }
  
  // 5. DEFAULT → "Leads - Instagram"
  return "Leads - Instagram"
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
  const region = normalizeRegion(manychatData.region, manychatData.destino)
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
  
  // 6. Determinar nombre de lista según lógica de Zapier (INDEPENDIENTE de Trello)
  // Este nombre se usa para agrupar leads en el kanban de CRM Manychat
  const listName = determineListName(manychatData)
  console.log(`✅ Lead de Manychat asignado a lista: "${listName}"`)
  
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
    list_name: listName, // Nombre de la lista para el kanban (INDEPENDIENTE de Trello)
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

