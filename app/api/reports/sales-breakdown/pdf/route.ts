import { NextResponse } from "next/server"
import { buildSalesBreakdownReportData } from "@/lib/reports/sales-breakdown-report-data"
import { resolveSalesBreakdownReportRequest } from "@/lib/reports/sales-breakdown-report-request"
import { loadReportCompany } from "@/lib/reports/report-company"
import { generateSalesBreakdownReportPdf } from "@/lib/pdf/sales-breakdown-report-pdf"

/**
 * GET /api/reports/sales-breakdown/pdf
 *
 * Descarga el Reporte de Ventas por producto como PDF. Mismos datos, filtros y
 * guards que `/api/reports/sales-breakdown`.
 */
export async function GET(request: Request) {
  try {
    const resolved = await resolveSalesBreakdownReportRequest(request)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }

    const [payload, company] = await Promise.all([
      buildSalesBreakdownReportData({
        supabase: resolved.supabase,
        orgId: resolved.orgId,
        agencyIds: resolved.agencyIds,
        ...resolved.params,
      }),
      loadReportCompany({ supabase: resolved.supabase, orgId: resolved.orgId }),
    ])

    const pdf = generateSalesBreakdownReportPdf({
      report: payload.report,
      filters: payload.filters,
      company,
    })

    const filename = `reporte-ventas-${payload.filters.currency}-${payload.filters.dateFrom}_${payload.filters.dateTo}.pdf`

    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error: any) {
    console.error("Error in GET /api/reports/sales-breakdown/pdf:", error)
    return NextResponse.json(
      { error: "Error al generar el PDF del reporte" },
      { status: 500 }
    )
  }
}
