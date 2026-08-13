import { NextResponse } from "next/server"
import { buildReferralsReportData } from "@/lib/reports/referrals-report-data"
import { resolveReferralsReportRequest } from "@/lib/reports/referrals-report-request"
import { loadReportCompany } from "@/lib/reports/report-company"
import { generateReferralsReportPdf } from "@/lib/pdf/referrals-report-pdf"

/**
 * GET /api/reports/referral-commissions/pdf
 *
 * Descarga el Reporte de Referidores como PDF listo para presentar. Usa los
 * mismos datos, filtros y guards que `/api/reports/referral-commissions`; lo
 * único que agrega es el branding del tenant.
 */
export async function GET(request: Request) {
  try {
    const resolved = await resolveReferralsReportRequest(request)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }

    const [payload, company] = await Promise.all([
      buildReferralsReportData({
        supabase: resolved.supabase,
        orgId: resolved.orgId,
        agencyIds: resolved.agencyIds,
        ...resolved.params,
      }),
      loadReportCompany({ supabase: resolved.supabase, orgId: resolved.orgId }),
    ])

    const pdf = generateReferralsReportPdf({
      report: payload.report,
      filters: payload.filters,
      company,
    })

    const filename = `reporte-referidores-${payload.filters.currency}-${payload.filters.dateFrom}_${payload.filters.dateTo}.pdf`

    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error: any) {
    console.error("Error in GET /api/reports/referral-commissions/pdf:", error)
    return NextResponse.json(
      { error: "Error al generar el PDF del reporte" },
      { status: 500 }
    )
  }
}
