export interface OperationOperatorCostLike {
  cost?: number | string | null
}

export interface OperationBalanceInput {
  saleAmount: number | string | null | undefined
  operatorCost: number | string | null | undefined
  customerPaid: number | string | null | undefined
  operatorPaid: number | string | null | undefined
}

export interface OperationBalanceResult {
  customerPending: number
  operatorPending: number
}

export function toFiniteMoney(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

export function sumOperationOperatorCosts(operators: OperationOperatorCostLike[] | null | undefined): number {
  return roundMoney((operators || []).reduce((sum, operator) => sum + toFiniteMoney(operator.cost), 0))
}

export function calculateOperationBalances(input: OperationBalanceInput): OperationBalanceResult {
  const saleAmount = toFiniteMoney(input.saleAmount)
  const operatorCost = toFiniteMoney(input.operatorCost)
  const customerPaid = toFiniteMoney(input.customerPaid)
  const operatorPaid = toFiniteMoney(input.operatorPaid)

  return {
    customerPending: roundMoney(Math.max(0, saleAmount - customerPaid)),
    operatorPending: roundMoney(Math.max(0, operatorCost - operatorPaid)),
  }
}
