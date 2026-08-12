import { NextResponse } from "next/server"
import { buildReferralsReportData } from "@/lib/reports/referrals-report-data"
import { resolveReferralsReportRequest } from "@/lib/reports/referrals-report-request"

/**
 * GET /api/reports/referral-commissions
 *
 * Reporte de referidores del período (VIB-122): totales por socio referidor,
 * evolución mensual, matriz referidor × mes, desglose por estado y agencia, y
 * detalle comisión por comisión. Es la misma data que consume el PDF (`./pdf`).
 *
 * El mes de cada comisión lo define la fecha de venta de la operación, no la
 * fecha de cálculo: un recálculo masivo no debe reescribir la historia.
 *
 * Query: dateFrom, dateTo (YYYY-MM-DD), currency (ARS|USD), agencyId, partnerId.
 */
export async function GET(request: Request) {
  try {
    const resolved = await resolveReferralsReportRequest(request)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }

    const payload = await buildReferralsReportData({
      supabase: resolved.supabase,
      orgId: resolved.orgId,
      agencyIds: resolved.agencyIds,
      ...resolved.params,
    })

    return NextResponse.json(payload)
  } catch (error: any) {
    console.error("Error in GET /api/reports/referral-commissions:", error)
    return NextResponse.json(
      { error: "Error al generar el reporte de referidores" },
      { status: 500 }
    )
  }
}
