/**
 * Orquestación del Reporte de Ventas por producto (VIB-66).
 *
 * Lo comparten la pantalla (`/api/reports/sales-breakdown`) y el PDF
 * (`/api/reports/sales-breakdown/pdf`).
 */

import { fetchSalesOperations } from "@/lib/operations/fetch-sales-operations"
import {
  buildSalesBreakdownReport,
  type SalesBreakdownReport,
} from "@/lib/reports/sales-breakdown-report"

export interface SalesBreakdownReportFilters {
  dateFrom: string
  dateTo: string
  /** "ARS" | "USD" — el reporte se arma siempre para una sola moneda. */
  currency: string
  agencyId: string | null
  agencyName: string | null
  sellerId: string | null
  sellerName: string | null
  ownDataOnly: boolean
}

export interface SalesBreakdownReportPayload {
  filters: SalesBreakdownReportFilters
  report: SalesBreakdownReport
}

export interface BuildSalesBreakdownReportDataParams {
  supabase: any
  orgId: string
  dateFrom: string
  dateTo: string
  currency: string
  agencyId?: string | null
  agencyIds?: string[]
  sellerId?: string | null
  ownDataOnlyUserId?: string | null
}

export async function buildSalesBreakdownReportData(
  params: BuildSalesBreakdownReportDataParams
): Promise<SalesBreakdownReportPayload> {
  const {
    supabase,
    orgId,
    dateFrom,
    dateTo,
    currency,
    agencyIds = [],
    ownDataOnlyUserId = null,
  } = params

  const agencyId = params.agencyId && params.agencyId !== "ALL" ? params.agencyId : null
  const requestedSellerId =
    params.sellerId && params.sellerId !== "ALL" ? params.sellerId : null
  // El permiso manda sobre el filtro.
  const sellerId = ownDataOnlyUserId ?? requestedSellerId

  const {
    operations,
    itemsByOperation,
    serviceExtras,
    includeServices,
    sellerNames,
    agencyNames,
    truncated,
  } = await fetchSalesOperations({
    supabase,
    orgId,
    dateFrom,
    dateTo,
    agencyId,
    agencyIds,
    ownDataOnlyUserId: sellerId,
  })

  const report = buildSalesBreakdownReport({
    operations,
    itemsByOperation,
    serviceExtras,
    includeServices,
    sellerNames,
    agencyNames,
    currency,
    dateFrom,
    dateTo,
    truncated,
  })

  // `operation_operators.sale_amount` no está en los tipos generados. Si hay
  // ítems pero NINGUNA operación se pudo prorratear por importe de venta, lo más
  // probable es que la columna no haya vuelto en el select y todo el reporte
  // esté cayendo al costo como peso. Se avisa en logs: cambia los números.
  const { attribution } = report.summary
  if (attribution.itemsTotal > 0 && attribution.operationsByItemSale === 0) {
    console.warn(
      "[sales-breakdown] ninguna operación se prorrateó por importe de ítem " +
        `(${attribution.itemsTotal} ítems leídos). Revisar que operation_operators.sale_amount ` +
        "siga existiendo y viniendo en el select."
    )
  }

  let agencyName: string | null = null
  if (agencyId) {
    agencyName = agencyNames.get(agencyId) ?? null
    if (!agencyName) {
      const { data: agency } = await (supabase.from("agencies") as any)
        .select("name")
        .eq("id", agencyId)
        .eq("org_id", orgId)
        .maybeSingle()
      agencyName = (agency as any)?.name ?? null
    }
  }

  let sellerName: string | null = null
  if (sellerId) {
    sellerName = sellerNames.get(sellerId) ?? null
    if (!sellerName) {
      const { data: seller } = await (supabase.from("users") as any)
        .select("name")
        .eq("id", sellerId)
        .eq("org_id", orgId)
        .maybeSingle()
      sellerName = (seller as any)?.name ?? null
    }
  }

  return {
    filters: {
      dateFrom,
      dateTo,
      currency,
      agencyId,
      agencyName,
      sellerId,
      sellerName,
      ownDataOnly: !!ownDataOnlyUserId,
    },
    report,
  }
}
