import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"

export type AgencyId = string

export type ImportPipeline =
  | "operations-master"
  | "customers"
  | "operators"
  | "payments-suelto"
  | "cash-movements"
  | "users"

export type ExchangeRateMode = "monthly_rates" | "manual_fixed" | "monthly_with_fallback"

export interface ExchangeRateConfig {
  mode: ExchangeRateMode
  manualRate?: number
}

export interface ImportConfig {
  agencyId: AgencyId
  exchangeRate: ExchangeRateConfig
  defaultStatus?: "RESERVED" | "CONFIRMED" | "CANCELLED" | "TRAVELLING" | "TRAVELLED"
  /** ID of the user (public.users.id) running the import. Used as fallback for seller_id and user_id. */
  userId?: string
}

export interface ImportError {
  rowNumber: number
  field?: string
  message: string
}

export interface ImportWarning {
  rowNumber: number
  message: string
}

export interface RollbackEntry {
  table: string
  id: string
}

export interface ImportResult {
  totalRows: number
  successRows: number
  errorRows: number
  warningRows: number
  errors: ImportError[]
  warnings: ImportWarning[]
  rollbackLog: RollbackEntry[]
  previewSummary: {
    customersToCreate?: number
    operatorsToCreate?: number
    operationsToCreate?: number
    paymentsToCreate?: number
    cashMovementsToCreate?: number
    usersToCreate?: number
  }
}

export type SupabaseClientTyped = SupabaseClient<Database>

/**
 * Pipeline signature: every pipeline accepts the same shape.
 * Pure function (no side effects until executor.ts), easy to test.
 */
export type PipelineFn = (
  supabase: SupabaseClientTyped,
  csvContent: string,
  config: ImportConfig,
  options?: { dryRun?: boolean }
) => Promise<ImportResult>
