import { createServerClient } from "@/lib/supabase/server"
import { resolveListNameForAgency } from "./list-resolver"

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
  source?: string // "agenteblanco" | "manychat" | ...  (default: Manychat)
  manychat_user_id?: string
  flow_id?: string
  page_id?: string
  timestamp?: string
}

/**
 * Normalizar el `source` del payload al valor canónico que guardamos en
 * `leads.source` (respeta el CHECK constraint de la columna).
 *
 * - Vacío / ausente → "Manychat" (comportamiento legacy: este endpoint nació
 *   como webhook de ManyChat).
 * - "agenteblanco" / "agente blanco" → "Agente Blanco" (CRM de Instagram DM).
 * - Cualquier otro valor no reconocido → "Manychat" (evita violar el CHECK
 *   constraint con un origen inesperado).
 *
 * Es importante que el mapeo sea determinístico: Agente Blanco manda dos POST
 * por lead con el mismo `source`, y la deduplicación filtra por este valor.
 */
export function normalizeSource(raw: string | undefined): string {
  const s = (raw || "").trim().toLowerCase()
  if (!s) return "Manychat"

  const aliases: Record<string, string> = {
    "agenteblanco": "Agente Blanco",
    "agente blanco": "Agente Blanco",
    "manychat": "Manychat",
  }

  return aliases[s] || "Manychat"
}

export type LeadStatus = "NEW" | "IN_PROGRESS" | "QUOTED" | "WON" | "LOST"

/**
 * Rank de avance del pipeline. WON y LOST son terminales y comparten rank
 * (nunca queremos que un update mueva un lead de WON a LOST ni viceversa).
 */
const STATUS_RANK: Record<LeadStatus, number> = {
  NEW: 0,
  IN_PROGRESS: 1,
  QUOTED: 2,
  WON: 3,
  LOST: 3,
}

/**
 * "Solo avanza, nunca retrocede": devuelve true solo si `incoming` representa
 * una etapa estrictamente más avanzada que `current`. Así un segundo POST con
 * phase="initial" no vuelve a NEW un lead que un asesor ya movió a QUOTED.
 */
export function shouldAdvanceStatus(
  current: string | null | undefined,
  incoming: string | null | undefined
): boolean {
  const c = STATUS_RANK[(current || "") as LeadStatus]
  const i = STATUS_RANK[(incoming || "") as LeadStatus]
  if (i === undefined) return false // status entrante desconocido → no tocar
  if (c === undefined) return true // status actual desconocido → aceptar el nuevo
  return i > c
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
 * Determinar agency_id + org_id para un lead entrante de ManyChat.
 *
 * VIB-61 / regla de integraciones: la org es AUTORITATIVA desde el token del
 * webhook (`org_integrations.org_id`), nunca desde el body ni desde un match de
 * nombre global. Hay múltiples tenants con agencias homónimas (ej: 3 orgs
 * "Lozada", cada una con "Rosario"/"Madero"): resolver por nombre sin scope de
 * org puede meter el lead en el tenant equivocado o dejar `org_id` inconsistente.
 *
 * Por eso, cuando conocemos `orgId`:
 *  - Buscamos la agencia SOLO dentro de esa org.
 *  - El fallback es la agencia más antigua de esa org (determinístico), no un
 *    hardcode "Rosario" global.
 *  - El `org_id` devuelto es siempre el del token.
 *
 * Sin `orgId` (solo el webhook legacy X-API-Key global, deprecado) mantenemos el
 * match por nombre acotado, prefiriendo fallar antes que asignar cross-tenant.
 */
export async function determineAgencyId(
  agencyTag: string | undefined,
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  orgId?: string | null
): Promise<{ agency_id: string; org_id: string }> {
  const empty = { agency_id: "", org_id: "" }

  // Busca la primera agencia cuyo nombre matchee `term`, scopeada a la org si la
  // conocemos. `.limit(1)` en vez de `.maybeSingle()`: con varios matches
  // (homónimos) maybeSingle tira error; acá tomamos uno determinístico.
  const findByName = async (term: string) => {
    let q = (supabase.from("agencies") as any).select("id, org_id").ilike("name", `%${term}%`)
    if (orgId) q = q.eq("org_id", orgId)
    const { data } = await q.order("name", { ascending: true }).limit(1)
    const row = (data || [])[0]
    return row ? { agency_id: row.id as string, org_id: (orgId ?? row.org_id) as string } : null
  }

  const normalizedTag = (agencyTag || "").toLowerCase().trim()
  if (normalizedTag) {
    const tagMap: Record<string, string> = { rosario: "rosario", madero: "madero" }
    const hit = await findByName(tagMap[normalizedTag] || normalizedTag)
    if (hit) return hit
  }

  if (orgId) {
    // Fallback determinístico: agencia más antigua de la org del token.
    const { data } = await (supabase.from("agencies") as any)
      .select("id, org_id")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true })
      .limit(1)
    const row = (data || [])[0]
    return row ? { agency_id: row.id as string, org_id: orgId } : empty
  }

  // Sin org conocida (legacy): último recurso acotado a "rosario".
  const rosario = await findByName("rosario")
  return rosario ?? empty
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
 * 2. Si BUCKET incluye "cupo" → "Cupos - ${BUCKET}"
 * 3. Si BUCKET existe (con o sin WhatsApp) → "Campaña - ${BUCKET}"
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

  // 2. BUCKET existe → lista de campaña específica (ej: "Campaña - EUROPA - SEPTIEMBRE OCTUBRE")
  // Los leads orgánicos van a "Leads - {región}" (sin bucket), los de campaña tienen su propia lista
  if (normalizedBucket) {
    return `Campaña - ${bucketValue}`
  }

  // 3. SIN BUCKET + WHATSAPP → detectar región
  if (!normalizedBucket && normalizedWhatsapp) {
    return detectRegionList(region, manychatData.destino)
  }

  // 4. DEFAULT → "Leads - Instagram"
  return "Leads - Instagram"
}


