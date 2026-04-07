export interface OperatorIdentity {
  id?: string | null
  name?: string | null
}

export interface OperationOperatorRelationLike {
  operator_id?: string | null
  operators?: OperatorIdentity | null
}

export interface OperationPaymentOperatorSource {
  primaryOperator?: OperatorIdentity | null
  operationOperators?: OperationOperatorRelationLike[] | null
  serviceOperators?: OperationOperatorRelationLike[] | null
  operatorPayments?: OperationOperatorRelationLike[] | null
  fallbackNamesById?: Map<string, string>
}

export interface OperatorOption {
  id: string
  name: string
}

export function buildOperationPaymentOperators({
  primaryOperator,
  operationOperators = [],
  serviceOperators = [],
  operatorPayments = [],
  fallbackNamesById,
}: OperationPaymentOperatorSource): OperatorOption[] {
  const operatorMap = new Map<string, string>()
  const normalizedOperationOperators = operationOperators ?? []
  const normalizedServiceOperators = serviceOperators ?? []
  const normalizedOperatorPayments = operatorPayments ?? []

  const addOperator = (id?: string | null, explicitName?: string | null) => {
    if (!id) return

    const nextName = explicitName?.trim() || fallbackNamesById?.get(id) || "Operador"
    const currentName = operatorMap.get(id)

    if (!currentName || currentName === "Operador") {
      operatorMap.set(id, nextName)
    }
  }

  addOperator(primaryOperator?.id, primaryOperator?.name)

  for (const relation of normalizedOperationOperators) {
    addOperator(relation?.operators?.id || relation?.operator_id, relation?.operators?.name)
  }

  for (const service of normalizedServiceOperators) {
    addOperator(service?.operators?.id || service?.operator_id, service?.operators?.name)
  }

  for (const operatorPayment of normalizedOperatorPayments) {
    addOperator(operatorPayment?.operators?.id || operatorPayment?.operator_id, operatorPayment?.operators?.name)
  }

  return Array.from(operatorMap.entries()).map(([id, name]) => ({ id, name }))
}
