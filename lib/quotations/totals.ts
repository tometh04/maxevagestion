export interface QuotationTotalsItemLike {
  quantity?: number | string | null
  unit_price?: number | string | null
  sale_amount?: number | string | null
  cost_amount?: number | string | null
}

export interface QuotationOptionTotalsLike {
  total_amount?: number | string | null
  calculated_total_amount?: number | string | null
  manual_total_amount?: number | string | null
}

export function roundQuotationMoney(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100
}

export function normalizeManualQuotationTotal(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return null
  }

  return roundQuotationMoney(parsed)
}

function getItemQuantity(item: QuotationTotalsItemLike) {
  if (item.quantity === null || item.quantity === undefined || item.quantity === "") {
    return 1
  }

  return Math.max(0, Number(item.quantity))
}

function getItemSaleUnitAmount(item: QuotationTotalsItemLike) {
  if (item.sale_amount != null && Number.isFinite(Number(item.sale_amount))) {
    return Number(item.sale_amount)
  }

  if (item.unit_price != null && Number.isFinite(Number(item.unit_price))) {
    return Number(item.unit_price)
  }

  return 0
}

function getItemCostUnitAmount(item: QuotationTotalsItemLike) {
  if (item.cost_amount != null && Number.isFinite(Number(item.cost_amount))) {
    return Number(item.cost_amount)
  }

  return 0
}

export function getQuotationOptionCalculatedTotal(items: QuotationTotalsItemLike[]) {
  return roundQuotationMoney(
    items.reduce((sum, item) => sum + getItemSaleUnitAmount(item) * getItemQuantity(item), 0)
  )
}

export function getQuotationOptionCostTotal(items: QuotationTotalsItemLike[]) {
  return roundQuotationMoney(
    items.reduce((sum, item) => sum + getItemCostUnitAmount(item) * getItemQuantity(item), 0)
  )
}

export function getEffectiveQuotationOptionTotal(option: QuotationOptionTotalsLike) {
  const calculatedTotal = roundQuotationMoney(Number(option.calculated_total_amount || 0))
  const manualTotal = normalizeManualQuotationTotal(option.manual_total_amount)

  if (manualTotal != null) {
    return manualTotal
  }

  if (option.total_amount != null && Number.isFinite(Number(option.total_amount))) {
    return roundQuotationMoney(Number(option.total_amount))
  }

  return calculatedTotal
}
