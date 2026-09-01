/**
 * Ajuste de liquidación de operador (VIB-174).
 *
 * EL PROBLEMA
 * -----------
 * La agencia vende estimando el costo del operador y sobre ese número calcula
 * el margen y PAGA la comisión. Meses después llega la liquidación definitiva y
 * el costo real es otro. Si el hotel salió 1.600 en vez de 1.550, la agencia
 * perdió 50 y le pagó al vendedor una comisión sobre una ganancia que no fue.
 *
 * EL CRITERIO
 * -----------
 * La operación NO se toca: conserva su costo y su margen estimados, porque ese
 * mes ya se cerró y esas comisiones ya se pagaron. La diferencia se imputa al
 * mes en que llega la liquidación, y se reparte con el vendedor usando el mismo
 * porcentaje con el que se le liquidó la comisión original.
 *
 * SIGNOS
 * ------
 *   delta  = actual − estimado     (>0 = el operador cobró más = PÉRDIDA)
 *   result = −delta                (>0 = GANANCIA para la agencia)
 *
 * El margen es venta − costo, así que un delta de costo de +50 mueve el margen
 * −50. Por eso el ajuste de comisión sale de aplicar el porcentaje del vendedor
 * sobre el DELTA DE MARGEN (−delta), y queda negativo cuando hubo pérdida: el
 * vendedor tiene que devolver.
 *
 * Este módulo es puro a propósito. La aritmética del reparto es lo que hay que
 * poder probar sin base de datos; la persistencia vive en la RPC
 * `register_operator_cost_adjustment`, que además revalida que el reparto cierre.
 */

import { resolveCommissionBase, type CommissionBaseConfig } from "@/lib/commissions/net-base"
import { esComisionDelPlan } from "@/lib/commissions/kinds"

/** Una comisión ya existente de la operación, de la que sale el porcentaje. */
export interface AdjustmentCommissionSource {
  sellerId: string
  /** Snapshot del % con el que se calculó esa comisión. */
  percentage: number | null
  sellerName?: string | null
  /** 'SELLER' o 'ADVISOR_MANAGER'. Las de servicio y las de ajuste no entran. */
  kind?: string | null
}

export interface AdjustmentReferralSource {
  percentage: number | null
  /** Solo se ajusta si comisiona sobre el margen. */
  basis: "MARGIN" | "SALE"
}

export interface OperatorCostAdjustmentInput {
  /** `operator_payments.amount` — la deuda registrada hoy. */
  currentDebtAmount: number
  /** `operator_payments.paid_amount`. */
  paidAmount?: number | null
  /** El costo real que liquidó el operador. */
  actualAmount: number
  /** Fecha de la operación, para el corte de la base neta de IVA. */
  operationDate?: string | null
  baseConfig?: CommissionBaseConfig | null
  /** Perilla por agencia. Apagada, el resultado queda 100% en la agencia. */
  splitWithSeller: boolean
  commissions?: AdjustmentCommissionSource[]
  referral?: AdjustmentReferralSource | null
}

export type AdjustmentWarningCode =
  | "no_commission"
  | "seller_without_percentage"
  | "split_disabled"
  | "referrer_basis_sale"
  | "referrer_without_percentage"
  | "below_paid_amount"

export interface AdjustmentWarning {
  code: AdjustmentWarningCode
  message: string
}

export interface AdjustmentSellerShare {
  sellerId: string
  sellerName?: string | null
  percentage: number
  /** Ajuste de comisión, con signo: negativo = el vendedor devuelve. */
  amount: number
}

