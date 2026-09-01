/**
 * Resuelve, para un conjunto de vendedores, el porcentaje de comisión y el modo
 * de reparto en ventas compartidas (VIB-63).
 *
 * Reemplaza a `getSellerPercentage`, que hacía 1 a 3 round-trips por vendedor,
 * abría su propio cliente de Supabase y — el problema serio — **no filtraba por
 * `org_id`** al buscar la regla genérica: un vendedor sin porcentaje configurado
 * podía terminar heredando el default de otro tenant.
 *
 * Precedencia:
 *   1. `commission_rules` con `seller_id` **y la oficina de la operación**
 *      (VIB-175) — la misma persona puede cobrar distinto en cada sucursal.
 *   2. `commission_rules` con `seller_id` y sin oficina — vale en todas.
 *   3. `users.default_commission_percentage` — la fuente canónica, la que se
 *      edita en Configuración → Usuarios.
 *   4. `commission_rules` genérica de la org (`seller_id is null`).
 *   5. Sin porcentaje: `null`, y el motor de reparto lo reporta como warning.
 *
 * ⚠️ El paso 2 hace *shadowing* del paso 3: hoy Lozada tiene 13 reglas por
 * vendedor sembradas por la migración 116, así que editar el porcentaje de un
 * vendedor en Configuración → Usuarios puede no tener ningún efecto. Por eso
 * `source` viaja en el perfil: permite mostrar de dónde salió el número en vez
 * de dejar al admin cambiando un campo que no manda.
 *
 * ⚠️ VIB-175: hasta ahora `agency_id` existía en la tabla pero la resolución lo
 * ignoraba, así que cargar dos reglas para el mismo vendedor en oficinas
 * distintas hacía ganar a la más nueva **para las dos**, en silencio. Una regla
 * de OTRA oficina ahora no se mira: no puede pisar ni al default del usuario.
 */

import type { SharedSaleMode } from "@/lib/commissions/shared-split"

export type SellerPercentageSource =
  | "SELLER_AGENCY_RULE"
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
  /**
   * Quién administra a este vendedor y cobra un % de cada venta suya (VIB-102).
   * null = nadie. A diferencia de `percentage`, acá NO hay cadena de fallbacks:
   * el vínculo y su porcentaje se configuran juntos o no existen.
   */
  advisorManagerId: string | null
  /** % del administrador sobre el margen. null = sin configurar → no cobra. */
  advisorManagerPercentage: number | null
}

/** Las fuentes posibles de un porcentaje, en crudo. `null` = no hay. */
export interface PercentageSources {
  /**
   * `commission_rules` con `seller_id` Y `agency_id` = la oficina en juego
   * (VIB-175). Manda sobre todo lo demás: es lo más específico que se puede
   * decir de un vendedor.
   */
  sellerAgencyRule?: number | null
  /** `commission_rules` con `seller_id` y sin oficina — el override por vendedor. */
  sellerRule: number | null
  /** `users.default_commission_percentage`. */
  userDefault: number | null
  /** `commission_rules` genérica de la org (`seller_id is null`). */
  orgRule: number | null
}

/**
 * La precedencia, sola y sin I/O.
 *
 * Está separada porque la pantalla de Reglas de Comisiones tiene que mostrar
 * cuánto cobra hoy un vendedor SIN regla propia, y ya tiene los tres números en
 * memoria. Si la repitiera por su cuenta, la pantalla y el cálculo podrían
 * decir cosas distintas sobre la misma persona.
 */
export function resolveEffectivePercentage(sources: PercentageSources): {
  percentage: number | null
  source: SellerPercentageSource
} {
  if (sources.sellerAgencyRule != null) {
    return { percentage: sources.sellerAgencyRule, source: "SELLER_AGENCY_RULE" }
  }
  if (sources.sellerRule != null) return { percentage: sources.sellerRule, source: "SELLER_RULE" }
  if (sources.userDefault != null) return { percentage: sources.userDefault, source: "USER_DEFAULT" }
  if (sources.orgRule != null) return { percentage: sources.orgRule, source: "ORG_RULE" }
  return { percentage: null, source: "NONE" }
}

function emptyProfile(sellerId: string): SellerCommissionProfile {
  return {
    sellerId,
    name: null,
    percentage: null,
    mode: "HALF",
    source: "NONE",
    advisorManagerId: null,
    advisorManagerPercentage: null,
  }
}

function normalizeMode(raw: unknown): SharedSaleMode {
  return raw === "ABSORB" ? "ABSORB" : "HALF"
}

