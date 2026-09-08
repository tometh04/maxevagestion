/**
 * Ventas de un cliente que quedaron sin comisión de referido.
 *
 * La comisión al referidor se calcula al cargar y al editar la venta, mirando
 * si el cliente está marcado como referido. Si el referidor se carga DESPUÉS
 * —el caso real: el vendedor se olvidó y lo agregaron una hora más tarde— esa
 * venta ya pasó y nadie vuelve a mirarla, así que la comisión no existe.
 *
 * Este módulo arma la lista de esas ventas con el importe que le correspondería
 * a cada una, para que un administrador elija a cuáles aplicársela. A propósito
 * NO es automático: marcar como referido a un cliente que compra hace años le
 * generaría comisiones al referidor por ventas que no trajo.
 *
 * El importe se previsualiza con las mismas reglas con las que después se
 * guarda (`resolveReferralForCustomer` + `resolveCommissionBase`), así la
 * pantalla no promete un número distinto del que termina quedando.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import {
  COMMISSION_BASE_CONFIG_DISABLED,
  getCommissionBaseConfigsForAgencies,
  resolveCommissionBase,
} from "@/lib/commissions/net-base"
import { resolveReferralForCustomer, type ReferralResolution } from "@/lib/referrals/calculate"

/** Tope de ventas a revisar. Es una pantalla de repaso, no un reporte. */
export const PENDING_REFERRAL_LIMIT = 100

export interface PendingReferralOperation {
  operationId: string
  fileCode: string | null
  operationDate: string | null
  destination: string | null
  agencyId: string | null
  saleAmount: number
  marginAmount: number
  currency: string
  /** Base sobre la que se calcula (neta de IVA si la agencia lo tiene activo). */
  baseAmount: number
  percentage: number
  /** Lo que se le generaría al referidor si se aplica. */
  amount: number
}

export interface PendingReferralResult {
  referral: ReferralResolution
  operations: PendingReferralOperation[]
  /** true si el cliente tiene más ventas que el tope revisado. */
  truncated: boolean
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

export interface FindPendingReferralParams {
  supabase: SupabaseClient<any, any, any>
  customerId: string
  orgId: string
  /** Agencias visibles del usuario. Vacío = sin restricción. */
  agencyIds?: string[]
  limit?: number
}

/**
 * Ventas donde este cliente es el pasajero principal, con ganancia positiva y
 * todavía sin comisión de referido.
 */
export async function findOperationsMissingReferralCommission({
  supabase,
  customerId,
  orgId,
  agencyIds = [],
  limit = PENDING_REFERRAL_LIMIT,
}: FindPendingReferralParams): Promise<PendingReferralResult> {
  const referral = await resolveReferralForCustomer(supabase, customerId)

  const empty: PendingReferralResult = { referral, operations: [], truncated: false }
  if (!referral.partnerId || referral.percentage <= 0) return empty

  // Solo las ventas donde es el pasajero principal: la comisión del referidor
  // se calcula sobre el cliente MAIN de la operación, igual que en el alta.
  const { data: links } = await (supabase.from("operation_customers") as any)
    .select("operation_id")
    .eq("customer_id", customerId)
    .eq("role", "MAIN")

  const operationIds = (links ?? []).map((row: any) => row.operation_id).filter(Boolean)
  if (operationIds.length === 0) return empty

  let query = (supabase.from("operations") as any)
    .select(
      "id, file_code, operation_date, destination, agency_id, sale_amount_total, margin_amount, sale_currency, currency, status"
    )
    .in("id", operationIds)
    .eq("org_id", orgId)
    .neq("status", "CANCELLED")
    .gt("margin_amount", 0)
    .order("operation_date", { ascending: false })
    .limit(limit + 1)

  // Un usuario acotado a una oficina no puede generarle comisiones a otra.
  if (agencyIds.length > 0) query = query.in("agency_id", agencyIds)

  const { data: operations, error } = await query
  if (error) throw new Error(error.message)

  const rows = (operations ?? []) as any[]
  const truncated = rows.length > limit
  const candidates = truncated ? rows.slice(0, limit) : rows
  if (candidates.length === 0) return empty

  // Las que ya tienen comisión quedan afuera: acá solo se completa lo que falta,
  // nunca se pisa una comisión existente (menos si ya se liquidó).
  const { data: existing } = await (supabase.from("referral_commissions") as any)
    .select("operation_id")
    .in(
      "operation_id",
      candidates.map((op) => op.id)
    )
    .eq("org_id", orgId)

  const alreadyHas = new Set((existing ?? []).map((row: any) => row.operation_id))

  // La base neta de IVA se configura por agencia: una sola consulta para todas
  // las oficinas involucradas, no una por venta.
  const baseConfigs = await getCommissionBaseConfigsForAgencies(
    supabase,
    candidates.map((op) => op.agency_id ?? null)
  )

  const result: PendingReferralOperation[] = []

  for (const op of candidates) {
    if (alreadyHas.has(op.id)) continue

    const marginAmount = Number(op.margin_amount) || 0
    const config = op.agency_id
      ? baseConfigs.get(op.agency_id) ?? COMMISSION_BASE_CONFIG_DISABLED
      : COMMISSION_BASE_CONFIG_DISABLED
    const base = resolveCommissionBase(marginAmount, op.operation_date, config)
    const amount = round2((base.base * referral.percentage) / 100)
    if (amount <= 0) continue

    result.push({
      operationId: op.id,
      fileCode: op.file_code ?? null,
      operationDate: op.operation_date ?? null,
      destination: op.destination ?? null,
      agencyId: op.agency_id ?? null,
      saleAmount: Number(op.sale_amount_total) || 0,
      marginAmount,
      currency: op.sale_currency || op.currency || "ARS",
      baseAmount: round2(base.base),
      percentage: referral.percentage,
      amount,
    })
  }

  return { referral, operations: result, truncated }
}
