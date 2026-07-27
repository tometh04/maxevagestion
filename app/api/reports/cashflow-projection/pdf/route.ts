import { NextResponse } from "next/server"
import { buildCashflowProjectionReportData } from "@/lib/reports/cashflow-projection-report-data"
import { resolveCashflowProjectionReportRequest } from "@/lib/reports/cashflow-projection-report-request"
import { loadReportCompany } from "@/lib/reports/report-company"
import { generateCashflowProjectionReportPdf } from "@/lib/pdf/cashflow-projection-report-pdf"

/**
 * GET /api/reports/cashflow-projection/pdf
 *
 * Descarga el Reporte de Caja como PDF. Mismos datos, filtros y guards que
 * `/api/reports/cashflow-projection`.
 */
export async function GET(request: Request) {
  try {
    const resolved = await resolveCashflowProjectionReportRequest(request)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }

    const [payload, company] = await Promise.all([
      buildCashflowProjectionReportData({
        supabase: resolved.supabase,
        orgId: resolved.orgId,
        agencyIds: resolved.agencyIds,
        ...resolved.params,
      }),
      loadReportCompany({ supabase: resolved.supabase, orgId: resolved.orgId }),
    ])

    const pdf = generateCashflowProjectionReportPdf({
      report: payload.report,
      filters: payload.filters,
      company,
    })

    const filename = `reporte-caja-${payload.report.today}.pdf`

    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error: any) {
    console.error("Error in GET /api/reports/cashflow-projection/pdf:", error)
    return NextResponse.json({ error: "Error al generar el PDF del reporte" }, { status: 500 })
  }
}
