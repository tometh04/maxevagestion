import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Resolución de nombres de lista del CRM legacy (`crm_mode = 'legacy'`).
 *
 * Contexto: en legacy la columna del kanban ES el string `leads.list_name`. No
 * hay tabla de listas con id, así que cualquier variación de texto crea una
 * columna nueva. Los integradores (ManyChat, Eve) calculan un nombre candidato
 * con lógica heredada de Zapier (`determineListName`) que devuelve nombres
 * fijos tipo "Leads - Caribe" o "Campaña - {BUCKET}". Si el tenant renombró sus
 * listas, esos candidatos no matchean ninguna columna y el lead cae en una
 * columna fantasma.
 *
 * Este resolver traduce el candidato al nombre REAL que la agencia tiene en
 * `manychat_list_order`. Es conservador por diseño: si no encuentra una lista
 * equivalente devuelve el candidato intacto, así un tenant que nunca renombró
 * nada sigue comportándose exactamente igual que antes.
 */

/**
 * Sinónimos por región, para que el matching reconozca renombres comunes.
 * Ej: un tenant que renombró "Leads - EEUU" a "Estados Unidos" sigue recibiendo
 * ahí los leads que llegan con region=EEUU.
 */
export const REGION_SYNONYMS: Record<string, string[]> = {
  ARGENTINA: ["argentina", "nacional"],
  CARIBE: ["caribe", "caribbean"],
  BRASIL: ["brasil", "brazil"],
  EUROPA: ["europa", "europe"],
  EEUU: ["eeuu", "ee.uu", "estados unidos", "usa", "united states"],
  CRUCEROS: ["crucero", "cruceros", "exotic", "exótico"],
  OTROS: ["otros", "otro", "other"],
}

/**
 * Normaliza un nombre para comparar sin mayúsculas, acentos, puntuación ni
 * espacios repetidos. "Campaña - EE.UU" → "campana ee uu".
 */
export function normalizeListKey(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/** Prefijos que `determineListName` antepone al nombre real del destino. */
const CANDIDATE_PREFIXES = ["leads", "campana", "cupos"]

/**
 * Quita el prefijo de un candidato ya normalizado.
 * "leads caribe" → "caribe". "caribe" → "caribe" (sin cambios).
 */
function stripCandidatePrefix(normalized: string): string {
  for (const prefix of CANDIDATE_PREFIXES) {
    if (normalized.startsWith(`${prefix} `)) {
      const core = normalized.slice(prefix.length + 1).trim()
      // "Leads" a secas es un nombre de lista válido: no dejarlo vacío.
      if (core) return core
    }
  }
  return normalized
}

/** Índice inverso: cada sinónimo normalizado apunta a su región. */
const SYNONYM_TO_REGION: Record<string, string> = (() => {
  const index: Record<string, string> = {}
  for (const [region, synonyms] of Object.entries(REGION_SYNONYMS)) {
    index[normalizeListKey(region)] = region
    for (const synonym of synonyms) {
      index[normalizeListKey(synonym)] = region
    }
  }
  return index
})()

type ListRow = { list_name: string; position: number }

/**
 * Busca entre las listas de la agencia una cuyo nombre normalizado sea
 * EXACTAMENTE igual a alguna de las claves dadas. Exact-match a propósito: un
 * `includes()` haría que una lista "Otros - Histórico" capture los leads de
 * región OTROS solo por contener la palabra.
 */
function findExact(lists: ListRow[], keys: string[]): string | null {
  for (const list of lists) {
    const normalized = normalizeListKey(list.list_name)
    if (keys.includes(normalized)) return list.list_name
  }
  return null
}

/**
 * Traduce el nombre de lista candidato al nombre real que usa la agencia.
 *
 * Orden de resolución (del match más específico al más laxo):
 *   1. El candidato completo matchea una lista tal cual → esa lista.
 *   2. El candidato sin prefijo ("Campaña - Brasil" → "Brasil") matchea → esa lista.
 *   3. El núcleo es un alias de región conocido ("EE UU" → EEUU) y la agencia
 *      tiene una lista con otro alias del mismo grupo ("Estados Unidos") → esa lista.
 *   4. Nada matchea → se devuelve el candidato sin tocar (crea su propia columna).
 *
 * El paso 4 es lo que mantiene el cambio retrocompatible: para una agencia que
 * conserva "Leads - Caribe", el paso 1 ya devuelve ese mismo string.
 */
export async function resolveListNameForAgency(
  agencyId: string,
  candidate: string,
  supabase: SupabaseClient,
): Promise<string> {
  if (!candidate?.trim()) return candidate

  const { data } = await (supabase.from("manychat_list_order") as any)
    .select("list_name, position")
    .eq("agency_id", agencyId)
    .order("position", { ascending: true })

  const lists = (data || []) as ListRow[]
  if (lists.length === 0) return candidate

  const normalizedCandidate = normalizeListKey(candidate)

  // 1. Match exacto del candidato completo.
  const direct = findExact(lists, [normalizedCandidate])
  if (direct) return direct

  // 2. Match exacto del núcleo, sin el prefijo "Leads - " / "Campaña - ".
  const core = stripCandidatePrefix(normalizedCandidate)
  if (core !== normalizedCandidate) {
    const byCore = findExact(lists, [core])
    if (byCore) return byCore
  }

  // 3. El núcleo es un alias de región: probar los demás alias del grupo.
  const region = SYNONYM_TO_REGION[core]
  if (region) {
    const aliases = [region, ...REGION_SYNONYMS[region]].map(normalizeListKey)
    const byAlias = findExact(lists, aliases)
    if (byAlias) return byAlias
  }

  // 4. Sin equivalencia: el candidato crea (o mantiene) su propia columna.
  return candidate
}
