import { NextResponse } from "next/server"
import { buildCommissionsReportData } from "@/lib/reports/commissions-report-data"
import { resolveCommissionsReportRequest } from "@/lib/reports/commissions-report-request"
import { loadReportCompany } from "@/lib/reports/report-company"
import { generateCommissionsReportPdf } from "@/lib/pdf/commissions-report-pdf"

/**
 * GET /api/reports/commissions/pdf
 *
 * Descarga el Reporte de Comisiones como PDF listo para presentar. Usa los
 * mismos datos, filtros y guards que `/api/reports/commissions`; lo único que
 * agrega es el branding del tenant.
 */
export async function GET(request: Request) {
  try {
    const resolved = await resolveCommissionsReportRequest(request)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }

    const [payload, company] = await Promise.all([
      buildCommissionsReportData({
        supabase: resolved.supabase,
        orgId: resolved.orgId,
        agencyIds: resolved.agencyIds,
        ...resolved.params,
      }),
      loadReportCompany({ supabase: resolved.supabase, orgId: resolved.orgId }),
    ])

    const pdf = generateCommissionsReportPdf({
      report: payload.report,
      filters: payload.filters,
      company,
    })

    const filename = `reporte-comisiones-${payload.filters.currency}-${payload.filters.dateFrom}_${payload.filters.dateTo}.pdf`

    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error: any) {
    console.error("Error in GET /api/reports/commissions/pdf:", error)
    return NextResponse.json(
      { error: "Error al generar el PDF del reporte" },
      { status: 500 }
    )
  }
}
