/**
 * RESULTADO FINANCIERO - Ganancia y costo de operar con una financiera.
 *
 * Cuando la agencia paga a un operador en USD a través de una financiera pasan
 * dos cosas que NO son parte del negocio turístico:
 *
 *  1. La financiera bonifica un % por pagar por depósito: sale menos plata de
 *     la caja de la que se le cancela de deuda al operador. Esa diferencia se
 *     registra como INCOME "Ganancia financiera por depósito" (ya existía).
 *  2. La financiera cobra una comisión en PESOS, que sale de otra caja (la caja
 *     ARS). Ese es el costo financiero que agrega este módulo.
 *
 * Las dos patas se netean en una línea propia del reporte societario
 * ("Resultado financiero"), entre los gastos operativos y la ganancia neta a
 * repartir. NO son gastos de la agencia: mezclarlas con alquiler y sueldos
 * distorsiona lo que se reparte entre socios, que es exactamente el problema
 * que este archivo viene a resolver.
 *
 * ┌─ Por qué el ancla es el CONCEPTO y no la cuenta contable ─────────────────┐
 * │ Los movimientos de ganancia financiera ya cargados tienen                 │
 * │ `chart_account_id = NULL` (nadie lo escribió nunca) y su `account_id` lo  │
 * │ eligió el usuario a mano en un select libre, así que puede ser cualquier  │
 * │ cuenta. El concepto es el único identificador que cubre el histórico.     │
 * │ Por eso vive acá, en un solo lugar, y lo importan los tres consumidores:  │
 * │ el escritor (pago masivo), el lector (reporte) y la exclusión del cálculo │
 * │ de Ganancias. Un rename es un cambio de una línea que TypeScript propaga; │
 * │ el test que fija los literales existe para que sea una decisión           │
 * │ consciente y no un cambio silencioso que deje los históricos huérfanos.   │
 * └───────────────────────────────────────────────────────────────────────────┘
 */

import type { CreateLedgerMovementParams, LedgerMovementMethod } from "@/lib/accounting/ledger"
import { roundMoney } from "@/lib/currency"

/** Prefijo del concepto que escribe el pago masivo para el costo financiero. */
export const FINANCIAL_COST_CONCEPT_PREFIX = "Costo financiero por depósito"

/** Prefijo del concepto de la ganancia financiera (lo escribe el bloque de bonificación). */
export const FINANCIAL_INCOME_CONCEPT_PREFIX = "Ganancia financiera por depósito"

/**
 * Patrones para el `.like()` de PostgREST. Cortan ANTES del acento a propósito:
 * son ASCII puro, así que ninguna diferencia de encoding entre el cliente y la
 * base puede hacer que un movimiento deje de matchear.
 */
export const FINANCIAL_COST_LIKE = "Costo financiero%"
export const FINANCIAL_INCOME_LIKE = "Ganancia financiera%"

/** Prefijo en minúsculas para comparar sin depender de acentos ni mayúsculas. */
const COST_MATCH = "costo financiero"
const INCOME_MATCH = "ganancia financiera"

/** ¿El concepto corresponde a un costo financiero (comisión de la financiera)? */
export function isFinancialCostConcept(concept: string | null | undefined): boolean {
  if (!concept) return false
  return concept.trim().toLowerCase().startsWith(COST_MATCH)
}

/** ¿El concepto corresponde a una ganancia financiera (bonificación por depósito)? */
export function isFinancialIncomeConcept(concept: string | null | undefined): boolean {
  if (!concept) return false
  return concept.trim().toLowerCase().startsWith(INCOME_MATCH)
}

export interface BuildFinancialCostMovementParams {
  orgId: string
  /** Cuenta en ARS de la que sale la comisión. NO es la cuenta del pago. */
  accountId: string
  /** Monto exacto en pesos que cobró la financiera. */
  amountArs: number
  /** Método derivado del tipo de la cuenta del fee (no del de la cuenta del pago). */
  method: LedgerMovementMethod
  receiptNumber: string | null
  /** Fecha del pago. Se imputa acá y no a NOW() para que el neteo del reporte
   *  no se parta cuando el pago se carga después del cierre de mes. */
  paymentDate?: string | null
  paymentsCount: number
  createdBy: string | null
}

/**
 * Arma el asiento del costo financiero.
 *
 * Es UN solo movimiento, contra la caja de la que sale la plata. No hay
 * contrapartida contra una cuenta de "Gastos Financieros": un segundo EXPENSE
 * se contaría dos veces en el balance de cuentas, en el ledger y en este mismo
 * reporte (el costo de operador se salva de eso sólo porque su segundo asiento
 * usa `type = "OPERATOR_PAYMENT"`, un tipo que acá no existe).
 *
 * El concepto lleva el comprobante: es lo que permite detectar el reintento del
 * mismo lote sin necesidad de una tabla de idempotencia.
 */
export function buildFinancialCostMovement(
  params: BuildFinancialCostMovementParams
): CreateLedgerMovementParams {
  const amount = roundMoney(params.amountArs)
  const receipt = params.receiptNumber?.trim() || null

  return {
    // El fee es por transferencia, no por pasajero: no se imputa a ninguna
    // operación ni se prorratea entre los files del lote.
    operation_id: null,
    lead_id: null,
    type: "EXPENSE",
    concept: buildFinancialCostConcept(receipt),
    // El monto se carga en pesos, no se deriva del USD pagado: no hay
    // conversión y por lo tanto tampoco tipo de cambio que declarar.
    currency: "ARS",
    amount_original: amount,
    exchange_rate: null,
    amount_ars_equivalent: amount,
    method: params.method,
    account_id: params.accountId,
    // La comisión es de la financiera, no del operador: dejar `operator_id` en
    // null evita que aparezca como "costo del operador X" en los filtros.
    seller_id: null,
    operator_id: null,
    receipt_number: receipt,
    notes: `Comisión de financiera por pago a operador - ${params.paymentsCount} pago(s)`,
    created_by: params.createdBy,
    org_id: params.orgId,
    movement_date: params.paymentDate || null,
  }
}

/** Concepto exacto del costo financiero de un lote. Compartido por el escritor
 *  y por la guarda de duplicados, que matchea por igualdad. */
export function buildFinancialCostConcept(receiptNumber: string | null | undefined): string {
  const receipt = receiptNumber?.trim()
  return receipt
    ? `${FINANCIAL_COST_CONCEPT_PREFIX} - ${receipt}`
    : FINANCIAL_COST_CONCEPT_PREFIX
}

/** Concepto exacto de la ganancia financiera de un lote. Ídem. */
export function buildFinancialIncomeConcept(receiptNumber: string | null | undefined): string {
  const receipt = receiptNumber?.trim()
  return receipt
    ? `${FINANCIAL_INCOME_CONCEPT_PREFIX} - ${receipt}`
    : FINANCIAL_INCOME_CONCEPT_PREFIX
}
