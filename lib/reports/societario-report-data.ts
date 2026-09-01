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
import { sugerirCotizacionEnRango } from "@/lib/accounting/monthly-rate-suggestion"
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
  /**
   * El TC fijo elegido coincide con el promedio del período.
   *
   * Lo decide el servidor comparando contra la sugerencia, no el cliente: si
   * el PDF dijera "promedio del período" porque un query param lo afirma,
   * cualquiera podría estampar esa leyenda sobre una cotización inventada.
   */
  exchangeRateEsPromedio: boolean
}

/** Cotización propuesta para el período. Es un dato de la UI, no del informe. */
export interface SocietarioTipoCambioSugerido {
  criterio: "PROMEDIO"
  /** null = el período no tiene cotizaciones diarias cargadas. */
  rate: number | null
  muestras: number
  desde: string
  hasta: string
}

export interface SocietarioReportPayload {
  filters: SocietarioReportFilters
  report: SocietarioReport
  /**
   * Va afuera de `report` a propósito: el PDF imprime `report` + `filters`, y
   * una sugerencia que nadie aplicó no es una cifra del informe.
   */
  tipoCambioSugerido: SocietarioTipoCambioSugerido | null
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

  // Las siete lecturas son independientes entre sí.
  const [sales, expensesResult, financial, commissions, referrals, orgPartners, sugerida] =
    await Promise.all([
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
    // Cotización promedio del período, para ofrecerla como TC del cierre. Es
    // una sugerencia: si `exchange_rates` falla, el reporte tiene que salir
    // igual, así que no puede tumbar el Promise.all.
    sugerirCotizacionEnRango(supabase, dateFrom, dateTo, "PROMEDIO").catch(() => null),
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

  // Nombres de TODAS las oficinas de la org (2-6 filas). `sales.agencyNames`
  // solo cubre las que tuvieron ventas en el período: una oficina que solo tuvo
  // gastos aparecería en el cierre sin nombre.
  //
  // `.eq("org_id", orgId)` explícito: no se confía en RLS (AGENTS, regla 2).
  const { data: agenciasDeLaOrg } = await (supabase.from("agencies") as any)
    .select("id, name")
    .eq("org_id", orgId)
  const nombresDeAgencia = new Map<string, string>()
  for (const a of (agenciasDeLaOrg ?? []) as any[]) {
    if (a?.id && a?.name) nombresDeAgencia.set(a.id, a.name)
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
    expensesTruncated: expensesResult.truncated,
    partners: orgPartners.partners,
    allocations,
    // Nombres para el desglose por concepto. Se prefiere el mapa de ventas
    // para las oficinas porque cubre todas las del período, no solo las que
    // tuvieron comisiones.
    agencyNames: mergeNames(nombresDeAgencia, sales.agencyNames),
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

  // Comparación con tolerancia de un centavo: la sugerencia viene redondeada a
  // dos decimales y el usuario la aplica tal cual desde el botón.
  const exchangeRateEsPromedio =
    exchangeRate != null &&
    sugerida?.rate != null &&
    Math.abs(exchangeRate - sugerida.rate) < 0.01

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
      exchangeRateEsPromedio,
    },
    report,
    tipoCambioSugerido: sugerida
      ? {
          criterio: "PROMEDIO",
          rate: sugerida.rate,
          muestras: sugerida.muestras,
          desde: dateFrom,
          hasta: dateTo,
        }
      : null,
  }
}

export const loadSocietarioReportCompany = loadReportCompany
