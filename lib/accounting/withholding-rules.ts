/**
 * Withholding Calculation Engine (Percepciones/Retenciones)
 *
 * Automatic calculation of Argentine tax withholdings based on configurable rules
 * stored in financial_settings.withholding_rules (JSONB).
 *
 * Mejora 7 – Motor de cálculo automático de percepciones y retenciones.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WithholdingType =
  | "PERCEPCION_IVA"
  | "PERCEPCION_IIBB"
  | "RETENCION_GANANCIAS"
  | "RETENCION_IVA"
  | "RETENCION_IIBB"
  | "PERCEPCION_RG5617_30"  // 30% sobre operaciones en moneda extranjera (Ganancias/Bienes Personales)
  | "PERCEPCION_RG3819_5"   // 5% sobre pagos en efectivo de turismo internacional

export type WithholdingAppliesTo =
  | "OPERATOR_PAYMENT"
  | "CUSTOMER_PAYMENT"
  | "ALL"

export interface WithholdingRule {
  type: WithholdingType
  applies_to: WithholdingAppliesTo
  rate: number // percentage (e.g. 3 means 3%)
  min_amount: number // minimum amount threshold to apply
  exempt_cuits: string[] // CUITs that are exempt
  is_active: boolean
  /** RG 5617: solo aplica a operaciones internacionales (destino fuera de Argentina) */
  requires_international_destination?: boolean
  /** RG 3819: solo aplica cuando el método de pago es efectivo */
  requires_cash_payment?: boolean
}

export interface CalculateWithholdingsParams {
  amount: number
  currency: string
  type: "OPERATOR_PAYMENT" | "CUSTOMER_PAYMENT"
  counterpart_cuit?: string
  tax_period?: string // e.g. "2026-03"
  /** Método de pago: "EFECTIVO", "TRANSFERENCIA", "MERCADOPAGO", etc. */
  payment_method?: string
  /** Destino de la operación: "Brasil", "Colombia", "Argentina", etc. */
  destination?: string
  /** Tipos de retención/percepción a excluir del cálculo */
  excluded_types?: WithholdingType[]
}

export interface WithholdingResult {
  type: WithholdingType
  amount: number
  rate: number
}

export interface AutoCreateWithholdingsParams extends CalculateWithholdingsParams {
  operation_id?: string
  operator_id?: string
  counterpart_name?: string
  withholding_date?: string
  source_type?: string
  source_id?: string
  direction?: "SUFFERED" | "PRACTICED"
  notes?: string
  created_by?: string
  agency_id?: string
  payment_method?: string
  destination?: string
}

// ---------------------------------------------------------------------------
// Default Argentine withholding rules
// ---------------------------------------------------------------------------

export const DEFAULT_WITHHOLDING_RULES: WithholdingRule[] = [
  {
    type: "PERCEPCION_IVA",
    applies_to: "ALL",
    rate: 3,
    min_amount: 50_000,
    exempt_cuits: [],
    is_active: true,
  },
  {
    type: "PERCEPCION_IIBB",
    applies_to: "ALL",
    rate: 2.5,
    min_amount: 10_000,
    exempt_cuits: [],
    is_active: true,
  },
  {
    type: "RETENCION_GANANCIAS",
    applies_to: "OPERATOR_PAYMENT",
    rate: 2,
    min_amount: 100_000,
    exempt_cuits: [],
    is_active: true,
  },
  {
    type: "RETENCION_IVA",
    applies_to: "OPERATOR_PAYMENT",
    rate: 0,
    min_amount: 0,
    exempt_cuits: [],
    is_active: false, // rate varies by condition – disabled by default
  },
  {
    type: "RETENCION_IIBB",
    applies_to: "OPERATOR_PAYMENT",
    rate: 1.5,
    min_amount: 50_000,
    exempt_cuits: [],
    is_active: false,
  },
  {
    type: "PERCEPCION_RG5617_30",
    applies_to: "CUSTOMER_PAYMENT",
    rate: 30,
    min_amount: 0,
    exempt_cuits: [],
    is_active: true,
    requires_international_destination: true,
  },
  {
    type: "PERCEPCION_RG3819_5",
    applies_to: "CUSTOMER_PAYMENT",
    rate: 5,
    min_amount: 0,
    exempt_cuits: [],
    is_active: true,
    requires_cash_payment: true,
    requires_international_destination: true,
  },
]

// ---------------------------------------------------------------------------
// Core calculation
// ---------------------------------------------------------------------------

/**
 * Determine which withholdings apply and compute amounts.
 *
 * @param rules – the set of withholding rules to evaluate (typically loaded
 *   from financial_settings.withholding_rules or the defaults above).
 * @param params – transaction details (amount, currency, payment type, etc.).
 * @returns an array of applicable withholdings with computed amounts.
 */
/**
 * Check if a destination is international (outside Argentina).
 */
function isInternationalDestination(destination?: string): boolean {
  if (!destination) return false
  const normalized = destination.trim().toLowerCase()
  const domesticKeywords = ["argentina", "nacional", "cabotaje", "domestic"]
  return !domesticKeywords.some((kw) => normalized.includes(kw))
}

/**
 * Check if a payment method is cash (efectivo).
 */
function isCashPayment(method?: string): boolean {
  if (!method) return false
  const normalized = method.trim().toLowerCase()
  return normalized === "efectivo" || normalized === "cash"
}

