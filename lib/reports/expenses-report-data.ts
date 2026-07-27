/**
 * Orquestación del Reporte de Gastos: lee los gastos del período, resuelve la
 * etiqueta de la agencia filtrada y arma el reporte agregado.
 *
 * Lo comparten la pantalla (`/api/reports/expenses`) y el PDF
 * (`/api/reports/expenses/pdf`) para que el documento descargado sea
 * exactamente lo que el usuario vio, no una segunda lectura que puede diferir.
 */

import { fetchExpenses } from "@/lib/expenses/fetch-expenses"
import { buildExpensesReport, type ExpensesReport } from "@/lib/reports/expenses-report"

export interface ExpensesReportCompany {
  name: string
  address: string
  phone: string
  email: string
  website: string
  taxId: string
  logo: string
}

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

  // Se leen TODAS las monedas de una sola vez: el reporte usa la moneda elegida
  // y el total de la otra se muestra como referencia (sin convertir ni sumar).
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

  const report = buildExpensesReport({ expenses, currency, dateFrom, dateTo })

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

/**
 * Branding del tenant para el encabezado del PDF. Mismas claves que usa la
 * liquidación de servicios (`lib/operations/statement-data.ts`).
 */
export async function loadExpensesReportCompany(params: {
  supabase: any
  orgId: string
}): Promise<ExpensesReportCompany> {
  const { supabase, orgId } = params

  const { data: settingsRows } = await (supabase.from("organization_settings") as any)
    .select("key, value")
    .eq("org_id", orgId)

  const getSetting = (key: string, fallback = "") =>
    (settingsRows || []).find((s: any) => s.key === key)?.value || fallback

  let fallbackName = "Mi Empresa"
  if (!getSetting("company_name")) {
    const { data: org } = await (supabase.from("organizations") as any)
      .select("name")
      .eq("id", orgId)
      .maybeSingle()
    fallbackName = (org as any)?.name || fallbackName
  }

  return {
    name: getSetting("company_name", fallbackName),
    address: getSetting("address"),
    phone: getSetting("phone"),
    email: getSetting("email"),
    website: getSetting("website"),
    taxId: getSetting("tax_id"),
    logo: getSetting("brand_logo"),
  }
}
