/**
 * Helper para sumar los servicios adicionales (operation_services) a la venta
 * y al costo de una operación, de forma batch y consciente de la moneda.
 *
 * CONTEXTO (2026-07-03): la deuda del cliente y la venta bruta se calculan a
 * partir de `operations.sale_amount_total`, que representa SOLO la venta del
 * viaje base. Los `operation_services` (asistencia, asiento, transfer, etc.)
 * que el cliente compró se cargan aparte y NO se reflejan en `sale_amount_total`
 * (el POST del servicio no lo actualiza). Como consecuencia, un servicio impago
 * no aparece como cuenta por cobrar.
 *
 * Este helper devuelve, por operación, el extra de venta y de costo que aportan
 * sus servicios, para sumarlo en read-time cuando la org tiene activada la flag
 * `features.include_services_in_sale_total`. NO muta datos: es solo lectura.
 *
 * DEDUP POR MONEDA: la deuda/venta se calcula en la moneda de venta de la op.
 * Solo se suman servicios cuya moneda coincide con la de la op (mismo criterio
 * que la UI del detalle en operation-detail-client.tsx:623 y que
 * recalculateOperationTotals en operations/[id]/services/[serviceId]/route.ts).
 * Servicios en otra moneda quedan fuera del agregado (no se dolariza 1:1 acá).
 *
 * AUTO-CONSISTENCIA CON PAGOS: cuando el cliente paga un servicio se crea un
 * `payments` normal (payer_type=CUSTOMER, direction=INCOME) que ya está dentro
 * del Σ(pagos) que restan los endpoints. Por eso sumar el saleExtra y dejar que
 * la resta de pagos existente actúe NO produce doble conteo:
 *   deuda = max(0, sale_amount_total + saleExtra − pagos)
 * Servicio pagado → venta +X y pago −X (neto 0); servicio impago → +X de deuda.
 */

import { roundMoney } from "@/lib/currency"

export interface OperationCurrencies {
  id: string
  sale_currency?: string | null
  operator_cost_currency?: string | null
  currency?: string | null
}

export interface ServiceExtras {
  /** Σ sale_amount de servicios en la moneda de VENTA de la op. */
  saleExtra: number
  /** Σ cost_amount de servicios en la moneda de COSTO de la op (para margen/P&L). */
  costExtra: number
}

const CHUNK_SIZE = 200

function saleCurrencyOf(op: OperationCurrencies): string {
  return op.sale_currency || op.currency || "USD"
}

function costCurrencyOf(op: OperationCurrencies): string {
  return op.operator_cost_currency || op.currency || "USD"
}

/**
 * Batch, N+1-safe: para una lista de operaciones, suma el sale/cost de sus
 * operation_services respetando la moneda de venta/costo de cada op.
 *
 * Devuelve un mapa operationId -> { saleExtra, costExtra }. Las operaciones sin
 * servicios (o cuyos servicios están todos en otra moneda) quedan AUSENTES del
 * mapa; el caller debe tratar la ausencia como 0.
 *
 * Scoping cross-tenant: `operation_services` no tiene `org_id` (solo agency_id),
 * así que el scoping viene de que los `operation_ids` ya salieron de queries
 * scopeadas por org del user. El parámetro `orgId` se conserva por consistencia
 * de firma y trazabilidad defense-in-depth.
 */
export async function getServiceExtrasByOperation(
  supabase: any,
  operations: OperationCurrencies[],
  orgId: string
): Promise<Record<string, ServiceExtras>> {
  const result: Record<string, ServiceExtras> = {}
  if (!operations || operations.length === 0) return result

  const saleCurByOp: Record<string, string> = {}
  const costCurByOp: Record<string, string> = {}
  const ids: string[] = []
  for (const op of operations) {
    if (!op?.id) continue
    saleCurByOp[op.id] = saleCurrencyOf(op)
    costCurByOp[op.id] = costCurrencyOf(op)
    ids.push(op.id)
  }
  if (ids.length === 0) return result

  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE)
    const { data, error } = await supabase
      .from("operation_services")
      .select("operation_id, sale_amount, sale_currency, cost_amount, cost_currency")
      .in("operation_id", chunk)

    if (error) {
      console.warn("[operation-services-debt] error leyendo operation_services:", error.message)
      continue
    }

    for (const svc of data || []) {
      const opId = (svc as any).operation_id as string
      const acc = result[opId] || { saleExtra: 0, costExtra: 0 }

      if ((svc as any).sale_currency === saleCurByOp[opId]) {
        acc.saleExtra += Number((svc as any).sale_amount) || 0
      }
      if ((svc as any).cost_currency === costCurByOp[opId]) {
        acc.costExtra += Number((svc as any).cost_amount) || 0
      }

      result[opId] = acc
    }
  }

  for (const opId of Object.keys(result)) {
    result[opId].saleExtra = roundMoney(result[opId].saleExtra)
    result[opId].costExtra = roundMoney(result[opId].costExtra)
  }

  return result
}

/**
 * Fórmula pura de la deuda del cliente para una operación, en la moneda de
 * venta. Aislada para testear la matriz de casos sin tocar la base de datos.
 *
 *   deuda = max(0, saleBase + (includeServices ? serviceExtra : 0) − paidNet)
 *
 * `paidNet` es el neto de pagos del cliente (INCOME − EXPENSE) en la moneda de
 * venta. Ya incluye eventuales pagos de servicios, por eso no hay doble conteo.
 */
export function computeCustomerDebtInSaleCurrency(input: {
  saleBase: number
  serviceExtra: number
  paidNet: number
  includeServices: boolean
}): number {
  const sale = (Number(input.saleBase) || 0) + (input.includeServices ? Number(input.serviceExtra) || 0 : 0)
  return Math.max(0, roundMoney(sale - (Number(input.paidNet) || 0)))
}
