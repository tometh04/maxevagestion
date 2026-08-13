/**
 * Orquestación del Reporte de Caja y flujo proyectado (VIB-67).
 *
 * Las tres lecturas (cobranzas, pagos, saldos) son independientes: van en
 * paralelo, que es lo que hace tolerable el costo de este reporte, el más
 * pesado de los cuatro.
 */

import { fetchReceivables } from "@/lib/cashflow/fetch-receivables"
import { fetchPayables } from "@/lib/cashflow/fetch-payables"
import { fetchAccountBalances } from "@/lib/cashflow/fetch-account-balances"
import {
  buildCashflowProjectionReport,
  type CashflowProjectionReport,
} from "@/lib/reports/cashflow-projection-report"
import { todayInArgentina } from "@/lib/utils/date-only"

export interface CashflowProjectionReportFilters {
  agencyId: string | null
  agencyName: string | null
  tramos: number[]
  ownDataOnly: boolean
}

export interface CashflowProjectionReportPayload {
  filters: CashflowProjectionReportFilters
  report: CashflowProjectionReport
}

export interface BuildCashflowProjectionReportDataParams {
  supabase: any
  orgId: string
  agencyId?: string | null
  agencyIds?: string[]
  tramos?: number[]
  ownDataOnlyUserId?: string | null
  /** Inyectable para tests; por defecto el hoy argentino. */
  today?: string
}

export async function buildCashflowProjectionReportData(
  params: BuildCashflowProjectionReportDataParams
): Promise<CashflowProjectionReportPayload> {
  const { supabase, orgId, agencyIds = [], tramos, ownDataOnlyUserId = null } = params
  const agencyId = params.agencyId && params.agencyId !== "ALL" ? params.agencyId : null
  const today = params.today ?? todayInArgentina()

  const [receivablesResult, payablesResult, balances] = await Promise.all([
    fetchReceivables({ supabase, orgId, agencyId, agencyIds, ownDataOnlyUserId }),
    fetchPayables({ supabase, orgId, agencyId, agencyIds }),
    fetchAccountBalances({ supabase, orgId, agencyId, agencyIds }),
  ])

  let agencyName: string | null = null
  if (agencyId) {
    const { data: agency } = await (supabase.from("agencies") as any)
      .select("name")
      .eq("id", agencyId)
      .eq("org_id", orgId)
      .maybeSingle()
    agencyName = (agency as any)?.name ?? null
  }

  const report = buildCashflowProjectionReport({
    receivables: receivablesResult.receivables,
    payables: payablesResult.payables,
    balances,
    dueDateSource: receivablesResult.dueDateSource,
    today,
    tramos,
    truncated: receivablesResult.truncated || payablesResult.truncated,
  })

  return {
    filters: {
      agencyId,
      agencyName,
      tramos: report.tramos,
      ownDataOnly: !!ownDataOnlyUserId,
    },
    report,
  }
}
