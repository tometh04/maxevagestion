import type { SupabaseClient } from "@supabase/supabase-js"
import { REGION_SYNONYMS, normalizeListKey } from "./list-resolver"

/**
 * Lista default que se crea para una agencia nueva. Son regiones de viaje
 * estándar para una agencia argentina + nombres genéricos sin asociar a sellers.
 * Cada admin de la agencia puede después renombrar / agregar / asignar a sellers.
 *
 * Ya NO está sincronizada con un mapping hardcoded en /api/leads/route.ts:
 * el resolver `resolveListNameForRegion` lee directamente de
 * `manychat_list_order` por agency_id y matchea por nombre case-insensitive
 * con sinónimos comunes. Cada tenant puede renombrar sus listas sin romper.
 */
const DEFAULT_MANYCHAT_LISTS: Array<{ list_name: string; position: number }> = [
  { list_name: "Leads - Argentina", position: 0 },
  { list_name: "Leads - Caribe", position: 1 },
  { list_name: "Leads - Brasil", position: 2 },
  { list_name: "Leads - EEUU", position: 3 },
  { list_name: "Leads - Europa", position: 4 },
  { list_name: "Leads - Exoticos", position: 5 },
  { list_name: "Leads - Otros", position: 6 },
]

/**
 * Los sinónimos por región viven en `./list-resolver` para que la ingesta
 * (ManyChat, Eve) y la creación manual de leads usen exactamente el mismo
 * criterio de matching.
 */

/**
 * Resuelve a qué lista Manychat va un lead nuevo, en base a las listas que la
 * agencia REALMENTE tiene configuradas. Reemplaza el mapping hardcoded
 * `regionToListName` que vivía en /api/leads/route.ts y mezclaba nombres
 * Lozada-style entre tenants.
 *
 * Algoritmo:
 *   1. Cargar las listas de la agencia (manychat_list_order)
 *   2. Buscar una lista cuyo nombre sea EXACTAMENTE un sinónimo de la región
 *      (normalizado: sin acentos ni mayúsculas). "CARIBE" matchea "Caribe".
 *   2b. Si no hubo match exacto, buscar una lista que CONTENGA el sinónimo.
 *      "CARIBE" matchea "Leads - Caribe", "Caribe Premium", "🌴 Caribe", etc.
 *   3. Si nada matchea, usar la primera lista de la agencia (suele ser
 *      "Argentina" o la default principal)
 *   4. Si la agencia no tiene listas, devolver null y dejar que el caller
 *      decida (típicamente caer al string "Leads - Otros" como antes)
 */
export async function resolveListNameForRegion(
  agencyId: string,
  region: string | null | undefined,
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data: lists } = await (supabase
    .from("manychat_list_order") as any)
    .select("list_name, position")
    .eq("agency_id", agencyId)
    .order("position", { ascending: true })

  const allLists = (lists || []) as Array<{ list_name: string; position: number }>
  if (allLists.length === 0) return null

  if (!region) {
    return allLists[0].list_name
  }

  const upperRegion = region.toString().toUpperCase().trim()
  const synonyms = REGION_SYNONYMS[upperRegion] ?? [region.toString().trim()]
  const normalizedSynonyms = [upperRegion, ...synonyms]
    .map(normalizeListKey)
    .filter(Boolean)

  // 1. Match EXACTO primero (normalizado: sin acentos ni mayúsculas).
  //    Evita que una lista "Otros - Histórico" se quede con los leads de
  //    región OTROS solo por contener esa palabra.
  for (const syn of normalizedSynonyms) {
    const match = allLists.find((l) => normalizeListKey(l.list_name) === syn)
    if (match) return match.list_name
  }

  // 2. Recién después, match por contenido: cubre a los tenants que conservan
  //    los nombres con prefijo ("Leads - Caribe" para region=CARIBE).
  for (const syn of normalizedSynonyms) {
    const match = allLists.find((l) => normalizeListKey(l.list_name).includes(syn))
    if (match) return match.list_name
  }

  return allLists[0].list_name
}

/**
 * Crea las listas Manychat default para una agencia nueva. Idempotente: si la
 * agencia ya tiene listas registradas en `manychat_list_order`, no toca nada.
 *
 * Multi-tenant: requiere `org_id` además del `agency_id` porque la tabla tiene
 * RLS por org desde la SaaS conversion. El caller debe pasar el orgId del agency.
 */
export async function seedManychatListsForAgency(
  agencyId: string,
  orgId: string,
  supabase: SupabaseClient
): Promise<{ created: number; skipped: number }> {
  // 1. Validar que la agency exista y pertenezca a la org indicada
  const { data: agency, error: agencyError } = await (supabase
    .from("agencies") as any)
    .select("id, org_id")
    .eq("id", agencyId)
    .maybeSingle()

  if (agencyError || !agency) {
    throw new Error(`Agency ${agencyId} no encontrada`)
  }
  if (agency.org_id !== orgId) {
    throw new Error(
      `Agency ${agencyId} pertenece a org ${agency.org_id}, no a ${orgId}`
    )
  }

  // 2. Si ya tiene listas, no tocar (idempotente)
  const { count: existingCount } = await (supabase
    .from("manychat_list_order") as any)
    .select("id", { count: "exact", head: true })
    .eq("agency_id", agencyId)

  if ((existingCount || 0) > 0) {
    return { created: 0, skipped: existingCount || 0 }
  }

  // 3. Insertar las listas default
  const rows = DEFAULT_MANYCHAT_LISTS.map((l) => ({
    agency_id: agencyId,
    org_id: orgId,
    list_name: l.list_name,
    position: l.position,
    seller_id: null,
  }))

  const { error: insertError } = await (supabase
    .from("manychat_list_order") as any)
    .insert(rows)

  if (insertError) {
    throw new Error(`Error insertando listas: ${insertError.message}`)
  }

  return { created: rows.length, skipped: 0 }
}
