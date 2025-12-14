import { createServerClient } from "@/lib/supabase/server"
import { CARD_NAME_SPLIT_REGEX, splitCardName } from "./constants"

export interface TrelloCard {
  id: string
  name: string
  desc: string
  url: string
  shortUrl: string
  idList: string
  idBoard: string
  idShort: number
  pos: number
  closed: boolean
  dateLastActivity: string
  labels?: Array<{ id: string; name: string; color: string; idBoard?: string }>
  idMembers?: string[]
  members?: Array<{ id: string; fullName?: string; username?: string; email?: string }>
  due?: string | null
  dueComplete?: boolean
  start?: string | null
  attachments?: Array<{ 
    id: string
    name: string
    url: string
    mimeType?: string
    bytes?: number
    date?: string
  }>
  checklists?: Array<{ 
    id: string
    name: string
    idBoard: string
    idCard: string
    checkItems: Array<{ 
      id: string
      name: string
      state: string
      pos: number
    }>
  }>
  customFieldItems?: Array<{
    id: string
    idValue?: string
    idCustomField: string
    value?: {
      text?: string
      number?: number
      date?: string
      checked?: boolean
    }
  }>
  badges?: {
    votes: number
    attachmentsByType: {
      trello: {
        board: number
        card: number
      }
    }
    viewingMemberVoted: boolean
    subscribed: boolean
    fogbugz: string
    checkItems: number
    checkItemsChecked: number
    comments: number
    attachments: number
    description: boolean
    due?: string | null
    dueComplete?: boolean
    start?: string | null
  }
  actions?: Array<{
    id: string
    type: string
    date: string
    data: any
    memberCreator?: {
      id: string
      fullName?: string
      username?: string
    }
  }>
  board?: {
    id: string
    name: string
    url: string
  }
  list?: {
    id: string
    name: string
    pos: number
  }
  // Guardar toda la información completa en formato JSON
  _raw?: any
}

export interface TrelloSettings {
  agency_id: string
  trello_api_key: string
  trello_token: string
  board_id: string
  list_status_mapping: Record<string, string>
  list_region_mapping: Record<string, string>
}

/**
 * Parse contact name from Trello card name
 * Assumes format: "Name - Destination" or "Name: Destination" or "Name, Destination"
 */
export function parseContactName(cardName: string): string {
  const parts = splitCardName(cardName)
  return parts[0]?.trim() || cardName.trim()
}

/**
 * Parse destination from Trello card name or labels
 */
export function parseDestination(card: TrelloCard): string {
  // Try labels first
  if (card.labels && card.labels.length > 0) {
    const destinationLabel = card.labels.find((label) => 
      !["urgent", "important", "low", "high", "medium"].includes(label.name.toLowerCase())
    )
    if (destinationLabel) {
      return destinationLabel.name
    }
  }

  // Try parsing from card name (second part after separator)
  const parts = splitCardName(card.name)
  if (parts.length > 1) {
    return parts[1]?.trim() || "Sin destino"
  }

  return "Sin destino"
}

/**
 * Extract phone number from card description or name
 */
export function extractPhone(desc: string, name: string): string {
  const phoneRegex = /(\+?\d{1,4}[\s-]?)?\(?\d{1,4}\)?[\s-]?\d{1,4}[\s-]?\d{1,4}[\s-]?\d{1,9}/
  const match = (desc + " " + name).match(phoneRegex)
  return match ? match[0].trim() : ""
}

/**
 * Extract email from card description or name
 */
export function extractEmail(desc: string, name: string): string | null {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
  const match = (desc + " " + name).match(emailRegex)
  return match ? match[0].trim() : null
}

/**
 * Extract Instagram handle from card description or name
 */
export function extractInstagram(desc: string, name: string): string | null {
  // Primero intentar extraer de formato estructurado "Instagram: username"
  const structuredMatch = desc.match(/Instagram:\s*(.+)/i)
  if (structuredMatch) {
    const instagramValue = structuredMatch[1].trim()
    // Remover @ si está presente
    return instagramValue.replace(/^@/, "").trim() || null
  }
  
  // Fallback: buscar @username en descripción o nombre
  const instagramRegex = /@([a-zA-Z0-9._]+)/
  const match = (desc + " " + name).match(instagramRegex)
  return match ? match[1] : null
}

