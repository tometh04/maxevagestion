/**
 * Base de comisiones neta de IVA (VIB-95).
 *
 * Por pedido de Yamil (Lozada Rosario), las comisiones de vendedores y
 * referidores pueden calcularse sobre la ganancia NETA de IVA en vez de la
 * bruta:
 *
 *   ganancia bruta  = venta − costo de operadores  (operations.margin_amount)
 *   ganancia neta   = bruta × (1 − alícuota)        (ej. bruta 1.000 → 895 al 10,5%)
 *
 * Es opt-in y por agencia (financial_settings): default OFF, así ninguna otra
 * agencia cambia de comportamiento. Es INDEPENDIENTE del IVA fiscal (iva_sales);
 * solo cambia la base con la que se reparten comisiones.
 *
 * El módulo está partido: `resolveCommissionBase` es puro y testeable;
 * `getCommissionBaseConfig` lee la config de la agencia.
 */

export interface CommissionBaseConfig {
  /** Si false, la base es la ganancia bruta (comportamiento histórico). */
  enabled: boolean
  /** Alícuota a descontar (0.105 = 10,5%). Solo se usa si enabled. */
  rate: number
  /** Corte: solo operaciones con operation_date >= from usan base neta. NULL = todas. */
  from: string | null
}

export interface ResolvedCommissionBase {
  /** Base efectiva a multiplicar por el porcentaje de comisión. */
  base: number
  grossMargin: number
  /** IVA descontado (grossMargin − netMargin). 0 si no se aplicó. */
  ivaAmount: number
  netMargin: number
  /** true si se descontó IVA (config activa y fecha en rango). */
  applied: boolean
}

export const DEFAULT_COMMISSION_IVA_RATE = 0.105

export const COMMISSION_BASE_CONFIG_DISABLED: CommissionBaseConfig = {
  enabled: false,
  rate: DEFAULT_COMMISSION_IVA_RATE,
  from: null,
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

/**
 * Decide la base de comisión a partir de la ganancia bruta y la config de la
 * agencia. Puro: sin base de datos, sin efectos.
 *
 * La fecha se compara por día (YYYY-MM-DD). Si hay corte y la operación no tiene
 * fecha, NO se aplica el descuento: preferimos no bajar una comisión por una
 * fecha desconocida.
 */
export function resolveCommissionBase(
  grossMargin: number,
  operationDate: string | null | undefined,
  config: CommissionBaseConfig | null | undefined,
): ResolvedCommissionBase {
  const gross = round2(Number(grossMargin) || 0)
  const disabled: ResolvedCommissionBase = {
    base: gross,
    grossMargin: gross,
    ivaAmount: 0,
    netMargin: gross,
    applied: false,
  }

  if (!config || !config.enabled) return disabled

  const rate = Number(config.rate)
  if (!Number.isFinite(rate) || rate <= 0 || rate >= 1) return disabled

  if (config.from) {
    const opDay = (operationDate || "").slice(0, 10)
    if (!opDay || opDay < config.from) return disabled
  }

  const net = round2(gross * (1 - rate))
  return {
    base: net,
    grossMargin: gross,
    ivaAmount: round2(gross - net),
    netMargin: net,
    applied: true,
  }
}

/**
 * Lee la config de base de comisiones de una agencia desde financial_settings.
 * Si no hay agencia o no hay fila, devuelve la config deshabilitada (base bruta).
 * Best-effort: ante un error de lectura no rompe el cálculo, cae a bruta.
 */
export async function getCommissionBaseConfig(
  supabase: any,
  agencyId: string | null | undefined,
): Promise<CommissionBaseConfig> {
  if (!agencyId) return COMMISSION_BASE_CONFIG_DISABLED

  try {
    const { data, error } = await supabase
      .from("financial_settings")
      .select("commission_base_net_of_iva, commission_iva_rate, commission_net_from")
      .eq("agency_id", agencyId)
      .maybeSingle()

    if (error || !data) return COMMISSION_BASE_CONFIG_DISABLED

    return mapRowToConfig(data)
  } catch (err) {
    console.error("[Commissions] No se pudo leer config de base neta:", err)
    return COMMISSION_BASE_CONFIG_DISABLED
  }
}

function mapRowToConfig(data: any): CommissionBaseConfig {
  return {
    enabled: data?.commission_base_net_of_iva === true,
    rate:
      data?.commission_iva_rate != null
        ? Number(data.commission_iva_rate)
        : DEFAULT_COMMISSION_IVA_RATE,
    from: data?.commission_net_from ?? null,
  }
}

/**
 * Carga la config de base neta de varias agencias de una sola query.
 * Devuelve un Map por agency_id; las agencias sin fila caen a deshabilitada.
 * Best-effort: ante un error, todas caen a deshabilitada (base bruta).
 */
export async function getCommissionBaseConfigsForAgencies(
  supabase: any,
  agencyIds: Array<string | null | undefined>,
): Promise<Map<string, CommissionBaseConfig>> {
  const result = new Map<string, CommissionBaseConfig>()
  const ids = Array.from(
    new Set(agencyIds.filter((id): id is string => typeof id === "string" && id.length > 0)),
  )
  if (ids.length === 0) return result

  try {
    const { data, error } = await supabase
      .from("financial_settings")
      .select("agency_id, commission_base_net_of_iva, commission_iva_rate, commission_net_from")
      .in("agency_id", ids)

    if (error || !data) return result

    for (const row of data as any[]) {
      if (row?.agency_id) result.set(row.agency_id, mapRowToConfig(row))
    }
  } catch (err) {
    console.error("[Commissions] No se pudieron leer configs de base neta:", err)
  }

  return result
}
