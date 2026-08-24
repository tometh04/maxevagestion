export interface QuotationTotalsItemLike {
  quantity?: number | string | null
  unit_price?: number | string | null
  sale_amount?: number | string | null
  cost_amount?: number | string | null
  admin_fee_percentage?: number | string | null
  cost_calculation_mode?: string | null
  gross_price?: number | string | null
  commission_percentage?: number | string | null
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

function finiteNonNegative(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

/**
 * Costo real unitario congelado en el item de cotización.
 * Debe mantenerse alineado con el contrato financiero de
 * `20260529000001_operator_cost_calculation_mode.sql` y con la RPC de conversión.
 */
export function getQuotationItemEffectiveUnitCost(item: QuotationTotalsItemLike) {
  const adminFeeRate = finiteNonNegative(item.admin_fee_percentage) / 100
  const commissionRate = finiteNonNegative(item.commission_percentage) / 100
  const grossPrice = finiteNonNegative(item.gross_price)

  if (item.cost_calculation_mode === "COMMISSIONABLE" && grossPrice > 0) {
    return roundQuotationMoney(
      Math.max(0, grossPrice * (1 - commissionRate + adminFeeRate))
    )
  }

  return roundQuotationMoney(
    finiteNonNegative(item.cost_amount) * (1 + adminFeeRate)
  )
}

export function getQuotationOptionCalculatedTotal(items: QuotationTotalsItemLike[]) {
  return roundQuotationMoney(
    items.reduce((sum, item) => sum + getItemSaleUnitAmount(item) * getItemQuantity(item), 0)
  )
}

export function getQuotationOptionCostTotal(items: QuotationTotalsItemLike[]) {
  return roundQuotationMoney(
    items.reduce((sum, item) => sum + getQuotationItemEffectiveUnitCost(item) * getItemQuantity(item), 0)
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

/** Customer-visible amount accepted and later carried into the operation. */
export function getQuotationCustomerTotal(
  option: QuotationOptionTotalsLike,
  addons: { insuranceAmount?: number | string | null; transferAmount?: number | string | null }
) {
  return roundQuotationMoney(
    getEffectiveQuotationOptionTotal(option)
    + Math.max(0, Number(addons.insuranceAmount || 0))
    + Math.max(0, Number(addons.transferAmount || 0))
  )
}