/**
 * Parse structured description from Zapier format
 * Extrae campos específicos de la descripción estructurada que viene de Zapier
 * Formato esperado:
 * 📍 Destino: ...
 * 📅 Fechas: ...
 * 👥 Personas: ...
 * etc.
 */
export function parseZapierDescription(desc: string): Record<string, string> {
  const fields: Record<string, string> = {}
  
  if (!desc) return fields
  
  // Patrones para extraer cada campo estructurado
  const patterns = {
    destino: /📍\s*Destino:\s*(.+?)(?=\n|$)/i,
    fechas: /📅\s*Fechas:\s*(.+?)(?=\n|$)/i,
    personas: /👥\s*Personas:\s*(.+?)(?=\n|$)/i,
    menores: /👶\s*Menores:\s*(.+?)(?=\n|$)/i,
    presupuesto: /💰\s*Presupuesto:\s*(.+?)(?=\n|$)/i,
    servicio: /✈️\s*Servicio:\s*(.+?)(?=\n|$)/i,
    evento: /🎟\s*Evento:\s*(.+?)(?=\n|$)/i,
    whatsapp: /📱\s*WhatsApp:\s*(.+?)(?=\n|$)/i,
    instagram: /Instagram:\s*(.+?)(?=\n|$)/i,
    fase: /Fase:\s*(.+?)(?=\n|$)/i,
  }
  
  for (const [key, pattern] of Object.entries(patterns)) {
    const match = desc.match(pattern)
    if (match && match[1]) {
      fields[key] = match[1].trim()
    }
  }
  
  return fields
}

/**
 * Sync a single Trello card to a lead
 * Trae TODA la información tal cual está en Trello
 */