/**
 * Campos del payload que se guardan crudos en `manychat_full_data` (JSONB).
 * El merge solo pisa una key existente si el valor entrante es no-vacío.
 */
const FULL_DATA_KEYS: (keyof ManychatLeadData)[] = [
  "ig", "name", "bucket", "region", "whatsapp", "destino", "fechas",
  "personas", "menores", "presupuesto", "servicio", "evento", "phase",
  "agency", "manychat_user_id", "flow_id", "page_id", "timestamp",
]

function isNonEmpty(v: unknown): boolean {
  return typeof v === "string" ? v.trim() !== "" : v != null
}

export interface ExistingLeadRow {
  id: string
  status?: string | null
  list_name?: string | null
  manychat_full_data?: any
  contact_phone?: string | null
  contact_instagram?: string | null
}

/**
 * Construir el objeto PARCIAL de update para un lead existente (merge parcial).
 *
 * Reglas (pedido de Agente Blanco, que manda 2 POST por lead):
 * - Un campo ausente o vacío NO se incluye en el patch → NO pisa el valor
 *   existente. "campo ausente" = "no tocar", nunca "setear a null/vacío".
 * - `manychat_full_data` se MERGEA (no se reemplaza): overlay solo de las keys
 *   entrantes no-vacías sobre el JSONB existente.
 * - `notes` se reconstruye desde el `manychat_full_data` ya mergeado, así el
 *   WhatsApp del primer POST y el destino del segundo conviven.
 * - `status` solo AVANZA (nunca retrocede) y solo si el payload trae `phase`.
 * - NUNCA se tocan: `source`, `list_name`, `contact_email`, `assigned_seller_id`
 *   (el asesor pudo mover el lead de columna / cambiar el origen a mano).
 */
export function buildLeadPatch(
  existing: ExistingLeadRow,
  incoming: ManychatLeadData
): Record<string, any> {
  // 1. Merge de manychat_full_data (solo keys entrantes no-vacías)
  const existingFull =
    existing.manychat_full_data && typeof existing.manychat_full_data === "object"
      ? { ...existing.manychat_full_data }
      : {}

  const mergedFull: Record<string, any> = { ...existingFull }
  for (const key of FULL_DATA_KEYS) {
    const value = incoming[key]
    if (isNonEmpty(value)) {
      mergedFull[key] = value
    }
  }
  mergedFull.syncedAt = new Date().toISOString()

  // 2. Reconstruir notes desde el merge (superset de ambos POST)
  const notes = buildStructuredDescription(mergedFull as ManychatLeadData)

  const patch: Record<string, any> = {
    manychat_full_data: mergedFull,
    notes: notes || null,
    updated_at: new Date().toISOString(),
  }

  // 3. Campos escalares: solo si vienen no-vacíos
  const instagram = normalizeInstagram(incoming.ig)
  if (instagram) patch.contact_instagram = instagram

  const phone = (incoming.whatsapp || "").trim()
  if (phone) patch.contact_phone = phone

  const rawName = (incoming.name || "").trim()
  if (rawName) patch.contact_name = rawName

  const destino = (incoming.destino || "").trim()
  if (destino) patch.destination = destino

  // region: solo si podemos determinarla positivamente (region o destino presentes)
  if (isNonEmpty(incoming.region) || destino) {
    patch.region = normalizeRegion(incoming.region, incoming.destino)
  }

  // 4. status: solo si viene phase y solo si avanza (nunca retrocede)
  if (isNonEmpty(incoming.phase)) {
    const nextStatus = mapPhaseToStatus(incoming.phase)
    if (shouldAdvanceStatus(existing.status, nextStatus)) {
      patch.status = nextStatus
    }
  }

  return patch
}

