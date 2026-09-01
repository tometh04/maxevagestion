export interface QuotationQuotaAgencyUsage {
  agency_id: string
  agency_name: string
  used: number
}

export interface QuotationQuotaUsage {
  configured: boolean
  period_id: string | null
  starts_at: string | null
  ends_at: string | null
  included: number | null
  extra: number
  limit: number | null
  used: number
  remaining: number | null
  at_limit: boolean
  enforcement_enabled: boolean
  agencies: QuotationQuotaAgencyUsage[]
}

export interface QuotationCreditPackage {
  id: string
  name: string
  units: number
  price_ars: number
  target_plan: string | null
  target_org_id: string | null
  active: boolean
  sort_order: number
}

export const QUOTATION_QUOTA_EXHAUSTED = "QUOTATION_QUOTA_EXHAUSTED" as const

export class QuotationQuotaExhaustedError extends Error {
  readonly code = QUOTATION_QUOTA_EXHAUSTED

  constructor(public readonly usage: QuotationQuotaUsage) {
    super("La organización alcanzó el límite de cotizaciones de este ciclo")
    this.name = "QuotationQuotaExhaustedError"
  }
}