export async function syncTrelloCardToLead(
  card: TrelloCard,
  settings: TrelloSettings,
  supabase: Awaited<ReturnType<typeof createServerClient>>
): Promise<{ created: boolean; leadId: string }> {
  const listStatusMapping = settings.list_status_mapping || {}
  const listRegionMapping = settings.list_region_mapping || {}
  

  const status = (listStatusMapping[card.idList] || "NEW") as "NEW" | "IN_PROGRESS" | "QUOTED" | "WON" | "LOST"
  const region = (listRegionMapping[card.idList] || "OTROS") as
    | "ARGENTINA"
    | "CARIBE"
    | "BRASIL"
    | "EUROPA"
    | "EEUU"
    | "OTROS"
    | "CRUCEROS"

  // Usar el nombre EXACTO de la tarjeta (sin parsear)
  const contactName = card.name.trim()
  
  // MEJORADO: Parsear descripción estructurada de Zapier primero
  const zapierFields = parseZapierDescription(card.desc || "")
  
  // Extraer información adicional de la descripción (opcional)
  // Priorizar campos estructurados de Zapier si existen, sino usar regex genérico
  const phone = zapierFields.whatsapp || extractPhone(card.desc || "", card.name)
  const email = extractEmail(card.desc || "", card.name)
  const instagram = zapierFields.instagram || extractInstagram(card.desc || "", card.name)
  
  // Destino: priorizar campo estructurado de Zapier, luego labels, luego del nombre
  let destination = zapierFields.destino || parseDestination(card)

  // Mapear miembros de Trello a vendedores
  // MEJORADO: Usar los miembros que ya vienen en el card (si están disponibles)
  let assigned_seller_id: string | null = null
  if (card.idMembers && card.idMembers.length > 0) {
    try {
      // Primero intentar usar los miembros que ya vienen en el card
      let memberName = ""
      if (card.members && card.members.length > 0) {
        const member = card.members[0]
        memberName = (member.fullName || member.username || "").trim()
      } else {
        // Si no vienen en el card, obtener desde la API
        const memberId = card.idMembers[0]
        const memberResponse = await fetch(
          `https://api.trello.com/1/members/${memberId}?key=${settings.trello_api_key}&token=${settings.trello_token}&fields=fullName,username,email`
        )
        if (memberResponse.ok) {
          const member = await memberResponse.json()
          memberName = (member.fullName || member.username || "").trim()
        }
      }
      
      if (memberName) {
        const normalizedName = memberName.toLowerCase().replace(/\s+/g, "")
        
        // Buscar vendedor en la BD con matching más flexible
        const { data: sellers } = await supabase
          .from("users")
          .select("id, name")
          .in("role", ["SELLER", "ADMIN", "SUPER_ADMIN"])
          .eq("is_active", true)
        
        if (sellers) {
          // Matching más agresivo: buscar por nombre completo, parcial, o variaciones
          const seller = sellers.find((s: any) => {
            const sellerName = s.name.toLowerCase().replace(/\s+/g, "")
            const memberNameLower = memberName.toLowerCase()
            const sellerNameLower = s.name.toLowerCase()
            
            // Matching exacto
            if (sellerName === normalizedName) return true
            // Matching parcial (cualquiera contiene al otro)
            if (sellerName.includes(normalizedName) || normalizedName.includes(sellerName)) return true
            // Matching por nombre completo (ignorando mayúsculas)
            if (memberNameLower === sellerNameLower) return true
            // Matching por primera palabra (para "Maximiliano" vs "Maximiliano Lastname")
            const memberFirstWord = memberNameLower.split(/\s+/)[0]
            const sellerFirstWord = sellerNameLower.split(/\s+/)[0]
            if (memberFirstWord && sellerFirstWord && memberFirstWord === sellerFirstWord) return true
            
            return false
          })
          
          if (seller) {
            assigned_seller_id = (seller as any).id
          }
        }
      }
    } catch (error) {
      // Si falla, continuar sin asignar vendedor
      console.error("Error mapping Trello member to seller:", error)
    }
  }

  // Extraer información adicional de Custom Fields de Trello
  let customFieldsData: Record<string, any> = {}
  if (card.customFieldItems && Array.isArray(card.customFieldItems)) {
    for (const fieldItem of card.customFieldItems) {
      if (fieldItem.value) {
        // El nombre del campo se obtiene del customField, pero aquí solo tenemos el ID
        // Guardamos el valor con el ID del campo
        customFieldsData[fieldItem.idCustomField] = fieldItem.value
      }
    }
  }

  // Extraer información de checklists (tareas completadas/totales)
  let checklistsInfo = ""
  if (card.checklists && Array.isArray(card.checklists)) {
    checklistsInfo = card.checklists.map((cl: any) => {
      const total = cl.checkItems?.length || 0
      const completed = cl.checkItems?.filter((item: any) => item.state === "complete").length || 0
      return `${cl.name}: ${completed}/${total}`
    }).join("; ")
  }

  // Extraer información de attachments
  let attachmentsInfo = ""
  if (card.attachments && Array.isArray(card.attachments)) {
    attachmentsInfo = card.attachments.map((att: any) => att.name).join(", ")
  }

  // Construir notas completas con TODA la información de Trello
  let fullNotes = card.desc || ""
  
  // Agregar información de checklists si existe
  if (checklistsInfo) {
    fullNotes += (fullNotes ? "\n\n" : "") + `📋 Checklists: ${checklistsInfo}`
  }
  
  // Agregar información de attachments si existe
  if (attachmentsInfo) {
    fullNotes += (fullNotes ? "\n\n" : "") + `📎 Attachments: ${attachmentsInfo}`
  }
  
  // Agregar información de due date si existe
  if (card.due) {
    const dueDate = new Date(card.due)
    fullNotes += (fullNotes ? "\n\n" : "") + `📅 Due Date: ${dueDate.toLocaleDateString()} ${card.dueComplete ? "✅ Completed" : ""}`
  }
  
  // Agregar información de labels si existen
  if (card.labels && card.labels.length > 0) {
    const labelsNames = card.labels.map((l: any) => l.name).join(", ")
    fullNotes += (fullNotes ? "\n\n" : "") + `🏷️ Labels: ${labelsNames}`
  }

  // Preparar datos completos de Trello para guardar en JSONB
  const trelloFullData = {
    // Información básica
    id: card.id,
    name: card.name,
    desc: card.desc,
    url: card.url,
    shortUrl: card.shortUrl,
    idList: card.idList,
    idBoard: card.idBoard,
    closed: card.closed,
    dateLastActivity: card.dateLastActivity,
    
    // Labels completos
    labels: card.labels || [],
    
    // Members completos
    members: card.members || [],
    idMembers: card.idMembers || [],
    
    // Due dates
    due: card.due,
    dueComplete: card.dueComplete,
    start: card.start,
    
    // Attachments completos
    attachments: card.attachments || [],
    
    // Checklists completos
    checklists: card.checklists || [],
    
    // Custom Fields
    customFieldItems: card.customFieldItems || [],
    customFieldsData: customFieldsData,
    
    // Badges (contadores)
    badges: card.badges || {},
    
    // Actions (comentarios y cambios recientes)
    actions: card.actions || [],
    
    // Board y List info
    board: card.board || null,
    list: card.list || null,
    
    // MEJORADO: Campos estructurados parseados de Zapier (si existen)
    zapierFields: Object.keys(zapierFields).length > 0 ? zapierFields : undefined,
    
    // Fecha de sincronización
    syncedAt: new Date().toISOString(),
  }

  // Check if lead exists
  const { data: existingLead } = await supabase
    .from("leads")
    .select("id")
    .eq("external_id", card.id)
    .maybeSingle()

  // CRÍTICO: Asegurar que tenemos el idList correcto
  const trelloListId = card.idList || card.list?.id || null
  if (!trelloListId) {
    console.error("⚠️ Card sin idList, no se puede sincronizar:", card.id, card.name)
    throw new Error(`Card ${card.id} no tiene idList`)
  }
  
  const leadData: any = {
    agency_id: settings.agency_id,
    source: "Trello" as const,
    external_id: card.id,
    trello_url: card.url || card.shortUrl,
    trello_list_id: trelloListId, // Guardar el ID de la lista de Trello - CRÍTICO
    trello_full_data: trelloFullData, // Guardar TODA la información en JSONB
    status,
    region,
    destination,
    contact_name: contactName, // Nombre EXACTO de la tarjeta
    contact_phone: phone || "",
    contact_email: email,
    contact_instagram: instagram,
    assigned_seller_id,
    notes: fullNotes || null, // Notas completas con toda la información
    updated_at: new Date().toISOString(),
  }

  if (existingLead) {
    const leadsTable = supabase.from("leads") as any
    const { error: updateError } = await leadsTable.update(leadData).eq("id", (existingLead as any).id)
    if (updateError) {
      console.error("❌ Error updating lead:", updateError)
      throw new Error(`Error updating lead: ${updateError.message}`)
    }
    console.log("✅ Lead updated:", (existingLead as any).id)
    return { created: false, leadId: (existingLead as any).id }
  } else {
    const leadsTable = supabase.from("leads") as any
    const { data: newLead, error } = await leadsTable.insert(leadData).select("id").single()
    if (error) {
      console.error("❌ Error creating lead:", error)
      throw new Error(`Error creating lead: ${error.message}`)
    }
    console.log("✅ Lead created:", (newLead as any).id)
    return { created: true, leadId: (newLead as any).id }
  }
}

