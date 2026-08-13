/**
 * Orquestación del Reporte de Referidores (VIB-122): lee las comisiones del
 * período, resuelve las etiquetas de agencia y referidor filtrados, y arma el
 * agregado.
 *
 * Lo comparten la pantalla (`/api/reports/referral-commissions`) y el PDF
 * (`.../pdf`) para que el documento descargado sea exactamente lo que el usuario
 * vio.
 */

import { fetchReferralCommissionRecords } from "@/lib/referrals/fetch-referral-commission-records"
import { buildReferralsReport, type ReferralsReport } from "@/lib/reports/referrals-report"

export interface ReferralsReportFilters {
  dateFrom: string
  dateTo: string
  /** "ARS" | "USD" — el reporte se arma siempre para una sola moneda. */
  currency: string
  agencyId: string | null
  agencyName: string | null
  partnerId: string | null
  partnerName: string | null
}

export interface ReferralsReportPayload {
  filters: ReferralsReportFilters
  report: ReferralsReport
}

export interface BuildReferralsReportDataParams {
  supabase: any
  orgId: string
  dateFrom: string
  dateTo: string
  currency: string
  agencyId?: string | null
  agencyIds?: string[]
  partnerId?: string | null
}

export async function buildReferralsReportData(
  params: BuildReferralsReportDataParams
): Promise<ReferralsReportPayload> {
  const { supabase, orgId, dateFrom, dateTo, currency, agencyIds = [] } = params

  const agencyId = params.agencyId && params.agencyId !== "ALL" ? params.agencyId : null
  const partnerId = params.partnerId && params.partnerId !== "ALL" ? params.partnerId : null

  const { records, partnerNames, agencyNames, cancelledRecords, truncated } =
    await fetchReferralCommissionRecords({
      supabase,
      orgId,
      dateFrom,
      dateTo,
      agencyId,
      agencyIds,
      partnerId,
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

  let partnerName: string | null = null
  if (partnerId) {
    partnerName = partnerNames.get(partnerId) ?? null
    if (!partnerName) {
      const { data: partner } = await (supabase.from("referral_partners") as any)
        .select("name")
        .eq("id", partnerId)
        .eq("org_id", orgId)
        .maybeSingle()
      partnerName = (partner as any)?.name ?? null
    }
  }

  const report = buildReferralsReport({
    records,
    partnerNames,
    agencyNames,
    currency,
    dateFrom,
    dateTo,
    cancelledRecords,
    truncated,
  })

  return {
    filters: {
      dateFrom,
      dateTo,
      currency,
      agencyId,
      agencyName,
      partnerId,
      partnerName,
    },
    report,
  }
}