export function calculateWithholdings(
  rules: WithholdingRule[],
  params: CalculateWithholdingsParams
): WithholdingResult[] {
  const { amount, type, counterpart_cuit, payment_method, destination, excluded_types } = params
  const results: WithholdingResult[] = []

  for (const rule of rules) {
    // Skip inactive rules
    if (!rule.is_active) continue

    // Skip excluded types
    if (excluded_types?.includes(rule.type)) continue

    // Check if the rule applies to this payment type
    if (rule.applies_to !== "ALL" && rule.applies_to !== type) continue

    // Check minimum amount threshold
    if (amount < rule.min_amount) continue

    // Check exempt CUITs
    if (
      counterpart_cuit &&
      rule.exempt_cuits.length > 0 &&
      rule.exempt_cuits.includes(counterpart_cuit)
    ) {
      continue
    }

    // RG 5617/3819: skip if requires international destination but it's domestic
    if (rule.requires_international_destination && !isInternationalDestination(destination)) {
      continue
    }

    // RG 3819: skip if requires cash payment but it's not cash
    if (rule.requires_cash_payment && !isCashPayment(payment_method)) {
      continue
    }

    // Skip rules with 0 rate (e.g. RETENCION_IVA varies – must be configured)
    if (rule.rate <= 0) continue

    const withholdingAmount = parseFloat(((amount * rule.rate) / 100).toFixed(2))

    results.push({
      type: rule.type,
      amount: withholdingAmount,
      rate: rule.rate,
    })
  }

  return results
}

// ---------------------------------------------------------------------------
// Load rules from financial_settings
// ---------------------------------------------------------------------------

/**
 * Fetch withholding rules from the `financial_settings` table.
 * Falls back to `DEFAULT_WITHHOLDING_RULES` when none are stored.
 *
 * Master toggle: si financial_settings.withholdings_enabled = false,
 * devuelve un array vacío → el motor no genera ninguna retención/percepción.
 * Útil para agencias monotributistas o de prueba.
 */
export async function loadWithholdingRules(
  supabase: SupabaseClient,
  agencyId?: string
): Promise<WithholdingRule[]> {
  try {
    let query = (supabase.from("financial_settings") as any).select(
      "withholding_rules, withholdings_enabled"
    )

    if (agencyId) {
      query = query.eq("agency_id", agencyId)
    }

    const { data, error } = await query.maybeSingle()

    if (error) {
      console.error("Error loading withholding rules:", error)
      return DEFAULT_WITHHOLDING_RULES
    }

    // Master toggle — si está explícitamente en false, no se aplica ninguna regla.
    // null/undefined (setting viejo sin columna) = true por default.
    if (data?.withholdings_enabled === false) {
      return []
    }

    if (data?.withholding_rules && Array.isArray(data.withholding_rules)) {
      return data.withholding_rules as WithholdingRule[]
    }

    return DEFAULT_WITHHOLDING_RULES
  } catch (err) {
    console.error("Unexpected error loading withholding rules:", err)
    return DEFAULT_WITHHOLDING_RULES
  }
}

// ---------------------------------------------------------------------------
// Auto-create withholdings in the database
// ---------------------------------------------------------------------------

/**
 * Calculate withholdings and persist them to the `tax_withholdings` table.
 *
 * @returns the array of created withholding records.
 */
export async function autoCreateWithholdings(
  supabase: SupabaseClient,
  params: AutoCreateWithholdingsParams
): Promise<any[]> {
  // IDEMPOTENCY GUARD: si ya existen retenciones/percepciones para este
  // (source_type, source_id), no crear duplicados. Protege contra retries,
  // doble-click en mark-paid, o race conditions.
  if (params.source_type && params.source_id) {
    const { data: existing, error: existingError } = await (supabase.from("tax_withholdings") as any)
      .select("id, type, amount, rate_applied")
      .eq("source_type", params.source_type)
      .eq("source_id", params.source_id)

    if (!existingError && existing && existing.length > 0) {
      console.log(
        `[withholding-rules] Withholdings ya creadas para source ${params.source_type}/${params.source_id} (${existing.length} registros). Skipping duplicate creation.`
      )
      return existing
    }
  }

  // 1. Load rules
  const rules = await loadWithholdingRules(supabase, params.agency_id)

  // 2. Calculate
  const withholdings = calculateWithholdings(rules, {
    amount: params.amount,
    currency: params.currency,
    type: params.type,
    counterpart_cuit: params.counterpart_cuit,
    tax_period: params.tax_period,
    payment_method: params.payment_method,
    destination: params.destination,
  })

  if (withholdings.length === 0) return []

  // 3. Build records
  const taxPeriod =
    params.tax_period || new Date().toISOString().substring(0, 7)
  const withholdingDate =
    params.withholding_date || new Date().toISOString().split("T")[0]

  const records = withholdings.map((w) => ({
    type: w.type,
    direction: params.direction || "PRACTICED",
    source_type: params.source_type || "AUTO",
    source_id: params.source_id || null,
    operation_id: params.operation_id || null,
    operator_id: params.operator_id || null,
    counterpart_cuit: params.counterpart_cuit || null,
    counterpart_name: params.counterpart_name || null,
    currency: params.currency || "ARS",
    amount: w.amount,
    rate_applied: w.rate,
    tax_period: taxPeriod,
    withholding_date: withholdingDate,
    status: "PENDING",
    notes: params.notes || `Cálculo automático – ${w.type} ${w.rate}%`,
    created_by: params.created_by || null,
    // SaaS: siempre inyectar agency_id. El org_id lo resuelve el trigger
    // auto-org_id (mig 153) desde agency/operation/user/auth.uid() aunque
    // el caller no lo pase. Explicit agency_id ayuda al dashboard a
    // filtrar por agencia dentro de la misma org.
    agency_id: params.agency_id || null,
  }))

  // 4. Insert
  const { data, error } = await (supabase.from("tax_withholdings") as any)
    .insert(records)
    .select("*")

  if (error) {
    console.error("Error creating automatic withholdings:", error)
    throw new Error(`Error al crear retenciones/percepciones automáticas: ${error.message}`)
  }

  return data || []
}