/**
 * Retry helper con exponential backoff
 */
async function fetchWithRetry(
  url: string,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<Response> {
  let lastError: Error | null = null
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url)
      
      // Si es rate limit, esperar más tiempo
      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After")
        const waitTime = retryAfter 
          ? parseInt(retryAfter) * 1000 
          : baseDelay * Math.pow(2, attempt)
        
        console.log(`⚠️ Rate limit (429). Esperando ${waitTime}ms antes de reintentar... (intento ${attempt + 1}/${maxRetries})`)
        await new Promise(resolve => setTimeout(resolve, Math.min(waitTime, 30000))) // Max 30 segundos
        continue
      }
      
      // Si es otro error, esperar un poco y reintentar
      if (!response.ok && response.status >= 500) {
        const waitTime = baseDelay * Math.pow(2, attempt)
        console.log(`⚠️ Error ${response.status}. Esperando ${waitTime}ms antes de reintentar... (intento ${attempt + 1}/${maxRetries})`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
        continue
      }
      
      // Si la respuesta es OK o error 4xx (no reintentar), retornar
      return response
      
    } catch (error: any) {
      lastError = error
      if (attempt < maxRetries - 1) {
        const waitTime = baseDelay * Math.pow(2, attempt)
        console.log(`⚠️ Error de red: ${error.message}. Esperando ${waitTime}ms antes de reintentar... (intento ${attempt + 1}/${maxRetries})`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
    }
  }
  
  // Si llegamos aquí, todos los intentos fallaron
  throw lastError || new Error("Failed to fetch after all retries")
}

/**
 * Fetch a single card from Trello by ID
 * Obtiene TODA la información disponible según la documentación oficial de Trello
 * MEJORADO: Incluye retry logic con exponential backoff
 * https://developer.atlassian.com/cloud/trello/guides/rest-api/api-introduction/
 */
