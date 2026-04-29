import { type OperatorIdentity } from "@/lib/operations/payment-operators"

export interface PurchaseSummaryOperationOperatorLike {
  id?: string | null
  operator_id?: string | null
  operators?: OperatorIdentity | null
  cost?: number | string | null
  cost_currency?: string | null
  product_type?: string | null
  notes?: string | null
}

export interface PurchaseSummaryServiceLike {
  id?: string | null
  service_type?: string | null
  description?: string | null
  operator_id?: string | null
  operators?: OperatorIdentity | null
  cost_amount?: number | string | null
  cost_currency?: string | null
}

export interface PurchaseSummaryOperationLike {
  type?: string | null
  operator_id?: string | null
  operator_cost?: number | string | null
  operator_cost_currency?: string | null
  reservation_code_air?: string | null
  reservation_code_hotel?: string | null
  operators?: OperatorIdentity | null
  operation_operators?: PurchaseSummaryOperationOperatorLike[] | null
}

export interface PurchaseSummaryLine {
  id: string
  source: "base" | "service"
  label: string
  operatorName: string
  reservationCode: string | null
  amount: number
  currency: string
  secondaryText: string | null
}

export interface PurchaseSummaryTotal {
  currency: string
  amount: number
}

export interface PurchaseSummaryResult {
  lines: PurchaseSummaryLine[]
  totals: PurchaseSummaryTotal[]
}

const BASE_PRODUCT_LABELS: Record<string, string> = {
  FLIGHT: "Aereo",
  HOTEL: "Hotel",
  PACKAGE: "Paquete",
  CRUISE: "Crucero",
  TRANSFER: "Transfer",
  MIXED: "Mixto",
  ASSISTANCE: "Asistencia",
}

const SERVICE_TYPE_LABELS: Record<string, string> = {
  HOTEL: "Hotel",
  FLIGHT: "Aereo",
  TRANSFER: "Transfer",
  EXCURSION: "Excursion",
  ASSISTANCE: "Asistencia",
  SEAT: "Asiento",
  LUGGAGE: "Equipaje",
  VISA: "Visa",
}

function toMoney(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeCurrency(value: string | null | undefined, fallback = "ARS"): string {
  const normalized = value?.trim().toUpperCase()
  return normalized || fallback
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function getOperatorName(operator: OperatorIdentity | null | undefined): string {
  return trimOrNull(operator?.name) || "Sin operador"
}

function getBaseLabel(productType: string | null | undefined, fallbackType: string | null | undefined): string {
  const normalizedProductType = productType?.trim().toUpperCase()
  if (normalizedProductType && BASE_PRODUCT_LABELS[normalizedProductType]) {
    return BASE_PRODUCT_LABELS[normalizedProductType]
  }

  const normalizedFallbackType = fallbackType?.trim().toUpperCase()
  if (normalizedFallbackType && BASE_PRODUCT_LABELS[normalizedFallbackType]) {
    return BASE_PRODUCT_LABELS[normalizedFallbackType]
  }

  return "Operacion base"
}

function getServiceLabel(serviceType: string | null | undefined): string {
  const normalizedServiceType = serviceType?.trim().toUpperCase()
  if (normalizedServiceType && SERVICE_TYPE_LABELS[normalizedServiceType]) {
    return SERVICE_TYPE_LABELS[normalizedServiceType]
  }

  return "Servicio"
}

function getBaseReservationCode(
  operation: Pick<PurchaseSummaryOperationLike, "type" | "reservation_code_air" | "reservation_code_hotel">,
  productType?: string | null
): string | null {
  const normalizedProductType = productType?.trim().toUpperCase()
  const normalizedOperationType = operation.type?.trim().toUpperCase()
  const effectiveType = normalizedProductType || normalizedOperationType || ""

  if (effectiveType === "FLIGHT") {
    return trimOrNull(operation.reservation_code_air)
  }

  if (effectiveType === "HOTEL") {
    return trimOrNull(operation.reservation_code_hotel)
  }

  return null
}

function buildLegacyBaseLine(operation: PurchaseSummaryOperationLike): PurchaseSummaryLine | null {
  const operatorId = operation.operators?.id || operation.operator_id || null
  const amount = toMoney(operation.operator_cost)

  if (!operatorId && amount <= 0) {
    return null
  }

  return {
    id: operatorId ? `base-${operatorId}` : "base-legacy",
    source: "base",
    label: getBaseLabel(null, operation.type),
    operatorName: getOperatorName(operation.operators),
    reservationCode: getBaseReservationCode(operation),
    amount,
    currency: normalizeCurrency(operation.operator_cost_currency),
    secondaryText: null,
  }
}

export function buildOperationPurchaseSummary({
  operation,
  operationServices = [],
}: {
  operation: PurchaseSummaryOperationLike
  operationServices?: PurchaseSummaryServiceLike[] | null
}): PurchaseSummaryResult {
  const baseRelations = operation.operation_operators ?? []
  const lines: PurchaseSummaryLine[] = []

  if (baseRelations.length > 0) {
    for (let index = 0; index < baseRelations.length; index += 1) {
      const relation = baseRelations[index]
      const operatorId = relation?.operators?.id || relation?.operator_id || null

      lines.push({
        id: relation?.id || (operatorId ? `base-${operatorId}` : `base-${index}`),
        source: "base",
        label: getBaseLabel(relation?.product_type, operation.type),
        operatorName: getOperatorName(relation?.operators),
        reservationCode: getBaseReservationCode(operation, relation?.product_type),
        amount: toMoney(relation?.cost),
        currency: normalizeCurrency(relation?.cost_currency, normalizeCurrency(operation.operator_cost_currency)),
        secondaryText: trimOrNull(relation?.notes),
      })
    }
  } else {
    const legacyBaseLine = buildLegacyBaseLine(operation)
    if (legacyBaseLine) {
      lines.push(legacyBaseLine)
    }
  }

  for (let index = 0; index < (operationServices ?? []).length; index += 1) {
    const service = operationServices?.[index]
    if (!service) continue

    lines.push({
      id: service.id || `service-${index}`,
      source: "service",
      label: getServiceLabel(service.service_type),
      operatorName: getOperatorName(service.operators),
      reservationCode: null,
      amount: toMoney(service.cost_amount),
      currency: normalizeCurrency(service.cost_currency),
      secondaryText: trimOrNull(service.description),
    })
  }

  const totalsMap = new Map<string, number>()
  for (const line of lines) {
    totalsMap.set(line.currency, (totalsMap.get(line.currency) || 0) + line.amount)
  }

  return {
    lines,
    totals: Array.from(totalsMap.entries()).map(([currency, amount]) => ({
      currency,
      amount,
    })),
  }
}
