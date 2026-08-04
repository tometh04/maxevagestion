/**
 * Orquestación del Reporte de Comisiones: lee los registros del período,
 * resuelve las etiquetas de agencia y vendedor filtrados, y arma el agregado.
 *
 * Lo comparten la pantalla (`/api/reports/commissions`) y el PDF
 * (`/api/reports/commissions/pdf`) para que el documento descargado sea
 * exactamente lo que el usuario vio.
 */

import { fetchCommissionRecords } from "@/lib/commissions/fetch-commission-records"
import type { CommissionsReportInclude } from "@/lib/reports/commissions-report-request"
import {
  buildCommissionsReport,
  type CommissionsReport,
} from "@/lib/reports/commissions-report"

export interface CommissionsReportFilters {
  dateFrom: string
  dateTo: string
  /** "ARS" | "USD" — el reporte se arma siempre para una sola moneda. */
  currency: string
  agencyId: string | null
  agencyName: string | null
  sellerId: string | null
  sellerName: string | null
  /** true si el usuario solo puede ver sus propias comisiones. */
  ownDataOnly: boolean
  /** Qué datos de la agencia quedaron incluidos (los resuelve el servidor). */
  include: CommissionsReportInclude
}

export interface CommissionsReportPayload {
  filters: CommissionsReportFilters
  report: CommissionsReport
}

export interface BuildCommissionsReportDataParams {
  supabase: any
  orgId: string
  dateFrom: string
  dateTo: string
  currency: string
  agencyId?: string | null
  agencyIds?: string[]
  sellerId?: string | null
  /** Permiso `commissions.ownDataOnly`: fuerza el reporte a ese vendedor. */
  ownDataOnlyUserId?: string | null
  include?: CommissionsReportInclude
}

const NOTHING_INCLUDED: CommissionsReportInclude = {
  sale: false,
  margin: false,
  referrals: false,
}

export async function buildCommissionsReportData(
  params: BuildCommissionsReportDataParams
): Promise<CommissionsReportPayload> {
  const {
    supabase,
    orgId,
    dateFrom,
    dateTo,
    currency,
    agencyIds = [],
    ownDataOnlyUserId = null,
    include = NOTHING_INCLUDED,
  } = params

  const agencyId = params.agencyId && params.agencyId !== "ALL" ? params.agencyId : null
  const requestedSellerId =
    params.sellerId && params.sellerId !== "ALL" ? params.sellerId : null
  // El permiso manda sobre el filtro: un vendedor restringido no puede pedir el
  // reporte de otro cambiando el query param.
  const sellerId = ownDataOnlyUserId ?? requestedSellerId

  const {
    records,
    sellerNames,
    agencyNames,
    referralPartners,
    mainPassengers,
    cancelledRecords,
    settledRecords,
    truncated,
  } = await fetchCommissionRecords({
      supabase,
      orgId,
      dateFrom,
      dateTo,
      agencyId,
      agencyIds,
      onlySellerId: sellerId,
    })

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

  const report = buildCommissionsReport({
    records,
    sellerNames,
    agencyNames,
    referralPartners,
    mainPassengers,
    include,
    currency,
    dateFrom,
    dateTo,
    cancelledRecords,
    settledRecords,
    truncated,
  })

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
      include,
    },
    report,
  }
}
