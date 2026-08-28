/**
 * Orquestación del Reporte Societario (VIB-101).
 *
 * Lee las seis fuentes del período —ventas, gastos, resultado financiero,
 * comisiones de vendedores, comisiones de referidores y socios— y arma el
 * reporte agregado.
 *
 * Lo comparten la pantalla (`/api/reports/societario`) y el PDF
 * (`/api/reports/societario/pdf`): el documento que se descarga tiene que ser
 * exactamente lo que se vio, no una segunda lectura que puede diferir.
 */

import { buildExchangeRateMap } from "@/lib/accounting/exchange-rates"
import { fetchFinancialResults } from "@/lib/accounting/fetch-financial-results"
import { fetchCommissionRecords } from "@/lib/commissions/fetch-commission-records"
import { fetchReferralCommissions } from "@/lib/commissions/fetch-referral-commissions"
import { fetchExpenses } from "@/lib/expenses/fetch-expenses"
import { fetchSalesOperations } from "@/lib/operations/fetch-sales-operations"
import { fetchOrgPartners, fetchPartnerAllocations } from "@/lib/partners/fetch-partner-accounts"
import { monthKeysBetween } from "@/lib/reports/period"
import { loadReportCompany, type ReportCompany } from "@/lib/reports/report-company"
import {
  buildSocietarioReport,
  type NetoIvaCriterio,
  type SocietarioReport,
} from "@/lib/reports/societario-report"

export type { ReportCompany }

/** Une mapas de nombres sin depender de downlevelIteration. */
function mergeNames(...maps: Array<Map<string, string>>): Map<string, string> {
  const out = new Map<string, string>()
  for (const map of maps) {
    map.forEach((value, key) => out.set(key, value))
  }
  return out
}

export interface SocietarioReportFilters {
  dateFrom: string
  dateTo: string
  currency: string
  agencyId: string | null
  agencyName: string | null
  /** Cotización única elegida; null = TC de la fecha de cada movimiento. */
  exchangeRate: number | null
  /** Alícuota en porcentaje, como la eligió el usuario. */
  ivaRatePct: number
  /** Base del IVA de la venta neta. Viaja hasta acá para imprimirse en el PDF. */
  netoIvaCriterio: NetoIvaCriterio
}

export interface SocietarioReportPayload {
  filters: SocietarioReportFilters
  report: SocietarioReport
}

export interface BuildSocietarioReportDataParams {
  supabase: any
  orgId: string
  dateFrom: string
  dateTo: string
  currency: string
  agencyId?: string | null
  agencyIds?: string[]
  exchangeRate?: number | null
  ivaRate: number
  ivaRatePct: number
  netoIvaCriterio?: NetoIvaCriterio
}

export async function buildSocietarioReportData(
  params: BuildSocietarioReportDataParams
): Promise<SocietarioReportPayload> {
  const {
    supabase,
    orgId,
    dateFrom,
    dateTo,
    currency,
    exchangeRate = null,
    ivaRate,
    ivaRatePct,
    netoIvaCriterio = "MARGEN",
  } = params

  const agencyId = params.agencyId && params.agencyId !== "ALL" ? params.agencyId : null
  const agencyIds = params.agencyIds ?? []

  // Las seis lecturas son independientes entre sí.
  const [sales, expensesResult, financial, commissions, referrals, orgPartners] = await Promise.all([
    fetchSalesOperations({ supabase, orgId, dateFrom, dateTo, agencyId, agencyIds }),
    fetchExpenses({
      supabase,
      orgId,
      dateFrom,
      dateTo,
      currency: "ALL",
      agencyId,
      agencyIds,
      // Los turísticos ya están descontados del margen: restarlos de nuevo acá
      // los contaría dos veces contra la ganancia.
      excludeTouristic: true,
    }),
    // Ganancia por depósito y comisión de la financiera. No entran por
    // `fetchExpenses` a propósito: no son gastos de la agencia, van en su
    // propia línea del resultado.
    fetchFinancialResults({ supabase, orgId, dateFrom, dateTo, agencyId, agencyIds }),
    fetchCommissionRecords({ supabase, orgId, dateFrom, dateTo, agencyId, agencyIds }),
    fetchReferralCommissions({ supabase, orgId, dateFrom, dateTo, agencyId, agencyIds }),
    fetchOrgPartners(supabase, orgId),
  ])

  const monthKeys = monthKeysBetween(dateFrom, dateTo)
  // Se piden con `allIds`: una distribución vieja puede ser de un socio dado de
  // baja después, y omitirla haría que el histórico no cierre.
  const allocations = await fetchPartnerAllocations(supabase, orgPartners.allIds, monthKeys)

  let agencyName: string | null = null
  if (agencyId) {
    const { data: agency } = await (supabase.from("agencies") as any)
      .select("name")
      .eq("id", agencyId)
      .eq("org_id", orgId)
      .maybeSingle()
    agencyName = (agency as any)?.name ?? null
  }

  // Mapa de TC en memoria: una sola query para todo el rango en vez de una por
  // fila. No hace falta si el usuario fijó una cotización única.
  const fechas = [
    ...sales.operations.map((op) => op.operation_date),
    ...expensesResult.expenses.map((e) => e.movement_date),
    ...financial.rows.map((r) => r.movement_date),
    ...commissions.records.map((r) => r.operations?.operation_date).filter(Boolean),
    ...referrals.rows.map((r) => r.operationDate),
  ].filter(Boolean) as string[]

  const getRate =
    !exchangeRate && fechas.length > 0
      ? await buildExchangeRateMap(supabase as any, fechas)
      : undefined

  const report = buildSocietarioReport({
    operations: sales.operations,
    serviceExtras: sales.serviceExtras,
    includeServices: sales.includeServices,
    salesTruncated: sales.truncated,
    expenses: expensesResult.expenses,
    excludedTouristicCount: expensesResult.excludedTouristic,
    financialMovements: financial.rows,
    commissionRecords: commissions.records,
    referralCommissions: referrals.rows,
    commissionsExcluded: {
      settled: commissions.settledRecords,
      cancelled: commissions.cancelledRecords,
    },
    commissionsTruncated: commissions.truncated || referrals.truncated,
    financialTruncated: financial.truncated,
    partners: orgPartners.partners,
    allocations,
    // Nombres para el desglose por concepto. Se prefiere el mapa de ventas
    // para las oficinas porque cubre todas las del período, no solo las que
    // tuvieron comisiones.
    agencyNames: sales.agencyNames,
    sellerNames: mergeNames(commissions.sellerNames, sales.sellerNames),
    referralPartnerNames: referrals.partnerNames,
    currency,
    ivaRate,
    netoIvaCriterio,
    dateFrom,
    dateTo,
    getRate,
    fixedRate: exchangeRate,
  })

  return {
    filters: {
      dateFrom,
      dateTo,
      currency,
      agencyId,
      agencyName,
      exchangeRate,
      ivaRatePct,
      netoIvaCriterio,
    },
    report,
  }
}

export const loadSocietarioReportCompany = loadReportCompany
