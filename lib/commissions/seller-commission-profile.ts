/**
 * Resuelve, para un conjunto de vendedores, el porcentaje de comisión y el modo
 * de reparto en ventas compartidas (VIB-63).
 *
 * Reemplaza a `getSellerPercentage`, que hacía 1 a 3 round-trips por vendedor,
 * abría su propio cliente de Supabase y — el problema serio — **no filtraba por
 * `org_id`** al buscar la regla genérica: un vendedor sin porcentaje configurado
 * podía terminar heredando el default de otro tenant.
 *
 * Precedencia (se mantiene la que ya estaba en producción):
 *   1. `commission_rules` con `seller_id` — override avanzado por vendedor.
 *   2. `users.default_commission_percentage` — la fuente canónica, la que se
 *      edita en Configuración → Usuarios.
 *   3. `commission_rules` genérica de la org (`seller_id is null`).
 *   4. Sin porcentaje: `null`, y el motor de reparto lo reporta como warning.
 *
 * ⚠️ El paso 1 hace *shadowing* del paso 2: hoy Lozada tiene 13 reglas por
 * vendedor sembradas por la migración 116, así que editar el porcentaje de un
 * vendedor en Configuración → Usuarios puede no tener ningún efecto. Por eso
 * `source` viaja en el perfil: permite mostrar de dónde salió el número en vez
 * de dejar al admin cambiando un campo que no manda.
 */

import type { SharedSaleMode } from "@/lib/commissions/shared-split"

export type SellerPercentageSource =
  | "SELLER_RULE"
  | "USER_DEFAULT"
  | "ORG_RULE"
  | "NONE"

export interface SellerCommissionProfile {
  sellerId: string
  name: string | null
  /** null = sin porcentaje configurado en ninguna de las fuentes. */
  percentage: number | null
  mode: SharedSaleMode
  source: SellerPercentageSource
}

function emptyProfile(sellerId: string): SellerCommissionProfile {
  return { sellerId, name: null, percentage: null, mode: "HALF", source: "NONE" }
}

function normalizeMode(raw: unknown): SharedSaleMode {
  return raw === "ABSORB" ? "ABSORB" : "HALF"
}

