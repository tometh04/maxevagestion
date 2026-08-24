/** Campos del operador que intervienen al cotizar, además de su identidad. */
export interface QuotationOperatorOption {
  id: string
  name: string
  agency_id?: string | null
  admin_fee_percentage?: number | null
  cost_calculation_mode?: string | null
  commission_percentage?: number | null
}

export const QUOTATION_OPERATOR_SELECT =
  "id, name, agency_id, admin_fee_percentage, cost_calculation_mode, commission_percentage" as const
