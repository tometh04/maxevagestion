/**
 * VIB-68: Resultado (outcome) de un lead — eje de conversión independiente del
 * pipeline (status legacy) y del funnel (advanced).
 *
 * Un lead puede estar en cualquier columna del tablero y aun así tener un
 * resultado explícito: se vendió o se descartó. La distinción entre "venta
 * real" y "venta manual" NO es un campo aparte: se deriva de si el lead tiene
 * una operación asociada (operations.lead_id).
 */

export const LEAD_OUTCOMES = ["SALE", "DISCARDED"] as const
export type LeadOutcome = (typeof LEAD_OUTCOMES)[number]

/** Valor de outcome válido para persistir, o null para "reabrir" (dejar abierto). */
export type LeadOutcomeInput = LeadOutcome | null

export function isLeadOutcome(value: unknown): value is LeadOutcome {
  return value === "SALE" || value === "DISCARDED"
}

/** Acepta el body de la API: un outcome válido o null (reabrir). */
export function parseLeadOutcomeInput(value: unknown): { ok: true; value: LeadOutcomeInput } | { ok: false } {
  if (value === null) return { ok: true, value: null }
  if (isLeadOutcome(value)) return { ok: true, value }
  return { ok: false }
}

export interface LeadResolutionInput {
  /** Columna leads.outcome. */
  outcome?: string | null
  /** Columna leads.status (pipeline legacy). Usado como fallback para descartes. */
  status?: string | null
  /** Si el lead tiene al menos una operación asociada (operations.lead_id). */
  hasOperation: boolean
}

export interface LeadResolution {
  /** Venta con operación cargada. */
  isRealSale: boolean
  /** Venta marcada a mano, sin operación todavía. */
  isManualSale: boolean
  /** Cualquier venta (real o manual). */
  isSale: boolean
  /** Descartado (marca explícita o, legacy, status LOST). */
  isDiscarded: boolean
  /** Sigue abierto / en trabajo. */
  isActive: boolean
  /** Etiqueta corta para badges de UI, o null si está abierto. */
  label: LeadResolutionLabel | null
}

export type LeadResolutionLabel = "Venta" | "Venta sin operación" | "Descartado"

/**
 * Fuente única de verdad para clasificar el resultado de un lead.
 *
 * Reglas (robustas frente a datos legacy):
 *  - Venta real:   tiene operación asociada.
 *  - Venta manual: outcome = 'SALE' y NO tiene operación.
 *  - Descartado:   no es venta y (outcome = 'DISCARDED' o status legacy = 'LOST').
 *  - Abierto:      el resto.
 *
 * Una venta siempre gana sobre un descarte: si un lead tiene operación pero
 * quedó marcado 'DISCARDED' por error, cuenta como venta real.
 */
export function resolveLeadResolution(input: LeadResolutionInput): LeadResolution {
  const { outcome, status, hasOperation } = input

  const isRealSale = hasOperation
  const isManualSale = !hasOperation && outcome === "SALE"
  const isSale = isRealSale || isManualSale

  const isDiscarded = !isSale && (outcome === "DISCARDED" || status === "LOST")
  const isActive = !isSale && !isDiscarded

  let label: LeadResolutionLabel | null = null
  if (isRealSale) label = "Venta"
  else if (isManualSale) label = "Venta sin operación"
  else if (isDiscarded) label = "Descartado"

  return { isRealSale, isManualSale, isSale, isDiscarded, isActive, label }
}