function normalizePct(raw: unknown): number | null {
  if (raw == null) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

interface SellerRow {
  id: string
  name: string | null
  pct: unknown
  mode: unknown
  managerId: string | null
  managerPct: unknown
}

/**
 * Columnas a pedir, de la más completa a la mínima.
 *
 * La degradación existe porque PostgREST rechaza el select ENTERO si una
 * columna no existe: desplegar el código antes de correr la migración nos
 * dejaría sin ningún porcentaje —o sea, todas las comisiones en cero— en vez de
 * sin la función nueva. Cada escalón resigna una feature y conserva las
 * anteriores.
 */
const SELLER_COLUMN_SETS = [
  // Con administrador de asesores (VIB-102, migración 20260805000001).
  "id, name, default_commission_percentage, shared_sale_commission_mode, advisor_manager_id, advisor_manager_percentage",
  // Con modo de venta compartida (VIB-63, migración 20260729000001).
  "id, name, default_commission_percentage, shared_sale_commission_mode",
  // Lo que existió siempre.
  "id, name, default_commission_percentage",
] as const

/** Trae id/nombre/porcentaje/modo/administrador de los vendedores, por org. */
async function fetchSellerRows(
  supabase: any,
  orgId: string,
  sellerIds: string[]
): Promise<SellerRow[]> {
  let lastError: string | undefined

  for (let index = 0; index < SELLER_COLUMN_SETS.length; index++) {
    const columns = SELLER_COLUMN_SETS[index]
    const { data, error } = await supabase
      .from("users")
      .select(columns)
      .in("id", sellerIds)
      .eq("org_id", orgId)

    if (error) {
      lastError = error.message
      continue
    }

    if (index > 0) {
      console.warn(
        `[Commissions] Leyendo vendedores sin las columnas nuevas (escalón ${index}): ${lastError}. ¿Faltan migraciones por correr?`
      )
    }

    return (data || []).map((r: any) => ({
      id: r.id,
      name: r.name ?? null,
      pct: r.default_commission_percentage,
      // Sin la columna, todos quedan en 'HALF': el comportamiento previo.
      mode: r.shared_sale_commission_mode,
      // Sin las columnas, nadie tiene administrador y no se genera su comisión.
      managerId: r.advisor_manager_id ?? null,
      managerPct: r.advisor_manager_percentage,
    }))
  }

  console.error("[Commissions] Error leyendo vendedores:", lastError)
  return []
}

export async function resolveSellerCommissionProfiles(
  supabase: any,
  orgId: string,
  sellerIds: Array<string | null | undefined>,
  /**
   * Oficina de la operación (VIB-175). Sin ella solo se miran las reglas sin
   * oficina, que es el comportamiento de siempre: un caller que no sabe en qué
   * sucursal está no puede elegir entre dos porcentajes.
   */
  agencyId?: string | null
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
    .select("seller_id, value, valid_from, agency_id")
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
  //
  // Se separan en dos baldes (VIB-175): la regla de ESTA oficina y la que no
  // tiene oficina y vale en todas. Una regla de OTRA oficina se descarta acá y
  // no entra a la precedencia: si entrara, el 45% de Rosario le ganaría al
  // default del usuario en las ventas de Madero, que es exactamente el bug.
  const ruleBySellerForAgency = new Map<string, number>()
  const ruleBySellerGlobal = new Map<string, number>()

  for (const rule of (sellerRules || []) as any[]) {
    if (!rule.seller_id) continue
    const value = normalizePct(rule.value)
    if (value == null) continue

    if (rule.agency_id == null) {
      if (!ruleBySellerGlobal.has(rule.seller_id)) ruleBySellerGlobal.set(rule.seller_id, value)
    } else if (agencyId && rule.agency_id === agencyId) {
      if (!ruleBySellerForAgency.has(rule.seller_id)) {
        ruleBySellerForAgency.set(rule.seller_id, value)
      }
    }
  }

  // Las fuentes en crudo. La precedencia se aplica más abajo, una sola vez y
  // con `resolveEffectivePercentage`, para que el cálculo y la pantalla de
  // Reglas de Comisiones no puedan separarse.
  const resolved = ids.map((id) => {
    const row = byId.get(id)
    // El administrador no participa de la precedencia: no hay reglas en
    // `commission_rules` para él, y heredar un default de la org sería pagarle
    // a alguien un porcentaje que nadie eligió.
    const advisorManagerId = row?.managerId ?? null
    return {
      sellerId: id,
      name: row?.name ?? null,
      mode: normalizeMode(row?.mode),
      advisorManagerId,
      advisorManagerPercentage: advisorManagerId ? normalizePct(row?.managerPct) : null,
      sellerAgencyRule: ruleBySellerForAgency.get(id) ?? null,
      sellerRule: ruleBySellerGlobal.get(id) ?? null,
      userDefault: normalizePct(row?.pct),
    }
  })

  // La regla genérica de la org solo se consulta si algún vendedor la necesita.
  // Acá el filtro por org_id SÍ es estricto: sin `seller_id` que ancle el
  // tenant, una regla con org_id nulo es justamente la que se filtraba a otras
  // organizaciones.
  const needsGeneric = resolved.some(
    (p) => p.sellerAgencyRule == null && p.sellerRule == null && p.userDefault == null
  )
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

  for (const { sellerAgencyRule, sellerRule, userDefault, ...rest } of resolved) {
    const { percentage, source } = resolveEffectivePercentage({
      sellerAgencyRule,
      sellerRule,
      userDefault,
      orgRule: genericPct,
    })

    if (percentage == null) {
      console.warn(
        `[Commissions] El vendedor ${rest.sellerId} no tiene porcentaje de comisión configurado. Cargalo en Configuración → Usuarios.`
      )
    }

    profiles.set(rest.sellerId, { ...rest, percentage, source })
  }

  return profiles
}

/** Perfil de un solo vendedor. Envoltorio sobre la versión batcheada. */
export async function resolveSellerCommissionProfile(
  supabase: any,
  orgId: string,
  sellerId: string,
  agencyId?: string | null
): Promise<SellerCommissionProfile> {
  const profiles = await resolveSellerCommissionProfiles(supabase, orgId, [sellerId], agencyId)
  return profiles.get(sellerId) ?? emptyProfile(sellerId)
}