export interface OperatorCostAdjustmentPlan {
  /** actual − estimado. Positivo = pérdida. */
  delta: number
  /** −delta. Positivo = ganancia para la agencia. */
  result: number
  direction: "GAIN" | "LOSS"
  /** Base sobre la que se aplicaron los porcentajes (neta de IVA si corresponde). */
  commissionBase: number
  ivaApplied: boolean
  sellerShares: AdjustmentSellerShare[]
  referrerShare: number
  agencyShare: number
  warnings: AdjustmentWarning[]
  /** false si no hay diferencia que registrar. */
  hasAdjustment: boolean
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

/**
 * Calcula el ajuste y su reparto. Puro: sin base de datos, sin efectos.
 *
 * El redondeo se hace por participante y la agencia absorbe el resto, así la
 * suma de las partes da EXACTAMENTE el resultado —que es lo que la RPC
 * revalida antes de escribir—.
 */
export function planOperatorCostAdjustment(
  input: OperatorCostAdjustmentInput,
): OperatorCostAdjustmentPlan {
  const warnings: AdjustmentWarning[] = []

  const estimated = round2(input.currentDebtAmount)
  const actual = round2(input.actualAmount)
  const delta = round2(actual - estimated)
  const result = round2(-delta)

  const empty: OperatorCostAdjustmentPlan = {
    delta: 0,
    result: 0,
    direction: "GAIN",
    commissionBase: 0,
    ivaApplied: false,
    sellerShares: [],
    referrerShare: 0,
    agencyShare: 0,
    warnings,
    hasAdjustment: false,
  }

  if (Math.abs(delta) < 0.01) return empty

  const paid = round2(input.paidAmount ?? 0)
  if (actual < paid) {
    warnings.push({
      code: "below_paid_amount",
      message: `El costo real (${actual}) es menor que lo que ya se le pagó al operador (${paid}).`,
    })
  }

  // El delta de MARGEN es −delta de costo. Se pasa por la misma función que usa
  // el cálculo de comisiones para que, si la agencia comisiona neto de IVA, el
  // ajuste use exactamente la base con la que se liquidó la comisión original.
  const resolved = resolveCommissionBase(-delta, input.operationDate, input.baseConfig)
  const marginDelta = resolved.base

  const sellerShares: AdjustmentSellerShare[] = []
  let referrerShare = 0

  if (!input.splitWithSeller) {
    warnings.push({
      code: "split_disabled",
      message: "La agencia tiene apagado el reparto de ajustes: el resultado queda entero en la agencia.",
    })
  } else {
    // Solo las comisiones que nacen del margen. Las de servicio tienen su
    // propio margen y las de ajuste ya son correcciones: volver a ajustarlas
    // sería contar dos veces la misma diferencia.
    const sources = (input.commissions ?? []).filter((c) => esComisionDelPlan(c.kind))

    if (sources.length === 0) {
      warnings.push({
        code: "no_commission",
        message: "La operación no tiene comisiones registradas: el resultado queda entero en la agencia.",
      })
    }

    for (const source of sources) {
      const pct = Number(source.percentage)
      if (!Number.isFinite(pct) || pct === 0) {
        warnings.push({
          code: "seller_without_percentage",
          message: `El vendedor ${source.sellerName ?? source.sellerId} no tiene porcentaje en su comisión original: no participa del ajuste.`,
        })
        continue
      }

      sellerShares.push({
        sellerId: source.sellerId,
        sellerName: source.sellerName ?? null,
        percentage: pct,
        amount: round2((marginDelta * pct) / 100),
      })
    }

    const referral = input.referral
    if (referral) {
      const pct = Number(referral.percentage)
      if (referral.basis !== "MARGIN") {
        warnings.push({
          code: "referrer_basis_sale",
          message: "El referidor comisiona sobre la venta, no sobre la ganancia: su comisión no cambia.",
        })
      } else if (!Number.isFinite(pct) || pct === 0) {
        warnings.push({
          code: "referrer_without_percentage",
          message: "El referidor no tiene porcentaje cargado: no participa del ajuste.",
        })
      } else {
        referrerShare = round2((marginDelta * pct) / 100)
      }
    }
  }

  const distributed = round2(
    sellerShares.reduce((sum, s) => sum + s.amount, 0) + referrerShare,
  )

  return {
    delta,
    result,
    direction: delta > 0 ? "LOSS" : "GAIN",
    commissionBase: marginDelta,
    ivaApplied: resolved.applied,
    sellerShares,
    referrerShare,
    // La agencia absorbe el resto del redondeo: así las partes suman el total exacto.
    agencyShare: round2(result - distributed),
    warnings,
    hasAdjustment: true,
  }
}

/** Payload de `p_seller_shares` para la RPC. */
export function toSellerSharesPayload(plan: OperatorCostAdjustmentPlan) {
  return plan.sellerShares.map((s) => ({
    seller_id: s.sellerId,
    percentage: s.percentage,
    amount: s.amount,
  }))
}
