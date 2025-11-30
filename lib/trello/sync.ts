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
  const instagramRegex = /@([a-zA-Z0-9._]+)/
  const match = (desc + " " + name).match(instagramRegex)
  return match ? match[1] : null
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
  
  // Extraer información adicional de la descripción (opcional)
  const phone = extractPhone(card.desc || "", card.name)
  const email = extractEmail(card.desc || "", card.name)
  const instagram = extractInstagram(card.desc || "", card.name)
  
  // Destino: intentar de labels primero, luego del nombre
  let destination = parseDestination(card)

  // Mapear miembros de Trello a vendedores
  let assigned_seller_id: string | null = null
  if (card.idMembers && card.idMembers.length > 0) {
    // Obtener información del miembro desde Trello
    try {
      const memberId = card.idMembers[0]
      const memberResponse = await fetch(
        `https://api.trello.com/1/members/${memberId}?key=${settings.trello_api_key}&token=${settings.trello_token}&fields=fullName,username,email`
      )
      if (memberResponse.ok) {
        const member = await memberResponse.json()
        const memberName = (member.fullName || member.username || "").trim()
        const normalizedName = memberName.toLowerCase().replace(/\s+/g, "")
        
        // Buscar vendedor en la BD
        const { data: sellers } = await supabase
          .from("users")
          .select("id, name")
          .in("role", ["SELLER", "ADMIN", "SUPER_ADMIN"])
          .eq("is_active", true)
        
        if (sellers) {
          const seller = sellers.find((s: any) => {
            const sellerName = s.name.toLowerCase().replace(/\s+/g, "")
            return sellerName === normalizedName || 
                   sellerName.includes(normalizedName) ||
                   normalizedName.includes(sellerName) ||
                   memberName.toLowerCase().includes(sellerName) ||
                   sellerName.includes(memberName.toLowerCase())
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
    
    // Fecha de sincronización
    syncedAt: new Date().toISOString(),
  }

  // Check if lead exists
  const { data: existingLead } = await supabase
    .from("leads")
    .select("id")
    .eq("external_id", card.id)
    .maybeSingle()

  const leadData: any = {
    agency_id: settings.agency_id,
    source: "Trello" as const,
    external_id: card.id,
    trello_url: card.url || card.shortUrl,
    trello_list_id: card.idList, // Guardar el ID de la lista de Trello
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
 * Fetch a single card from Trello by ID
 * Obtiene TODA la información disponible según la documentación oficial de Trello
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

    const response = await fetch(
      `https://api.trello.com/1/cards/${cardId}?${params.toString()}`
    )

    if (!response.ok) {
      if (response.status === 404) {
        return null // Card deleted
      }
      const errorText = await response.text()
      console.error(`❌ Trello API error (${response.status}):`, errorText)
      
      // Si es rate limit, lanzar error específico para que se maneje con retry
      if (response.status === 429) {
        throw new Error(`Trello API error: Too Many Requests (429) - ${errorText}`)
      }
      
      throw new Error(`Trello API error: ${response.statusText}`)
    }

    const card = await response.json()
    
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