export async function fetchTrelloCard(
  cardId: string,
  apiKey: string,
  token: string
): Promise<TrelloCard | null> {
  try {
    // Según la documentación de Trello, obtener TODOS los campos disponibles
    // Usar parámetros de la API para obtener información completa
    const params = new URLSearchParams({
      key: apiKey,
      token: token,
      // Obtener todos los campos básicos
      fields: "all",
      // Obtener miembros completos
      members: "true",
      member_fields: "all",
      // Obtener todos los attachments
      attachments: "true",
      attachment_fields: "all",
      // Obtener todos los checklists
      checklists: "all",
      checklist_fields: "all",
      // Obtener custom fields (campos personalizados)
      customFieldItems: "true",
      // Obtener badges (contadores, etc.)
      badges: "true",
      // Obtener stickers
      stickers: "true",
      // Obtener actions (comentarios, cambios, etc.) - limitado a 1000
      actions: "commentCard,updateCard,addAttachmentToCard,addChecklistToCard,addMemberToCard",
      actions_limit: "100",
      actions_fields: "all",
      // Obtener board info
      board: "true",
      board_fields: "name,url",
      // Obtener list info
      list: "true",
      list_fields: "name,pos",
    })

    // MEJORADO: Usar retry logic con exponential backoff
    const response = await fetchWithRetry(
      `https://api.trello.com/1/cards/${cardId}?${params.toString()}`,
      3, // maxRetries
      1000 // baseDelay: 1 segundo
    )

    if (response.status === 404) {
      return null // Card deleted
    }

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ Trello API error (${response.status}):`, errorText)
      throw new Error(`Trello API error: ${response.status} - ${errorText}`)
    }

    const card = await response.json()
    
    // CRÍTICO: Asegurar que idList esté presente (puede venir como idList o list.id)
    if (!card.idList && card.list?.id) {
      card.idList = card.list.id
    }
    
    // Log para debugging
    if (!card.idList) {
      console.error("⚠️ Card sin idList:", card.id, card.name)
    }
    
    // Guardar la respuesta completa en _raw para referencia
    const rawCard = JSON.parse(JSON.stringify(card))
    
    // Asegurar que los miembros estén en el formato correcto
    if (card.members && Array.isArray(card.members)) {
      card.members = card.members.map((m: any) => ({
        id: m.id,
        fullName: m.fullName || m.fullname || m.full_name,
        username: m.username,
        email: m.email,
      }))
    }
    
    // Asegurar que los checklists tengan el formato correcto
    if (card.checklists && Array.isArray(card.checklists)) {
      card.checklists = card.checklists.map((cl: any) => ({
        id: cl.id,
        name: cl.name,
        idBoard: cl.idBoard,
        idCard: cl.idCard,
        checkItems: (cl.checkItems || []).map((item: any) => ({
          id: item.id,
          name: item.name,
          state: item.state,
          pos: item.pos || 0,
        })),
      }))
    }
    
    // Asegurar que los attachments tengan el formato correcto
    if (card.attachments && Array.isArray(card.attachments)) {
      card.attachments = card.attachments.map((att: any) => ({
        id: att.id,
        name: att.name,
        url: att.url,
        mimeType: att.mimeType,
        bytes: att.bytes,
        date: att.date,
      }))
    }
    
    // Guardar la información completa
    card._raw = rawCard
    
    console.log("✅ Card fetched with complete data:", {
      id: card.id,
      name: card.name,
      hasDesc: !!card.desc,
      membersCount: card.members?.length || 0,
      labelsCount: card.labels?.length || 0,
      attachmentsCount: card.attachments?.length || 0,
      checklistsCount: card.checklists?.length || 0,
      customFieldsCount: card.customFieldItems?.length || 0,
      actionsCount: card.actions?.length || 0,
    })
    
    return card
  } catch (error) {
    console.error("❌ Error fetching Trello card:", error)
    throw error
  }
}

/**
 * Delete a lead by external_id (when Trello card is deleted)
 */
export async function deleteLeadByExternalId(
  externalId: string,
  supabase: Awaited<ReturnType<typeof createServerClient>>
): Promise<boolean> {
  try {
    const { error } = await (supabase.from("leads") as any).delete().eq("external_id", externalId)
    if (error) {
      console.error("Error deleting lead:", error)
      return false
    }
    return true
  } catch (error) {
    console.error("Error deleting lead:", error)
    return false
  }
}