function normalizePct(raw: unknown): number | null {
  if (raw == null) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

/**
 * Trae id/nombre/porcentaje/modo de los vendedores, scopeado por org.
 *
 * `shared_sale_commission_mode` se selecciona con degradación: si el código se
 * despliega antes de que corra la migración, PostgREST rechaza el select entero
 * por columna inexistente y nos quedaríamos sin ningún porcentaje. En ese caso
 * reintenta sin la columna y todos quedan en 'HALF', que es exactamente el
 * comportamiento vigente hoy (nadie absorbe todavía).
 */
async function fetchSellerRows(
  supabase: any,
  orgId: string,
  sellerIds: string[]
): Promise<Array<{ id: string; name: string | null; pct: unknown; mode: unknown }>> {
  const withMode = await supabase
    .from("users")
    .select("id, name, default_commission_percentage, shared_sale_commission_mode")
    .in("id", sellerIds)
    .eq("org_id", orgId)

  if (!withMode.error) {
    return (withMode.data || []).map((r: any) => ({
      id: r.id,
      name: r.name ?? null,
      pct: r.default_commission_percentage,
      mode: r.shared_sale_commission_mode,
    }))
  }

  console.warn(
    "[Commissions] No se pudo leer users.shared_sale_commission_mode; se asume HALF para todos. ¿Falta correr la migración 20260729000001?",
    withMode.error?.message
  )

  const { data, error } = await supabase
    .from("users")
    .select("id, name, default_commission_percentage")
    .in("id", sellerIds)
    .eq("org_id", orgId)

  if (error) {
    console.error("[Commissions] Error leyendo vendedores:", error.message)
    return []
  }

  return (data || []).map((r: any) => ({
    id: r.id,
    name: r.name ?? null,
    pct: r.default_commission_percentage,
    mode: "HALF",
  }))
}

export async function resolveSellerCommissionProfiles(
  supabase: any,
  orgId: string,
  sellerIds: Array<string | null | undefined>
): Promise<Map<string, SellerCommissionProfile>> {
  const ids = Array.from(new Set(sellerIds.filter((id): id is string => !!id)))
  const profiles = new Map<string, SellerCommissionProfile>()
  if (ids.length === 0) return profiles

  if (!orgId) {
    // Sin org no hay forma de scopear nada: mejor devolver perfiles vacíos (que
    // el motor reporta como "sin porcentaje") que leer reglas de otro tenant.
    console.error("[Commissions] resolveSellerCommissionProfiles llamado sin orgId")
    for (const id of ids) profiles.set(id, emptyProfile(id))
    return profiles
  }

  const today = new Date().toISOString().split("T")[0]

  const sellerRows = await fetchSellerRows(supabase, orgId, ids)
  const byId = new Map(sellerRows.map((r) => [r.id, r]))

  // Reglas específicas por vendedor. El filtro por org va como
  // "de esta org o sin org": `seller_id` ya ancla el tenant (un vendedor
  // pertenece a una sola org, y arriba validamos que sea la nuestra), así que
  // acá el filtro es defensa en profundidad y no debe descartar reglas legacy
  // que quedaron con org_id nulo.
  const { data: sellerRules, error: sellerRulesError } = await supabase
    .from("commission_rules")
    .select("seller_id, value, valid_from")
    .eq("type", "SELLER")
    .in("seller_id", ids)
    .or(`org_id.eq.${orgId},org_id.is.null`)
    .lte("valid_from", today)
    .or(`valid_to.is.null,valid_to.gte.${today}`)
    .order("valid_from", { ascending: false })

  if (sellerRulesError) {
    console.error(
      "[Commissions] Error leyendo commission_rules por vendedor:",
      sellerRulesError.message
    )
  }

  // La query viene ordenada por valid_from desc; la primera de cada vendedor es
  // la vigente más reciente.
  const ruleBySeller = new Map<string, number>()
  for (const rule of (sellerRules || []) as any[]) {
    if (!rule.seller_id || ruleBySeller.has(rule.seller_id)) continue
    const value = normalizePct(rule.value)
    if (value != null) ruleBySeller.set(rule.seller_id, value)
  }

  const resolved = ids.map((id) => {
    const row = byId.get(id)
    const mode = normalizeMode(row?.mode)
    const name = row?.name ?? null

    const rulePct = ruleBySeller.get(id)
    if (rulePct != null) {
      return { sellerId: id, name, percentage: rulePct, mode, source: "SELLER_RULE" as const }
    }

    const userPct = normalizePct(row?.pct)
    if (userPct != null) {
      return { sellerId: id, name, percentage: userPct, mode, source: "USER_DEFAULT" as const }
    }

    return { sellerId: id, name, percentage: null, mode, source: "NONE" as const }
  })

  // La regla genérica de la org solo se consulta si algún vendedor la necesita.
  // Acá el filtro por org_id SÍ es estricto: sin `seller_id` que ancle el
  // tenant, una regla con org_id nulo es justamente la que se filtraba a otras
  // organizaciones.
  const needsGeneric = resolved.some((p) => p.percentage == null)
  let genericPct: number | null = null

  if (needsGeneric) {
    const { data: genericRules, error: genericError } = await supabase
      .from("commission_rules")
      .select("value")
      .eq("type", "SELLER")
      .is("seller_id", null)
      .is("destination_region", null)
      .eq("org_id", orgId)
      .lte("valid_from", today)
      .or(`valid_to.is.null,valid_to.gte.${today}`)
      .order("valid_from", { ascending: false })
      .limit(1)

    if (genericError) {
      console.error(
        "[Commissions] Error leyendo la regla genérica de comisión:",
        genericError.message
      )
    }
    genericPct = normalizePct((genericRules as any[])?.[0]?.value)
  }

  for (const profile of resolved) {
    if (profile.percentage == null && genericPct != null) {
      profiles.set(profile.sellerId, { ...profile, percentage: genericPct, source: "ORG_RULE" })
      continue
    }
    if (profile.percentage == null) {
      console.warn(
        `[Commissions] El vendedor ${profile.sellerId} no tiene porcentaje de comisión configurado. Cargalo en Configuración → Usuarios.`
      )
    }
    profiles.set(profile.sellerId, profile)
  }

  return profiles
}

/** Perfil de un solo vendedor. Envoltorio sobre la versión batcheada. */
export async function resolveSellerCommissionProfile(
  supabase: any,
  orgId: string,
  sellerId: string
): Promise<SellerCommissionProfile> {
  const profiles = await resolveSellerCommissionProfiles(supabase, orgId, [sellerId])
  return profiles.get(sellerId) ?? emptyProfile(sellerId)
}
