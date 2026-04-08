export interface OperatorIdentity {
  id?: string | null
  name?: string | null
}

export interface OperationOperatorRelationLike {
  operator_id?: string | null
  operators?: OperatorIdentity | null
}

export interface OperationOperatorPaymentLike extends OperationOperatorRelationLike {
  id?: string | null
  amount?: number | string | null
  paid_amount?: number | string | null
  status?: "PENDING" | "PAID" | "OVERDUE" | string | null
}

export interface OperationServicePaymentRelationLike extends OperationOperatorRelationLike {
  operator_payment_id?: string | null
}

export interface OperationPaymentOperatorSource {
  primaryOperator?: OperatorIdentity | null
  operationOperators?: OperationOperatorRelationLike[] | null
  serviceOperators?: OperationOperatorRelationLike[] | null
  operatorPayments?: OperationOperatorRelationLike[] | null
  purchaseIvaOperators?: OperationOperatorRelationLike[] | null
  fallbackNamesById?: Map<string, string>
}

export interface OperatorOption {
  id: string
  name: string
}

const MONEY_EPSILON = 0.005

function toMoney(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function hasPendingBalance(operatorPayment: Pick<OperationOperatorPaymentLike, "amount" | "paid_amount">): boolean {
  return toMoney(operatorPayment.paid_amount) + MONEY_EPSILON < toMoney(operatorPayment.amount)
}

function buildOperatorOptions(
  entries: Array<{ id?: string | null; name?: string | null }>,
  fallbackNamesById?: Map<string, string>
): OperatorOption[] {
  const operatorMap = new Map<string, string>()

  for (const entry of entries) {
    const id = entry.id
    if (!id) continue

    const nextName = entry.name?.trim() || fallbackNamesById?.get(id) || "Operador"
    const currentName = operatorMap.get(id)

    if (!currentName || currentName === "Operador") {
      operatorMap.set(id, nextName)
    }
  }

  return Array.from(operatorMap.entries()).map(([id, name]) => ({ id, name }))
}

export function buildOperationPaymentOperators({
  primaryOperator,
  operationOperators = [],
  serviceOperators = [],
  operatorPayments = [],
  purchaseIvaOperators = [],
  fallbackNamesById,
}: OperationPaymentOperatorSource): OperatorOption[] {
  const normalizedOperationOperators = operationOperators ?? []
  const normalizedServiceOperators = serviceOperators ?? []
  const normalizedOperatorPayments = operatorPayments ?? []
  const normalizedPurchaseIvaOperators = purchaseIvaOperators ?? []
  const entries = [
    { id: primaryOperator?.id, name: primaryOperator?.name },
    ...normalizedOperationOperators.map((relation) => ({
      id: relation?.operators?.id || relation?.operator_id,
      name: relation?.operators?.name,
    })),
    ...normalizedServiceOperators.map((service) => ({
      id: service?.operators?.id || service?.operator_id,
      name: service?.operators?.name,
    })),
    ...normalizedOperatorPayments.map((operatorPayment) => ({
      id: operatorPayment?.operators?.id || operatorPayment?.operator_id,
      name: operatorPayment?.operators?.name,
    })),
    ...normalizedPurchaseIvaOperators.map((purchaseIva) => ({
      id: purchaseIva?.operators?.id || purchaseIva?.operator_id,
      name: purchaseIva?.operators?.name,
    })),
  ]

  return buildOperatorOptions(entries, fallbackNamesById)
}

export function buildOpenOperationBasePayableOperators({
  operatorPayments = [],
  operationServices = [],
  fallbackNamesById,
}: {
  operatorPayments?: OperationOperatorPaymentLike[] | null
  operationServices?: OperationServicePaymentRelationLike[] | null
  fallbackNamesById?: Map<string, string>
}): OperatorOption[] {
  const normalizedOperatorPayments = operatorPayments ?? []
  const normalizedOperationServices = operationServices ?? []
  const serviceLinkedOperatorPaymentIds = new Set(
    normalizedOperationServices
      .map((service) => service?.operator_payment_id || null)
      .filter((operatorPaymentId): operatorPaymentId is string => Boolean(operatorPaymentId))
  )

  const openBasePayments = normalizedOperatorPayments.filter((operatorPayment) => {
    const operatorPaymentId = operatorPayment?.id || null
    const status = operatorPayment?.status || null

    if (!operatorPaymentId || serviceLinkedOperatorPaymentIds.has(operatorPaymentId)) {
      return false
    }

    if (status !== "PENDING" && status !== "OVERDUE") {
      return false
    }

    return hasPendingBalance(operatorPayment)
  })

  return buildOperatorOptions(
    openBasePayments.map((operatorPayment) => ({
      id: operatorPayment?.operators?.id || operatorPayment?.operator_id,
      name: operatorPayment?.operators?.name,
    })),
    fallbackNamesById
  )
}
