/**
 * Orquestación del Reporte de Gastos: lee los gastos del período, resuelve la
 * etiqueta de la agencia filtrada y arma el reporte agregado.
 *
 * Lo comparten la pantalla (`/api/reports/expenses`) y el PDF
 * (`/api/reports/expenses/pdf`) para que el documento descargado sea
 * exactamente lo que el usuario vio, no una segunda lectura que puede diferir.
 */

import { fetchExpenses } from "@/lib/expenses/fetch-expenses"
import { buildExchangeRateMap } from "@/lib/accounting/exchange-rates"
import { buildExpensesReport, type ExpensesReport } from "@/lib/reports/expenses-report"
import { loadReportCompany, type ReportCompany } from "@/lib/reports/report-company"

/** @deprecated Usar `ReportCompany` de `lib/reports/report-company.ts`. */
export type ExpensesReportCompany = ReportCompany

export interface ExpensesReportFilters {
  dateFrom: string
  dateTo: string
  /** "ARS" | "USD" — el reporte se arma siempre para una sola moneda. */
  currency: string
  agencyId: string | null
  agencyName: string | null
  agencyMode: "office" | "account"
  /** null = fijos + variables. */
  type: "recurring" | "variable" | null
}

export interface ExpensesReportPayload {
  filters: ExpensesReportFilters
  report: ExpensesReport
}

export interface BuildExpensesReportDataParams {
  supabase: any
  orgId: string
  dateFrom: string
  dateTo: string
  currency: string
  agencyId?: string | null
  agencyMode?: "office" | "account"
  type?: string | null
  /** Permiso `cash.ownDataOnly`: limita los variables al usuario. */
  ownDataOnlyUserId?: string | null
}

export async function buildExpensesReportData(
  params: BuildExpensesReportDataParams
): Promise<ExpensesReportPayload> {
  const {
    supabase,
    orgId,
    dateFrom,
    dateTo,
    currency,
    agencyMode = "office",
    ownDataOnlyUserId = null,
  } = params

  const agencyId = params.agencyId && params.agencyId !== "ALL" ? params.agencyId : null
  const type =
    params.type === "recurring" || params.type === "variable" ? params.type : null

  // Se leen TODAS las monedas: el reporte las junta convirtiéndolas a la moneda
  // elegida. Antes se filtraba, y los gastos de la otra moneda desaparecían.
  const { expenses } = await fetchExpenses({
    supabase,
    orgId,
    dateFrom,
    dateTo,
    currency: "ALL",
    type,
    agencyId,
    agencyMode,
    ownDataOnlyUserId,
  })

  let agencyName: string | null = null
  if (agencyId) {
    const { data: agency } = await (supabase.from("agencies") as any)
      .select("name")
      .eq("id", agencyId)
      .eq("org_id", orgId)
      .maybeSingle()
    agencyName = (agency as any)?.name ?? null
  }

  // Mapa de TC en memoria: una sola query para todo el rango, en vez de una por
  // gasto. Solo hace falta si hay gastos en una moneda distinta a la de salida.
  const necesitaConversion = expenses.some((e) => e.currency !== currency)
  const getRate = necesitaConversion
    ? await buildExchangeRateMap(
        supabase as any,
        expenses.map((e) => e.movement_date)
      )
    : undefined

  const report = buildExpensesReport({ expenses, currency, dateFrom, dateTo, getRate })

  return {
    filters: {
      dateFrom,
      dateTo,
      currency,
      agencyId,
      agencyName,
      agencyMode,
      type,
    },
    report,
  }
}

/** @deprecated Alias de `loadReportCompany`, compartido por todos los reportes. */
export const loadExpensesReportCompany = loadReportCompany