/**
 * Registrar una lista nueva en `manychat_list_order` al inicio del kanban
 * (posición 0), desplazando las existentes. No interrumpe el flujo si falla.
 * Solo se llama al CREAR un lead (en updates no cambiamos su list_name).
 */
async function registerListOrder(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  agency_id: string,
  org_id: string,
  listName: string
): Promise<void> {
  try {
    const { data: existingList } = await (supabase
      .from("manychat_list_order") as any)
      .select("id")
      .eq("agency_id", agency_id)
      .eq("list_name", listName)
      .maybeSingle()

    if (existingList) return

    // Obtener listas actuales para desplazarlas hacia adelante
    const { data: currentLists } = await (supabase
      .from("manychat_list_order") as any)
      .select("list_name, position, seller_id")
      .eq("agency_id", agency_id)
      .order("position", { ascending: true })

    if (currentLists && currentLists.length > 0) {
      // Eliminar las existentes y re-insertar con posiciones +1, nueva lista en 0
      await (supabase.from("manychat_list_order") as any)
        .delete()
        .eq("agency_id", agency_id)

      const shiftedData = [
        { agency_id, org_id: org_id || undefined, list_name: listName, position: 0, seller_id: null },
        ...currentLists.map((list: any, idx: number) => ({
          agency_id,
          org_id: org_id || undefined,
          list_name: list.list_name,
          position: idx + 1,
          seller_id: list.seller_id || null,
        })),
      ]

      await (supabase.from("manychat_list_order") as any)
        .insert(shiftedData)
    } else {
      // No hay listas previas, insertar directamente en posición 0
      await (supabase.from("manychat_list_order") as any)
        .insert({ agency_id, org_id: org_id || undefined, list_name: listName, position: 0, seller_id: null })
    }

    console.log(`✅ Lista "${listName}" registrada en posición 0 del kanban`)
  } catch (listError) {
    // No interrumpir el flujo principal si falla el registro de la lista
    console.error("⚠️ Error registrando lista en manychat_list_order:", listError)
  }
}

/**
 * Sync Manychat lead data to a lead in the database.
 */
