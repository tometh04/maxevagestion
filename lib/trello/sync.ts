import { createServerClient } from "@/lib/supabase/server"
import { CARD_NAME_SPLIT_REGEX, splitCardName } from "./constants"

export interface TrelloCard {
  id: string
  name: string
  desc: string
  url: string
  idList: string
  labels?: Array<{ id: string; name: string; color: string }>
  idMembers?: string[]
  members?: Array<{ id: string; fullName?: string; username?: string; email?: string }>
  due?: string | null
  dueComplete?: boolean
  attachments?: Array<{ id: string; name: string; url: string }>
  checklists?: Array<{ id: string; name: string; checkItems: Array<{ id: string; name: string; state: string }> }>
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

  // Check if lead exists
  const { data: existingLead } = await supabase
    .from("leads")
    .select("id")
    .eq("external_id", card.id)
    .maybeSingle()

  const leadData = {
    agency_id: settings.agency_id,
    source: "Trello" as const,
    external_id: card.id,
    trello_url: card.url,
    trello_list_id: card.idList, // Guardar el ID de la lista de Trello
    status,
    region,
    destination,
    contact_name: contactName, // Nombre EXACTO de la tarjeta
    contact_phone: phone || "",
    contact_email: email,
    contact_instagram: instagram,
    assigned_seller_id,
    notes: card.desc || null, // Descripción completa tal cual está
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
 */
export async function fetchTrelloCard(
  cardId: string,
  apiKey: string,
  token: string
): Promise<TrelloCard | null> {
  try {
    // Fetch card with all relevant fields including members
    // Usar URLSearchParams para construir la URL correctamente
    const params = new URLSearchParams({
      key: apiKey,
      token: token,
      fields: "name,desc,url,idList,labels,idMembers,due,dueComplete",
      members: "true",
      member_fields: "fullName,username,email",
      attachments: "true",
      checklists: "all",
      checklist_fields: "name,checkItems",
    })

    const response = await fetch(
      `https://api.trello.com/1/cards/${cardId}?${params.toString()}`
    )

    if (!response.ok) {
      if (response.status === 404) {
        return null // Card deleted
      }
      const errorText = await response.text()
      console.error(`Trello API error (${response.status}):`, errorText)
      throw new Error(`Trello API error: ${response.statusText}`)
    }

    const card = await response.json()
    
    // Asegurar que los miembros estén en el formato correcto
    if (card.members && Array.isArray(card.members)) {
      card.members = card.members.map((m: any) => ({
        id: m.id,
        fullName: m.fullName || m.fullname,
        username: m.username,
        email: m.email,
      }))
    }
    
    return card
  } catch (error) {
    console.error("Error fetching Trello card:", error)
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

