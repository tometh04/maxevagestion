import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

/**
 * Normaliza un label de tag: uppercase, trim, collapse spaces, remove diacritics.
 * "  Cancún  " → "CANCUN"
 * "playa  del   carmen" → "PLAYA DEL CARMEN"
 */
export function normalizeTagLabel(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}

/**
 * Mapea el campaign_source que manda ManyChat al label de origen canónico.
 * Si no hay match, retorna null y la vendedora pone la tag a mano.
 */
export function mapCampaignToOriginLabel(
  campaignSource: string | null | undefined
): string | null {
  if (!campaignSource) return null
  const normalized = campaignSource.toLowerCase().trim()
  if (!normalized) return null

  const map: Record<string, string> = {
    mundial: "PUBLICIDAD",
    f1: "PUBLICIDAD",
    formula1: "PUBLICIDAD",
    "formula 1": "PUBLICIDAD",
    publicidad: "PUBLICIDAD",
    "meta-ads": "PUBLICIDAD",
    meta_ads: "PUBLICIDAD",
    referido: "REFERIDO",
    referral: "REFERIDO",
    organico: "DERIVACION DE TRAFICO",
    organic: "DERIVACION DE TRAFICO",
    web: "DERIVACION DE TRAFICO",
    operador: "OPERADOR",
    canal: "CANALES",
    canales: "CANALES",
  }

  return map[normalized] ?? null
}

/**
 * Busca el lead_tag por (org_id, category_name, label_normalizado).
 * Retorna null si no hay match (NO crea tags al vuelo — eso lo decide la vendedora).
 */
export async function findTagByLabel(
  admin: SupabaseClient<Database>,
  orgId: string,
  categoryName: string,
  rawLabel: string
): Promise<{ id: string } | null> {
  const normalized = normalizeTagLabel(rawLabel)
  const { data: cat } = await admin
    .from("lead_tag_categories")
    .select("id")
    .eq("org_id", orgId)
    .eq("name", categoryName)
    .maybeSingle()
  if (!cat) return null
  const { data: tag } = await admin
    .from("lead_tags")
    .select("id")
    .eq("category_id", (cat as { id: string }).id)
    .eq("label", normalized)
    .maybeSingle()
  return (tag as { id: string } | null) ?? null
}

/**
 * Payload mínimo del bot que aporta data para resolver tags.
 * Otros campos del bot (name, phone, etc.) no se usan acá.
 */
export type ManychatLeadPayload = {
  destination_text?: string | null
  travel_month?: string | null
  campaign_source?: string | null
}

/**
 * Resuelve las tags a asignar a un lead a partir del payload de ManyChat.
 * Solo retorna IDs de tags que YA existen en lead_tags — destinos no listados
 * se ignoran (la vendedora los agrega después).
 */
export async function resolveTagAssignments(
  admin: SupabaseClient<Database>,
  orgId: string,
  payload: ManychatLeadPayload
): Promise<{ tag_id: string }[]> {
  const assignments: { tag_id: string }[] = []

  if (payload.destination_text) {
    const tag = await findTagByLabel(
      admin,
      orgId,
      "destino",
      payload.destination_text
    )
    if (tag) assignments.push({ tag_id: tag.id })
  }

  if (payload.travel_month) {
    const tag = await findTagByLabel(admin, orgId, "mes", payload.travel_month)
    if (tag) assignments.push({ tag_id: tag.id })
  }

  const originLabel = mapCampaignToOriginLabel(payload.campaign_source)
  if (originLabel) {
    const tag = await findTagByLabel(admin, orgId, "origen", originLabel)
    if (tag) assignments.push({ tag_id: tag.id })
  }

  return assignments
}