export async function syncManychatLeadToLead(
  manychatData: ManychatLeadData,
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  orgId?: string | null
): Promise<{ created: boolean; leadId: string }> {

  // 1. Determinar agency_id + org_id. `orgId` viene del token del webhook y es
  //    autoritativo: scopea el match de agencia y se fuerza como org del lead.
  const { agency_id, org_id: resolvedOrgId } = await determineAgencyId(
    manychatData.agency,
    supabase,
    orgId
  )
  // La org del token siempre gana sobre lo que devuelva el match de agencia.
  const org_id = orgId ?? resolvedOrgId

  if (!agency_id) {
    throw new Error("No se pudo determinar la agencia. Verifica que existan agencias en la base de datos.")
  }

  // 2. Origen del lead. Default "Manychat" (retrocompat: este endpoint nació
  //    como webhook de ManyChat). El flujo ManyChat legacy scopea la dedup por
  //    lista (misma persona en campañas distintas = leads separados); otros
  //    orígenes (ej. Agente Blanco) NO, porque mandan un POST temprano sin
  //    destino y otro con destino → list_name distinto para el mismo lead.
  const sourceValue = normalizeSource(manychatData.source)
  const scopeByList = sourceValue === "Manychat"

  // 3. Nombre de lista (solo se usa al CREAR; en update no tocamos list_name).
  //    `determineListName` devuelve los nombres heredados de Zapier
  //    ("Leads - Caribe", "Campaña - {BUCKET}"). El resolver los traduce al
  //    nombre real que la agencia tiene configurado, para no recrear columnas
  //    viejas en tenants que unificaron sus listas. Si no hay equivalencia,
  //    devuelve el candidato intacto.
  const listName = await resolveListNameForAgency(
    agency_id,
    determineListName(manychatData),
    supabase as any
  )

  // 4. Deduplicación por clave estable: manychat_user_id → teléfono → Instagram.
  //    Scope: mismo source + misma agencia (+ lista solo para ManyChat legacy).
  const contact_phone = (manychatData.whatsapp || "").trim()
  const contact_instagram = normalizeInstagram(manychatData.ig)
  const manychatUserId = (manychatData.manychat_user_id || "").trim()

  const SELECT_COLS =
    "id, status, list_name, manychat_full_data, contact_phone, contact_instagram"

  let existingLead: ExistingLeadRow | null = null

  // 4a. Por manychat_user_id (clave estable entre ambos POST, independiente de la
  //     lista). Solo para orígenes multi-POST (no ManyChat): así el flujo ManyChat
  //     legacy conserva su dedup EXACTA por teléfono→Instagram scopeada por lista.
  if (manychatUserId && !scopeByList) {
    const { data } = await (supabase.from("leads") as any)
      .select(SELECT_COLS)
      .eq("manychat_full_data->>manychat_user_id", manychatUserId)
      .eq("source", sourceValue)
      .eq("agency_id", agency_id)
      .maybeSingle()
    if (data) existingLead = data as ExistingLeadRow
  }

  // 4b. Por teléfono
  if (!existingLead && contact_phone) {
    let q = (supabase.from("leads") as any)
      .select(SELECT_COLS)
      .eq("contact_phone", contact_phone)
      .eq("source", sourceValue)
      .eq("agency_id", agency_id)
    if (scopeByList) q = q.eq("list_name", listName)
    const { data } = await q.maybeSingle()
    if (data) existingLead = data as ExistingLeadRow
  }

  // 4c. Por Instagram (resuelve el caso "POST temprano sin teléfono, luego con teléfono")
  if (!existingLead && contact_instagram) {
    let q = (supabase.from("leads") as any)
      .select(SELECT_COLS)
      .eq("contact_instagram", contact_instagram)
      .eq("source", sourceValue)
      .eq("agency_id", agency_id)
    if (scopeByList) q = q.eq("list_name", listName)
    const { data } = await q.maybeSingle()
    if (data) existingLead = data as ExistingLeadRow
  }

  // 5. UPDATE: merge parcial. No pisa valores existentes con campos ausentes,
  //    no retrocede el status y no toca list_name (respeta al asesor).
  if (existingLead) {
    const patch = buildLeadPatch(existingLead, manychatData)
    const { error: updateError } = await (supabase.from("leads") as any)
      .update(patch)
      .eq("id", existingLead.id)

    if (updateError) {
      console.error("❌ Error updating lead:", updateError)
      throw new Error(`Error updating lead: ${updateError.message}`)
    }

    console.log(`✅ Lead actualizado (${sourceValue}):`, existingLead.id)
    return { created: false, leadId: existingLead.id }
  }

  // 6. CREATE: registrar la lista en el kanban y crear el lead completo.
  console.log(`✅ Lead de ${sourceValue} asignado a lista: "${listName}"`)
  await registerListOrder(supabase, agency_id, org_id, listName)

  const rawName = (manychatData.name || "").trim()
  // contact_name = solo el nombre de la persona (destino y teléfono tienen sus propios campos)
  const contact_name =
    rawName || (contact_instagram ? `@${contact_instagram}` : (contact_phone || "Sin nombre"))
  const destination = (manychatData.destino || "Sin destino").trim()
  const region = normalizeRegion(manychatData.region, manychatData.destino)
  const status = mapPhaseToStatus(manychatData.phase)
  const notes = buildStructuredDescription(manychatData)

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

  const leadData: any = {
    agency_id,
    org_id: org_id || undefined,
    source: sourceValue,
    status,
    region,
    destination,
    contact_name,
    contact_phone: contact_phone || "",
    contact_email: null, // el payload no envía email por ahora
    contact_instagram,
    assigned_seller_id: null, // No se asigna automáticamente
    notes: notes || null,
    manychat_full_data: manychatFullData,
    list_name: listName, // Nombre de la lista para el kanban
    updated_at: new Date().toISOString(),
  }

  const { data: newLead, error } = await (supabase.from("leads") as any)
    .insert(leadData)
    .select("id")
    .single()

  if (error) {
    console.error("❌ Error creating lead:", error)
    throw new Error(`Error creating lead: ${error.message}`)
  }

  console.log(`✅ Lead creado (${sourceValue}):`, (newLead as any).id)
  return { created: true, leadId: (newLead as any).id }
}

